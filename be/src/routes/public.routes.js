const express = require('express');

const config = require('../config');
const { asyncHandler } = require('../http/async-handler');
const { perHour, perHourByIp, writeGuard } = require('../http/rate-limit');
const { requireAppKey } = require('../http/app-key');
const { parseStationId, requireDeviceId } = require('../validation/primitives');
const { parseReview, parseReport, parseFuelVote, parseStationRequest } = require('../validation/inputs');
const stationService = require('../services/station.service');
const reviewService = require('../services/review.service');
const reportService = require('../services/report.service');
const fuelVoteService = require('../services/fuel-vote.service');
const feedbackService = require('../services/feedback.service');
const stationRequestService = require('../services/station-request.service');

const router = express.Router();

// Čtení má vlastní strop. Klíč je jen IP (GET nemá device_id), a protože za jednou
// adresou mobilního operátora sedí spousta lidí, musí být hodně vysoko – má chytit
// rozjeté stahování, ne živého uživatele.
router.use(perHourByIp('public', 1200));
// Zápisy mají navíc vlastní, mnohem těsnější strop podle IP. Limity u jednotlivých
// endpointů níž se totiž počítají i na `device_id` z těla requestu – a to si klient
// vymýšlí sám, takže se dá měnit jako rukavice.
router.use(writeGuard(120));
router.use(requireAppKey);

const stationIdOf = (req) => parseStationId(req.params.id);
const queryDeviceId = (req) => (typeof req.query.device_id === 'string' ? req.query.device_id.trim() : '');

// Levé ověření klíče. Aplikace přes něj pozná, že zadaný kód platí, a hlavně
// od koho odpověď přišla – prostředí se tak nečte z lokálního nastavení, ale
// od serveru samotného.
router.get(
  '/ping',
  asyncHandler((req, res) => {
    res.json({ ok: true, env: config.envName });
  })
);

// `no-cache` neznamená „neukládat“, ale „před použitím se zeptej“. Aplikace tak pošle
// If-None-Match a na nezměněná data dostane 304 o dvou stech bajtech místo 131 kB.
router.get(
  '/map/',
  asyncHandler((req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('application/json').send(stationService.mapMarkersJSON());
  })
);

router.get(
  '/detail/:id',
  asyncHandler((req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(stationService.detail(stationIdOf(req)));
  })
);

router.get(
  '/stations/:id/feedback',
  asyncHandler((req, res) => {
    const stationId = stationIdOf(req);
    stationService.requireStation(stationId);
    // Odpověď obsahuje i vlastní hodnocení volajícího, tak ať se nikde neuloží.
    res.set('Cache-Control', 'no-store');
    res.json(feedbackService.forStation(stationId, queryDeviceId(req)));
  })
);

router.post(
  '/stations/:id/reviews',
  perHour('reviews', 15),
  asyncHandler((req, res) => {
    const station = stationService.requireStation(stationIdOf(req));
    const { created, review, rating } = reviewService.submit({ station, input: parseReview(req.body) });

    res.status(created ? 201 : 200).json({
      ok: true,
      message: created ? 'Díky za hodnocení!' : 'Hodnocení jsme aktualizovali.',
      review,
      rating,
    });
  })
);

router.delete(
  '/stations/:id/reviews',
  asyncHandler((req, res) => {
    const stationId = stationIdOf(req);
    stationService.requireStation(stationId);
    const rating = reviewService.withdraw(stationId, requireDeviceId(req.body));

    res.json({ ok: true, message: 'Hodnocení smazáno.', rating });
  })
);

router.post(
  '/stations/:id/reports',
  perHour('reports', 10),
  asyncHandler((req, res) => {
    const station = stationService.requireStation(stationIdOf(req));
    const report = reportService.submit({ station, input: parseReport(req.body) });

    res.status(201).json({
      ok: true,
      message: 'Díky! Hlášení jsme přijali a zkontrolujeme ho.',
      report_id: report.id,
    });
  })
);

router.post(
  '/stations/:id/fuel-vote',
  perHour('fuelvote', 40),
  asyncHandler((req, res) => {
    const stationId = stationIdOf(req);
    stationService.requireStation(stationId);
    const fuel = fuelVoteService.castVote(stationId, parseFuelVote(req.body));

    res.json({ ok: true, message: 'Díky, vaše info pomůže ostatním.', fuel });
  })
);

// Návrh nové benzínky. Stanice tímhle nevzniká – jen žádost, kterou ještě někdo
// ručně projde. Strop je nízko schválně: každou položku pak někdo musí ověřit.
router.post(
  '/station-requests',
  perHour('stationrequests', 10),
  asyncHandler((req, res) => {
    const request = stationRequestService.submit(parseStationRequest(req.body));

    res.status(201).json({
      ok: true,
      message: 'Díky! Benzínku ověříme a přidáme. V „Mých žádostech“ uvidíte, jak to dopadlo.',
      request_id: request.id,
      status: request.status,
    });
  })
);

router.get(
  '/station-requests',
  asyncHandler((req, res) => {
    // Odpověď patří jednomu zařízení a je v ní i důvod zamítnutí, tak ať se nikde
    // neuloží. `device_id` z query se ověřuje stejně jako v těle zápisů.
    res.set('Cache-Control', 'no-store');
    res.json(stationRequestService.listForDevice(requireDeviceId(req.query)));
  })
);

module.exports = router;
