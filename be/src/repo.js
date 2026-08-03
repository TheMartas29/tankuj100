// Datová vrstva – všechny SQL dotazy na jednom místě.
// Routy díky tomu zůstanou čitelné a nemíchá se v nich HTTP s SQL.

const { db } = require('./db');

const nowISO = () => new Date().toISOString();

// ------------------------------------------------------------------ stanice

const stations = {
  all: () => db.prepare('SELECT * FROM station ORDER BY brand_name, city').all(),

  /** Odlehčený seznam pro mapu v mobilu + agregované hodnocení a typ paliva.
   *
   * Agregace jsou schválně korelované podotázky, ne dva LEFT JOINy – ty by se
   * navzájem vynásobily (4 hodnocení × 2 hlasy = 8 „hodnocení“). */
  forMap: () =>
    db
      .prepare(
        `SELECT s.id, s.lat, s.lon, s.brand_name, s.brand_id, s.station_id,
                (SELECT ROUND(AVG(r.rating), 2) FROM review r
                  WHERE r.station_id = s.id AND r.status = 'published')      AS rating_avg,
                (SELECT COUNT(*) FROM review r
                  WHERE r.station_id = s.id AND r.status = 'published')      AS rating_count,
                (SELECT COUNT(*) FROM fuel_vote v
                  WHERE v.station_id = s.id AND v.fuel_kind = 'e5')          AS e5_votes,
                (SELECT COUNT(*) FROM fuel_vote v
                  WHERE v.station_id = s.id AND v.fuel_kind = 'e10')         AS e10_votes
           FROM station s`
      )
      .all(),

  byId: (id) => db.prepare('SELECT * FROM station WHERE id = ?').get(id),

  exists: (id) => Boolean(db.prepare('SELECT 1 FROM station WHERE id = ?').get(id)),

  remove: (id) => db.prepare('DELETE FROM station WHERE id = ?').run(id),

  upsert: (row) =>
    db
      .prepare(
        `INSERT INTO station (
            id, lat, lon, brand_name, brand_id, name,
            city, address, zip, phone, worktime,
            services, payments, foursquare_id,
            wikimapia_id, status, error
         ) VALUES (
            @id, @lat, @lon, @brand_name, @brand_id, @name,
            @city, @address, @zip, @phone, @worktime,
            @services, @payments, @foursquare_id,
            @wikimapia_id, @status, @error
         )
         ON CONFLICT(id) DO UPDATE SET
            lat=@lat, lon=@lon, brand_name=@brand_name, brand_id=@brand_id, name=@name,
            city=@city, address=@address, zip=@zip, phone=@phone, worktime=@worktime,
            services=@services, payments=@payments, foursquare_id=@foursquare_id,
            wikimapia_id=@wikimapia_id, status=@status, error=@error`
      )
      .run(row),
};

// ------------------------------------------------------------------ hodnocení

const reviews = {
  /** Publikované komentáře a hodnocení ke stanici, od nejnovějších. */
  listPublished: (stationId, limit = 50) =>
    db
      .prepare(
        `SELECT id, rating, comment, author, created_at
           FROM review
          WHERE station_id = ? AND status = 'published'
          ORDER BY datetime(created_at) DESC
          LIMIT ?`
      )
      .all(stationId, limit),

  /** Průměr, počet a rozložení hvězdiček. */
  summary: (stationId) => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count, AVG(rating) AS average,
                SUM(rating = 1) AS s1, SUM(rating = 2) AS s2, SUM(rating = 3) AS s3,
                SUM(rating = 4) AS s4, SUM(rating = 5) AS s5
           FROM review WHERE station_id = ? AND status = 'published'`
      )
      .get(stationId);
    return {
      count: row.count || 0,
      average: row.count ? Number(row.average.toFixed(2)) : null,
      distribution: { 1: row.s1 || 0, 2: row.s2 || 0, 3: row.s3 || 0, 4: row.s4 || 0, 5: row.s5 || 0 },
    };
  },

  mine: (stationId, deviceId) =>
    db
      .prepare(
        `SELECT id, rating, comment, author, status, created_at
           FROM review WHERE station_id = ? AND device_id = ?`
      )
      .get(stationId, deviceId),

  /** Vloží nebo přepíše hodnocení daného zařízení. Vrací uložený řádek. */
  upsert: ({ stationId, deviceId, rating, comment, author }) => {
    const ts = nowISO();
    db.prepare(
      `INSERT INTO review (station_id, device_id, rating, comment, author, status, created_at, updated_at)
       VALUES (@stationId, @deviceId, @rating, @comment, @author, 'published', @ts, @ts)
       ON CONFLICT(station_id, device_id) DO UPDATE SET
         rating = @rating, comment = @comment, author = @author, updated_at = @ts`
    ).run({ stationId, deviceId, rating, comment, author, ts });
    return db
      .prepare('SELECT * FROM review WHERE station_id = ? AND device_id = ?')
      .get(stationId, deviceId);
  },

  removeMine: (stationId, deviceId) =>
    db.prepare('DELETE FROM review WHERE station_id = ? AND device_id = ?').run(stationId, deviceId),

  // --- admin ---
  listForAdmin: ({ status, limit = 200 }) => {
    const where = status && status !== 'all' ? 'WHERE r.status = ?' : '';
    const params = status && status !== 'all' ? [status, limit] : [limit];
    return db
      .prepare(
        `SELECT r.*, s.brand_name, s.name AS station_name, s.city
           FROM review r LEFT JOIN station s ON s.id = r.station_id
           ${where}
          ORDER BY datetime(r.created_at) DESC LIMIT ?`
      )
      .all(...params);
  },

  setStatus: (id, status) =>
    db.prepare('UPDATE review SET status = ?, updated_at = ? WHERE id = ?').run(status, nowISO(), id),

  remove: (id) => db.prepare('DELETE FROM review WHERE id = ?').run(id),
};

// ------------------------------------------------------------------ reporty

const reports = {
  create: ({ stationId, deviceId, type, fuelName, claimedPrice, note }) => {
    const ts = nowISO();
    const info = db
      .prepare(
        `INSERT INTO report (station_id, device_id, type, fuel_name, claimed_price, note, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`
      )
      .run(stationId, deviceId, type, fuelName ?? null, claimedPrice ?? null, note ?? null, ts);
    return db.prepare('SELECT * FROM report WHERE id = ?').get(info.lastInsertRowid);
  },

  /** Kolik hlášení poslalo zařízení na tuhle stanici za posledních 24 h (proti duplicitám). */
  recentCountForDevice: (stationId, deviceId) =>
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM report
          WHERE station_id = ? AND device_id = ?
            AND datetime(created_at) > datetime('now', '-1 day')`
      )
      .get(stationId, deviceId).c,

  openCountForStation: (stationId) =>
    db
      .prepare(`SELECT COUNT(*) AS c FROM report WHERE station_id = ? AND status IN ('new','in_review')`)
      .get(stationId).c,

  // --- admin ---
  listForAdmin: ({ status, limit = 200 }) => {
    const where = status && status !== 'all' ? 'WHERE r.status = ?' : '';
    const params = status && status !== 'all' ? [status, limit] : [limit];
    return db
      .prepare(
        `SELECT r.*, s.brand_name, s.name AS station_name, s.city, s.address, s.zip, s.lat, s.lon
           FROM report r LEFT JOIN station s ON s.id = r.station_id
           ${where}
          ORDER BY datetime(r.created_at) DESC LIMIT ?`
      )
      .all(...params);
  },

  setStatus: (id, status, adminNote) => {
    const resolvedAt = status === 'resolved' || status === 'rejected' ? nowISO() : null;
    return db
      .prepare('UPDATE report SET status = ?, admin_note = COALESCE(?, admin_note), resolved_at = ? WHERE id = ?')
      .run(status, adminNote ?? null, resolvedAt, id);
  },

  remove: (id) => db.prepare('DELETE FROM report WHERE id = ?').run(id),
};

// ------------------------------------------------------------------ typ paliva (E5/E10)

/**
 * Z hlasů udělá verdikt. Hlasy "nevím" nerozhodují, jen ukazují nejistotu.
 *  - unconfirmed: málo dat (méně než 2 rozhodné hlasy)
 *  - e5 / e10:    aspoň 60 % rozhodných hlasů se shoduje
 *  - disputed:    hlasy se rozcházejí
 */
function fuelVerdict({ e5 = 0, e10 = 0 }) {
  const decisive = e5 + e10;
  if (decisive < 2) return 'unconfirmed';
  const ratio = e5 / decisive;
  if (ratio >= 0.6) return 'e5';
  if (ratio <= 0.4) return 'e10';
  return 'disputed';
}

const fuelVotes = {
  summary: (stationId) => {
    const row = db
      .prepare(
        `SELECT SUM(fuel_kind = 'e5') AS e5, SUM(fuel_kind = 'e10') AS e10,
                SUM(fuel_kind = 'unknown') AS unknown
           FROM fuel_vote WHERE station_id = ?`
      )
      .get(stationId);
    const counts = { e5: row.e5 || 0, e10: row.e10 || 0, unknown: row.unknown || 0 };
    return { ...counts, total: counts.e5 + counts.e10 + counts.unknown, verdict: fuelVerdict(counts) };
  },

  mine: (stationId, deviceId) =>
    db.prepare('SELECT fuel_kind FROM fuel_vote WHERE station_id = ? AND device_id = ?').get(stationId, deviceId),

  upsert: ({ stationId, deviceId, fuelKind }) => {
    const ts = nowISO();
    db.prepare(
      `INSERT INTO fuel_vote (station_id, device_id, fuel_kind, created_at, updated_at)
       VALUES (@stationId, @deviceId, @fuelKind, @ts, @ts)
       ON CONFLICT(station_id, device_id) DO UPDATE SET fuel_kind = @fuelKind, updated_at = @ts`
    ).run({ stationId, deviceId, fuelKind, ts });
  },
};

// ------------------------------------------------------------------ statistiky pro admin

const stats = () => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  return {
    stations: one('SELECT COUNT(*) AS c FROM station').c,
    reviews: one('SELECT COUNT(*) AS c FROM review').c,
    reviewsHidden: one("SELECT COUNT(*) AS c FROM review WHERE status = 'hidden'").c,
    ratingAverage: (() => {
      const r = one("SELECT AVG(rating) AS a FROM review WHERE status = 'published'");
      return r.a ? Number(r.a.toFixed(2)) : null;
    })(),
    reportsNew: one("SELECT COUNT(*) AS c FROM report WHERE status = 'new'").c,
    reportsInReview: one("SELECT COUNT(*) AS c FROM report WHERE status = 'in_review'").c,
    reportsTotal: one('SELECT COUNT(*) AS c FROM report').c,
    fuelVotes: one('SELECT COUNT(*) AS c FROM fuel_vote').c,
    stationsWithE5: db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
           SELECT station_id, SUM(fuel_kind='e5') AS e5, SUM(fuel_kind='e10') AS e10
             FROM fuel_vote GROUP BY station_id
         ) WHERE e5 + e10 >= 2 AND CAST(e5 AS REAL) / (e5 + e10) >= 0.6`
      )
      .get().c,
    last7dReports: one(
      "SELECT COUNT(*) AS c FROM report WHERE datetime(created_at) > datetime('now','-7 day')"
    ).c,
    last7dReviews: one(
      "SELECT COUNT(*) AS c FROM review WHERE datetime(created_at) > datetime('now','-7 day')"
    ).c,
  };
};

module.exports = { stations, reviews, reports, fuelVotes, fuelVerdict, stats, nowISO };
