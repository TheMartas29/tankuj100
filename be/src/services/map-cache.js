const TTL_MS = 60 * 1000;

let cached = null;

/**
 * Odpověď `/api/map/` je zdaleka nejdražší věc, kterou server dělá: přes tisíc
 * stanic a u každé čtyři korelované poddotazy na hodnocení a paliva. Přitom se
 * mění po kapkách – zapamatovat si hotový JSON na minutu ušetří prakticky všechnu
 * práci a uživatel rozdíl nepozná.
 *
 * Zápisy z API si cache zneplatní samy. Časový strop je tu kvůli importům z OSM,
 * které běží jako samostatný proces (`scripts/import-osm.js`) a do paměti serveru
 * nevidí – po nich se data srovnají nejpozději za minutu.
 */
function remember(build) {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;

  const value = build();
  cached = { value, at: now };
  return value;
}

function invalidate() {
  cached = null;
}

module.exports = { remember, invalidate, TTL_MS };
