const { db } = require('../db');
const { MIN_DECISIVE_VOTES, MAJORITY_RATIO } = require('../fuel-verdict');
const { OCTANE_98, OCTANE_100 } = require('./fragments');

const count = (sql) => db.prepare(sql).get().c;

function averageRating() {
  const row = db.prepare("SELECT AVG(rating) AS a FROM review WHERE status = 'published'").get();
  return row.a ? Number(row.a.toFixed(2)) : null;
}

/**
 * Veškerá aktivita zařízení na jedné hromadě. `device_id` je anonymní UUID z Keychainu
 * telefonu; posílá se **jen** s tím, co uživatel sám odešle, nikdy při pouhém spuštění.
 *
 * Proto tohle **nejsou aktivní uživatelé aplikace**, ale jen ti, kdo něco přispěli –
 * bývá to pár procent. Kdo appku denně používá a nikdy nic nenapsal, tady není vůbec
 * a nikdy nebude, dokud by se neposílal signál i bez příspěvku. Instalace a skutečné
 * aktivní zařízení umí říct jedině App Store Connect.
 *
 * U hodnocení a hlasů se bere pozdější z `created_at`/`updated_at`: úprava vlastního
 * hodnocení je taky aktivita a bez toho by se člověk, který se po půl roce vrátil
 * a hodnocení přepsal, počítal podle původního data.
 */
const DEVICE_ACTIVITY = `
  WITH activity(device_id, at) AS (
    SELECT device_id, MAX(created_at, updated_at) FROM review
    UNION ALL
    SELECT device_id, created_at FROM report
    UNION ALL
    SELECT device_id, MAX(created_at, updated_at) FROM fuel_vote
    UNION ALL
    SELECT device_id, created_at FROM station_request
  )`;

const METRICS = {
  stations: 'SELECT COUNT(*) AS c FROM station',
  stations98: `SELECT COUNT(*) AS c FROM station_fuel WHERE fuel_key = '${OCTANE_98}'`,
  stations100: `SELECT COUNT(*) AS c FROM station_fuel WHERE fuel_key = '${OCTANE_100}'`,
  stationsWithoutFuels:
    'SELECT COUNT(*) AS c FROM station s WHERE NOT EXISTS (SELECT 1 FROM station_fuel f WHERE f.station_id = s.id)',
  reviews: 'SELECT COUNT(*) AS c FROM review',
  reviewsHidden: "SELECT COUNT(*) AS c FROM review WHERE status = 'hidden'",
  ratingAverage: averageRating,
  reportsNew: "SELECT COUNT(*) AS c FROM report WHERE status = 'new'",
  reportsInReview: "SELECT COUNT(*) AS c FROM report WHERE status = 'in_review'",
  reportsTotal: 'SELECT COUNT(*) AS c FROM report',
  // Nevyřízené žádosti o přidání benzínky – karta „Žádosti“ v přehledu a odznak
  // u záložky. Bez téhle metriky by obojí ukazovalo navždy nulu.
  stationRequestsNew: "SELECT COUNT(*) AS c FROM station_request WHERE status = 'new'",
  stationRequestsTotal: 'SELECT COUNT(*) AS c FROM station_request',
  fuelVotes: 'SELECT COUNT(*) AS c FROM fuel_vote',
  // Stejné rozhodovací pravidlo jako fuelVerdict(), jen spočítané nad všemi stanicemi.
  stationsWithE5: `
    SELECT COUNT(*) AS c FROM (
      SELECT station_id, SUM(fuel_kind='e5') AS e5, SUM(fuel_kind='e10') AS e10
        FROM fuel_vote GROUP BY station_id
    ) WHERE e5 + e10 >= ${MIN_DECISIVE_VOTES}
        AND CAST(e5 AS REAL) / (e5 + e10) >= ${MAJORITY_RATIO}`,
  last7dReports: "SELECT COUNT(*) AS c FROM report WHERE datetime(created_at) > datetime('now','-7 day')",
  last7dReviews: "SELECT COUNT(*) AS c FROM review WHERE datetime(created_at) > datetime('now','-7 day')",

  // Zařízení, která kdy něco přispěla. Přeinstalace appky ID nemění (leží v Keychainu),
  // ale reset telefonu nebo druhý telefon téhož člověka ano – je to počet zařízení,
  // ne lidí, a spíš podhodnocený.
  devicesTotal: `${DEVICE_ACTIVITY}
    SELECT COUNT(DISTINCT device_id) AS c FROM activity WHERE device_id <> ''`,
  devicesLast30d: `${DEVICE_ACTIVITY}
    SELECT COUNT(DISTINCT device_id) AS c FROM activity
      WHERE device_id <> '' AND datetime(at) > datetime('now','-30 day')`,
  // Vracející se: první příspěvek starší než 90 dní a zároveň něco za poslední měsíc.
  // Jednorázový přispěvatel ani nováček se sem nedostanou – tohle je to číslo, které
  // říká, jestli si appku lidi nechávají.
  devicesReturning: `${DEVICE_ACTIVITY}
    SELECT COUNT(*) AS c FROM (
      SELECT device_id, MIN(at) AS first_at, MAX(at) AS last_at
        FROM activity WHERE device_id <> '' GROUP BY device_id
    ) WHERE datetime(first_at) < datetime('now','-90 day')
        AND datetime(last_at) > datetime('now','-30 day')`,
};

function overview() {
  const result = {};
  for (const [key, source] of Object.entries(METRICS)) {
    result[key] = typeof source === 'function' ? source() : count(source);
  }
  return result;
}

module.exports = { overview };
