// Admin API – všechno za basic auth (viz server.js).
//
// Slouží admin UI (be/index.html): přehled čísel, práce s hlášeními a hodnoceními
// a správa tabulky stanic.

const express = require('express');

const { stations, reviews, reports, stats } = require('../repo');
const { ValidationError, parseId, parseStationId, cleanText, REVIEW_STATUSES, REPORT_STATUSES } = require('../validate');
const { isConfigured, sendNotification } = require('../mailer');

const router = express.Router();

router.get('/stats', (req, res) => {
  res.json({ ...stats(), mail_configured: isConfigured() });
});

// ------------------------------------------------------------------ hlášení

router.get('/reports', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  if (status !== 'all' && !REPORT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'bad_request', message: 'Neznámý stav hlášení.' });
  }
  res.json(reports.listForAdmin({ status }));
});

router.patch('/reports/:id', (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'ID hlášení');
    const { status } = req.body || {};
    if (!REPORT_STATUSES.includes(status)) {
      throw new ValidationError(`Stav musí být jeden z: ${REPORT_STATUSES.join(', ')}.`, 'status');
    }
    const adminNote = cleanText(req.body?.admin_note, { max: 1000, field: 'admin_note', label: 'Poznámka' });
    const result = reports.setStatus(id, status, adminNote);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Hlášení nenalezeno.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/reports/:id', (req, res, next) => {
  try {
    const result = reports.remove(parseId(req.params.id, 'ID hlášení'));
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Hlášení nenalezeno.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ hodnocení

router.get('/reviews', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  if (status !== 'all' && !REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'bad_request', message: 'Neznámý stav hodnocení.' });
  }
  res.json(reviews.listForAdmin({ status }));
});

router.patch('/reviews/:id', (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'ID hodnocení');
    const { status } = req.body || {};
    if (!REVIEW_STATUSES.includes(status)) {
      throw new ValidationError(`Stav musí být jeden z: ${REVIEW_STATUSES.join(', ')}.`, 'status');
    }
    const result = reviews.setStatus(id, status);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Hodnocení nenalezeno.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/reviews/:id', (req, res, next) => {
  try {
    const result = reviews.remove(parseId(req.params.id, 'ID hodnocení'));
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Hodnocení nenalezeno.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ stanice

router.get('/stations', (req, res) => {
  res.json(stations.all());
});

router.post('/stations', (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.id == null || body.id === '') {
      throw new ValidationError('Stanice musí mít ID.', 'id');
    }
    const row = {
      id: Number(body.id),
      lat: body.lat === '' || body.lat == null ? null : Number(body.lat),
      lon: body.lon === '' || body.lon == null ? null : Number(body.lon),
      brand_name: body.brand_name ?? null,
      brand_id: body.brand_id === '' || body.brand_id == null ? null : Number(body.brand_id),
      name: body.name ?? null,
      city: body.city ?? null,
      address: body.address ?? null,
      zip: body.zip ?? null,
      phone: body.phone ?? null,
      worktime: body.worktime ?? null,
      services: body.services ?? null,
      payments: body.payments ?? null,
      foursquare_id: body.foursquare_id ?? null,
      wikimapia_id: body.wikimapia_id === '' || body.wikimapia_id == null ? null : Number(body.wikimapia_id),
      status: body.status ?? null,
      error: body.error ?? null,
    };
    if (!Number.isFinite(row.id)) throw new ValidationError('ID musí být číslo.', 'id');
    stations.upsert(row);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/stations/:id', (req, res, next) => {
  try {
    const result = stations.remove(parseStationId(req.params.id));
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Stanice nenalezena.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ test e-mailu

/** Ověření, že notifikace opravdu dojdou (tlačítko v adminu). */
router.post('/test-mail', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'mail_not_configured',
      message: 'E-mailové notifikace nejsou nastavené (chybí EMAILJS_* v .env).',
    });
  }
  const result = await sendNotification({
    subject: 'testovací notifikace',
    body: 'Tohle je test z adminu tankuj100. Když ti to dorazilo, notifikace fungují.',
  });
  if (!result.ok) {
    return res.status(502).json({
      error: 'mail_failed',
      message: `Odeslání selhalo: ${result.error || result.skipped}`,
    });
  }
  res.json({ ok: true, message: 'Testovací e-mail odeslán.' });
});

module.exports = router;
