const express = require('express');

const { AppError } = require('../errors');
const { asyncHandler } = require('../http/async-handler');
const { parseId, parseStationId } = require('../validation/primitives');
const {
  parseStatusUpdate,
  parseStatusFilter,
  REVIEW_STATUSES,
  REPORT_STATUSES,
} = require('../validation/inputs');
const stationService = require('../services/station.service');
const reviewService = require('../services/review.service');
const reportService = require('../services/report.service');
const statsService = require('../services/stats.service');
const fuelVoteService = require('../services/fuel-vote.service');
const { isConfigured, sendNotification } = require('../mailer');

const router = express.Router();

const OK = { ok: true };

function requireStatusFilter(req, allowed, label) {
  const status = parseStatusFilter(req.query.status, allowed);
  if (status === null) throw new AppError(`Neznámý stav ${label}.`, { status: 400, code: 'bad_request' });
  return status;
}

router.get(
  '/stats',
  asyncHandler((req, res) => {
    res.json(statsService.adminOverview());
  })
);

router.get(
  '/reports',
  asyncHandler((req, res) => {
    res.json(reportService.listForAdmin(requireStatusFilter(req, REPORT_STATUSES, 'hlášení')));
  })
);

router.patch(
  '/reports/:id',
  asyncHandler((req, res) => {
    const id = parseId(req.params.id, 'ID hlášení');
    const status = parseStatusUpdate(req.body, REPORT_STATUSES);
    reportService.setStatus(id, status, req.body?.admin_note);
    res.json(OK);
  })
);

router.delete(
  '/reports/:id',
  asyncHandler((req, res) => {
    reportService.remove(parseId(req.params.id, 'ID hlášení'));
    res.json(OK);
  })
);

router.get(
  '/reviews',
  asyncHandler((req, res) => {
    res.json(reviewService.listForAdmin(requireStatusFilter(req, REVIEW_STATUSES, 'hodnocení')));
  })
);

router.patch(
  '/reviews/:id',
  asyncHandler((req, res) => {
    const id = parseId(req.params.id, 'ID hodnocení');
    reviewService.setStatus(id, parseStatusUpdate(req.body, REVIEW_STATUSES));
    res.json(OK);
  })
);

router.delete(
  '/reviews/:id',
  asyncHandler((req, res) => {
    reviewService.remove(parseId(req.params.id, 'ID hodnocení'));
    res.json(OK);
  })
);

router.get(
  '/stations',
  asyncHandler((req, res) => {
    res.json(stationService.listForAdmin());
  })
);

router.post(
  '/stations',
  asyncHandler((req, res) => {
    stationService.save(req.body);
    res.json(OK);
  })
);

router.delete(
  '/stations/:id',
  asyncHandler((req, res) => {
    stationService.remove(parseStationId(req.params.id));
    res.json(OK);
  })
);

router.get(
  '/fuel-votes',
  asyncHandler((req, res) => {
    res.json(fuelVoteService.listForAdmin());
  })
);

router.post(
  '/test-mail',
  asyncHandler(async (req, res) => {
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
  })
);

module.exports = router;
