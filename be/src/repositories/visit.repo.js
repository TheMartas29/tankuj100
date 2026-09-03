const { db } = require('../db');

const insertStatement = db.prepare(
  `INSERT INTO visit (path, visitor, device, os, browser, referrer, created_at)
   VALUES (@path, @visitor, @device, @os, @browser, @referrer, @createdAt)`
);

const insert = (row) => insertStatement.run(row);

/** Kolik návštěv za posledních `days` dní. `null` = od začátku. */
function hits(path, days = null) {
  const where = days ? "AND datetime(created_at) > datetime('now', ?)" : '';
  const sql = `SELECT COUNT(*) AS c FROM visit WHERE path = ? ${where}`;
  const args = days ? [path, `-${days} day`] : [path];
  return db.prepare(sql).get(...args).c;
}

/**
 * Kolik různých lidí – součet unikátních otisků **po dnech**. Sečíst `DISTINCT visitor`
 * přes celé období nejde: sůl se každý den mění, takže tentýž člověk má každý den jiný
 * otisk. Kdo přijde třikrát ve třech dnech, je proto ve výsledku třikrát; přesnější
 * číslo se bez trvalého sledování získat nedá a to tu schválně není.
 */
function visitors(path, days = null) {
  const where = days ? "AND datetime(created_at) > datetime('now', ?)" : '';
  const sql = `
    SELECT COALESCE(SUM(c), 0) AS c FROM (
      SELECT COUNT(DISTINCT visitor) AS c
        FROM visit
       WHERE path = ? ${where}
       GROUP BY date(created_at)
    )`;
  const args = days ? [path, `-${days} day`] : [path];
  return db.prepare(sql).get(...args).c;
}

/** Rozpad podle sloupce (zařízení, systém, prohlížeč) – od nejčastějšího. */
function breakdown(path, column, days = 30) {
  const allowed = ['device', 'os', 'browser'];
  if (!allowed.includes(column)) throw new Error(`Nepovolený sloupec: ${column}`);
  return db
    .prepare(
      `SELECT ${column} AS label, COUNT(*) AS count
         FROM visit
        WHERE path = ? AND datetime(created_at) > datetime('now', ?)
        GROUP BY ${column}
        ORDER BY count DESC, label`
    )
    .all(path, `-${days} day`);
}

/** Odkud lidé přišli. `NULL` znamená přímý vstup – odkaz z reklamy referrer často nemá. */
function referrers(path, days = 30, limit = 8) {
  return db
    .prepare(
      `SELECT COALESCE(referrer, 'přímo / bez odkazu') AS label, COUNT(*) AS count
         FROM visit
        WHERE path = ? AND datetime(created_at) > datetime('now', ?)
        GROUP BY label
        ORDER BY count DESC, label
        LIMIT ?`
    )
    .all(path, `-${days} day`, limit);
}

/** Denní řada pro malý graf – dny bez návštěvy v datech nejsou, doplní se v UI. */
function daily(path, days = 30) {
  return db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count
         FROM visit
        WHERE path = ? AND datetime(created_at) > datetime('now', ?)
        GROUP BY day
        ORDER BY day`
    )
    .all(path, `-${days} day`);
}

/**
 * Poslední návštěvy, jedna po druhé. `visitor` je **pseudonym platný jeden den** –
 * dá se podle něj poznat, že dvě dnešní návštěvy jsou od téhož člověka, ale zítra
 * má tentýž člověk jiný, takže napříč dny ho spojit nejde. Identita ani IP adresa
 * v datech nejsou vůbec.
 */
const recent = (path, limit = 200) =>
  db
    .prepare(
      `SELECT created_at, visitor, device, os, browser, referrer
         FROM visit
        WHERE path = ?
        ORDER BY id DESC
        LIMIT ?`
    )
    .all(path, limit);

/** Které cesty se vůbec kdy zaznamenaly – admin se tak nemusí ptát na konkrétní. */
const paths = () =>
  db.prepare('SELECT DISTINCT path FROM visit ORDER BY path').all().map((r) => r.path);

module.exports = { insert, hits, visitors, breakdown, referrers, daily, paths, recent };
