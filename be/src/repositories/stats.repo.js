const { db } = require('../db');
const { MIN_DECISIVE_VOTES, MAJORITY_RATIO } = require('../fuel-verdict');
const { OCTANE_98, OCTANE_100 } = require('./fragments');

const count = (sql) => db.prepare(sql).get().c;

function averageRating() {
  const row = db.prepare("SELECT AVG(rating) AS a FROM review WHERE status = 'published'").get();
  return row.a ? Number(row.a.toFixed(2)) : null;
}

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
};

function overview() {
  const result = {};
  for (const [key, source] of Object.entries(METRICS)) {
    result[key] = typeof source === 'function' ? source() : count(source);
  }
  return result;
}

module.exports = { overview };
