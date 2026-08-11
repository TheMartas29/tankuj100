const OCTANE_98 = 'octane_98';
const OCTANE_100 = 'octane_100';

const hasFuel = (fuelKey) =>
  `EXISTS (SELECT 1 FROM station_fuel f WHERE f.station_id = s.id AND f.fuel_key = '${fuelKey}')`;

const PREMIUM_FUEL_COLUMNS = `${hasFuel(OCTANE_98)} AS has_98, ${hasFuel(OCTANE_100)} AS has_100`;

// Korelované poddotazy, ne LEFT JOINy – ty by se navzájem vynásobily a stanice se
// 4 hodnoceními a 2 palivy by hlásila 8 hodnocení.
const publishedReviewAggregate = (expression) =>
  `(SELECT ${expression} FROM review r WHERE r.station_id = s.id AND r.status = 'published')`;

// Oktan se čte z klíče samotného ('octane_100' → substr od 8. znaku), číselný sloupec
// tabulka nemá.
const FUEL_ORDER = `
  CASE
    WHEN fuel_key LIKE 'octane\\_%' ESCAPE '\\' THEN 1
    WHEN fuel_key LIKE '%diesel%'               THEN 2
    WHEN fuel_key IN ('lpg','cng','lng','hydrogen') THEN 3
    ELSE 4
  END,
  CAST(substr(fuel_key, 8) AS INTEGER) DESC,
  fuel_key`;

function statusCondition(status) {
  const active = Boolean(status) && status !== 'all';
  return {
    where: active ? 'WHERE r.status = ?' : '',
    params: active ? [status] : [],
  };
}

module.exports = {
  OCTANE_98,
  OCTANE_100,
  PREMIUM_FUEL_COLUMNS,
  publishedReviewAggregate,
  FUEL_ORDER,
  statusCondition,
};
