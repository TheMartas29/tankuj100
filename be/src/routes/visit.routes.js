const express = require('express');

const config = require('../config');
const { asyncHandler } = require('../http/async-handler');
const visitService = require('../services/visit.service');

const router = express.Router();

/** Které adresy se počítají. Cizí hodnotu nepřijímáme, ať se do statistik nedá nasypat cokoli. */
const COUNTED_PATHS = new Set(['/stahnout']);

/**
 * Zaznamenání návštěvy kampaňové adresy. **Nevolá to prohlížeč, ale nginx** – ten při
 * doručení stránky pošle stranou (`mirror`) tenhle požadavek. Návštěvník o něm neví
 * a hlavně na něj nečeká: mirror běží mimo jeho odpověď, takže i kdyby backend ležel,
 * stránka se doručí normálně.
 *
 * Odpověď je vždycky prázdná 204 – nginx ji zahazuje. Když něco nesedí, vrací se taky
 * 204, ne chyba: tenhle endpoint nemá komu co hlásit a různé stavové kódy by jen
 * prozrazovaly, jak funguje.
 */
router.get(
  '/',
  asyncHandler((req, res) => {
    res.status(204);

    // Bez tajemství se nepočítá vůbec – viz `visitToken` v konfiguraci.
    if (!config.visitToken) return res.end();
    if (req.get('X-Visit-Token') !== config.visitToken) return res.end();

    const path = String(req.query.path || '');
    if (!COUNTED_PATHS.has(path)) return res.end();

    visitService.record({
      path,
      ip: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      referrer: req.get('Referer') || '',
    });

    return res.end();
  })
);

module.exports = router;
module.exports.COUNTED_PATHS = COUNTED_PATHS;
