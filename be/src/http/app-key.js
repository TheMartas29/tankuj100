const { appKey } = require('../config');

const REPORT_INTERVAL_MS = 60 * 60 * 1000;

let missing = 0;
let lastReport = Date.now();

/**
 * Kontrola klíče aplikace. Klíč NENÍ tajemství – kdokoli si ho vytáhne z binárky
 * aplikace. Jeho smysl je odfiltrovat náhodné boty a `curl`, ne odolat útočníkovi.
 *
 * Režim `soft` je kvůli zpětné kompatibilitě: starší build aplikace klíč neposílá,
 * a než se všichni překlikají na novou verzi, request bez klíče musí projít. Kolik
 * jich je, se jednou za hodinu vypíše do logu – až bude číslo nula, jde přepnout
 * na `hard`.
 */
function requireAppKey(req, res, next) {
  if (appKey.mode === 'off') return next();

  const sent = req.get('X-App-Key') || '';
  if (sent && sent === appKey.value) return next();

  if (appKey.mode === 'soft') {
    missing += 1;
    if (Date.now() - lastReport > REPORT_INTERVAL_MS) {
      console.warn(`[app-key] Za poslední hodinu prošlo ${missing} requestů bez platného klíče.`);
      missing = 0;
      lastReport = Date.now();
    }
    return next();
  }

  return res.status(401).json({
    error: 'app_key_required',
    message: 'Tahle verze aplikace už nefunguje. Aktualizujte ji prosím v App Storu.',
  });
}

module.exports = { requireAppKey };
