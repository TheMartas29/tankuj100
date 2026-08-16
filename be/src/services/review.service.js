const reviewRepo = require('../repositories/review.repo');
const { NotFoundError } = require('../errors');
const { notifyNewReview } = require('../mailer');
const mapCache = require('./map-cache');

const NOTIFY_RATING_THRESHOLD = 2;

const summary = (stationId) => reviewRepo.summary(stationId);

function submit({ station, input }) {
  const stationId = station.id;
  const created = !reviewRepo.findByDevice(stationId, input.deviceId);
  const review = reviewRepo.upsert({ stationId, ...input });
  // Průměr hodnocení jede i do mapy, takže uložená odpověď mapy je teď neplatná.
  mapCache.invalidate();

  if (created && (review.comment || review.rating <= NOTIFY_RATING_THRESHOLD)) {
    notifyNewReview({ review, station }).catch(() => {});
  }

  return { created, review, rating: summary(stationId) };
}

function withdraw(stationId, deviceId) {
  if (reviewRepo.removeByDevice(stationId, deviceId).changes === 0) {
    throw new NotFoundError('Žádné vaše hodnocení jsme nenašli.');
  }
  mapCache.invalidate();
  return summary(stationId);
}

const listForAdmin = (status) => reviewRepo.listForAdmin({ status });

function setStatus(id, status) {
  if (reviewRepo.setStatus(id, status).changes === 0) {
    throw new NotFoundError('Hodnocení nenalezeno.');
  }
  mapCache.invalidate();
}

function remove(id) {
  if (reviewRepo.remove(id).changes === 0) {
    throw new NotFoundError('Hodnocení nenalezeno.');
  }
  mapCache.invalidate();
}

module.exports = { summary, submit, withdraw, listForAdmin, setStatus, remove };
