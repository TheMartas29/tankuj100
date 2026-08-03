// Veřejné API pro mobilní aplikaci.
//
// Zásady:
//  * odpovědi jsou stabilní JSON s předvídatelnými klíči (iOS je dekóduje jako Codable),
//  * chybové odpovědi mají vždy { error, message } – `message` je česky a jde ji
//    uživateli ukázat rovnou v alertu,
//  * zápisové endpointy mají rate-limit a validaci, aby se do DB nedostal nesmysl.

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const { stations, reviews, reports, fuelVotes, fuelVerdict } = require('../repo');
const { rateLimit } = require('../ratelimit');
const { notifyNewReport, notifyNewReview } = require('../mailer');
const {
  ValidationError,
  parseStationId,
  parseReview,
  parseReport,
  parseFuelVote,
  requireDeviceId,
} = require('../validate');

const router = express.Router();

// Kolik hlášení od jednoho zařízení k jedné stanici bereme za den (pak je to spam).
const MAX_REPORTS_PER_STATION_PER_DAY = 3;

/** Načte stanici nebo skončí 404 s českou hláškou. */
function loadStation(id) {
  const station = stations.byId(id);
  if (!station) {
    const err = new ValidationError('Tuhle benzínku už v databázi nemáme. Zkus aplikaci obnovit.', 'station_id');
    err.statusCode = 404;
    throw err;
  }
  return station;
}

// ------------------------------------------------------------------ mapa a detail

router.get('/map/', (req, res) => {
  const rows = stations.forMap().map((r) => ({
    id: r.id,
    lat: r.lat,
    lon: r.lon,
    brand_name: r.brand_name,
    brand_id: r.brand_id,
    station_id: r.station_id,
    rating_avg: r.rating_count ? r.rating_avg : null,
    rating_count: r.rating_count || 0,
    // Odznak "tady je E5" pro seznam i mapu – bez nutnosti dotahovat detail.
    fuel_verdict: fuelVerdict({ e5: r.e5_votes || 0, e10: r.e10_votes || 0 }),
  }));
  res.json(rows);
});

router.get('/detail/:id', (req, res, next) => {
  try {
    res.json(loadStation(parseStationId(req.params.id)));
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ ceny paliv (scraper)

function parseFuelPrices(html) {
  const $ = cheerio.load(html);
  const fuels = [];
  $('tr[itemscope][itemtype="http://schema.org/Product"]').each((_, el) => {
    const name = $(el).find('[itemprop="name"]').text().trim();
    const price = $(el).find('[itemprop="price"]').attr('content');
    const currency = $(el).find('[itemprop="priceCurrency"]').attr('content') || 'CZK';
    if (name && price) fuels.push({ name, price: parseFloat(price), currency, unit: 'CZK/l' });
  });
  return fuels;
}

// Ceny se mění po dnech, ne po sekundách – krátká paměťová cache ušetří fuelo.net
// i naši odezvu, a když je zdroj dočasně nedostupný, radši vrátíme starší cenu.
const priceCache = new Map();
const PRICE_TTL_MS = 15 * 60 * 1000;

router.get('/fuel-prices/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'bad_request', message: 'Neplatné ID benzínky.' });
  }

  const cached = priceCache.get(id);
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) {
    return res.json(cached.fuels);
  }

  try {
    const response = await axios.get(`https://be.fuelo.net/gasstation/id/${id}`, { timeout: 10000 });
    const fuels = parseFuelPrices(response.data);
    if (fuels.length === 0) {
      // Bez cen to není chyba aplikace – stanice je prostě nemá vyplněné.
      priceCache.set(id, { at: Date.now(), fuels: [] });
      return res.json([]);
    }
    priceCache.set(id, { at: Date.now(), fuels });
    res.json(fuels);
  } catch (err) {
    console.error(`[prices] ${id}: ${err.message}`);
    if (cached) return res.json(cached.fuels); // vrať poslední známé ceny
    res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Ceny paliv se teď nepodařilo načíst. Zkus to prosím později.',
    });
  }
});

// ------------------------------------------------------------------ hodnocení + reporty + palivo

/** Vše, co detail stanice potřebuje k feedbacku, v jednom requestu. */
router.get('/stations/:id/feedback', (req, res, next) => {
  try {
    const stationId = parseStationId(req.params.id);
    loadStation(stationId);
    const deviceId = typeof req.query.device_id === 'string' ? req.query.device_id.trim() : '';

    res.json({
      station_id: stationId,
      rating: reviews.summary(stationId),
      reviews: reviews.listPublished(stationId),
      fuel: fuelVotes.summary(stationId),
      open_reports: reports.openCountForStation(stationId),
      mine: deviceId
        ? {
            review: reviews.mine(stationId, deviceId) || null,
            fuel_kind: fuelVotes.mine(stationId, deviceId)?.fuel_kind || null,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/stations/:id/reviews',
  rateLimit({ name: 'reviews', max: 15, windowMs: 60 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const stationId = parseStationId(req.params.id);
      const station = loadStation(stationId);
      const input = parseReview(req.body);

      const isNew = !reviews.mine(stationId, input.deviceId);
      const saved = reviews.upsert({ stationId, ...input });

      // Notifikace jen když je co moderovat / řešit: komentář nebo slabé hodnocení.
      if (isNew && (saved.comment || saved.rating <= 2)) {
        notifyNewReview({ review: saved, station }).catch(() => {});
      }

      res.status(isNew ? 201 : 200).json({
        ok: true,
        message: isNew ? 'Díky za hodnocení!' : 'Hodnocení jsme aktualizovali.',
        review: saved,
        rating: reviews.summary(stationId),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/stations/:id/reviews', (req, res, next) => {
  try {
    const stationId = parseStationId(req.params.id);
    loadStation(stationId);
    const deviceId = requireDeviceId(req.body);
    const result = reviews.removeMine(stationId, deviceId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Žádné tvoje hodnocení jsme nenašli.' });
    }
    res.json({ ok: true, message: 'Hodnocení smazáno.', rating: reviews.summary(stationId) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/stations/:id/reports',
  rateLimit({ name: 'reports', max: 10, windowMs: 60 * 60 * 1000 }),
  (req, res, next) => {
    try {
      const stationId = parseStationId(req.params.id);
      const station = loadStation(stationId);
      const input = parseReport(req.body);

      if (reports.recentCountForDevice(stationId, input.deviceId) >= MAX_REPORTS_PER_STATION_PER_DAY) {
        return res.status(429).json({
          error: 'too_many_reports',
          message: 'Tuhle benzínku už jsi dnes nahlásil. Díky, koukneme na to.',
        });
      }

      const report = reports.create({ stationId, ...input });
      notifyNewReport({ report, station }).catch(() => {});

      res.status(201).json({
        ok: true,
        message: 'Díky! Hlášení jsme přijali a zkontrolujeme ho.',
        report_id: report.id,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/stations/:id/fuel-vote',
  rateLimit({ name: 'fuelvote', max: 40, windowMs: 60 * 60 * 1000 }),
  (req, res, next) => {
    try {
      const stationId = parseStationId(req.params.id);
      loadStation(stationId);
      const input = parseFuelVote(req.body);
      fuelVotes.upsert({ stationId, ...input });
      res.json({
        ok: true,
        message: 'Díky, tvoje info pomůže ostatním.',
        fuel: fuelVotes.summary(stationId),
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
