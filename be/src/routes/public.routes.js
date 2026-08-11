const express = require('express');

const { asyncHandler } = require('../http/async-handler');
const { perHour } = require('../http/rate-limit');
const { parseStationId, requireDeviceId } = require('../validation/primitives');
const { parseReview, parseReport, parseFuelVote } = require('../validation/inputs');
const stationService = require('../services/station.service');
const reviewService = require('../services/review.service');
const reportService = require('../services/report.service');
const fuelVoteService = require('../services/fuel-vote.service');
const feedbackService = require('../services/feedback.service');

const router = express.Router();

const stationIdOf = (req) => parseStationId(req.params.id);
const queryDeviceId = (req) => (typeof req.query.device_id === 'string' ? req.query.device_id.trim() : '');

router.get(
  '/map/',
  asyncHandler((req, res) => {
    res.json(stationService.mapMarkers());
  })
);

router.get(
  '/detail/:id',
  asyncHandler((req, res) => {
    res.json(stationService.detail(stationIdOf(req)));
  })
);

router.get(
  '/stations/:id/feedback',
  asyncHandler((req, res) => {
    const stationId = stationIdOf(req);
    stationService.requireStation(stationId);
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

module.exports = router;
