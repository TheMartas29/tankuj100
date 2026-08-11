const reviewRepo = require('../repositories/review.repo');
const { NotFoundError } = require('../errors');
const { notifyNewReview } = require('../mailer');

const NOTIFY_RATING_THRESHOLD = 2;

const summary = (stationId) => reviewRepo.summary(stationId);

function submit({ station, input }) {
  const stationId = station.id;
  const created = !reviewRepo.findByDevice(stationId, input.deviceId);
  const review = reviewRepo.upsert({ stationId, ...input });

  if (created && (review.comment || review.rating <= NOTIFY_RATING_THRESHOLD)) {
    notifyNewReview({ review, station }).catch(() => {});
  }

  return { created, review, rating: summary(stationId) };
}

function withdraw(stationId, deviceId) {
  if (reviewRepo.removeByDevice(stationId, deviceId).changes === 0) {
    throw new NotFoundError('Žádné vaše hodnocení jsme nenašli.');
  }
  return summary(stationId);
}

const listForAdmin = (status) => reviewRepo.listForAdmin({ status });

function setStatus(id, status) {
  if (reviewRepo.setStatus(id, status).changes === 0) {
    throw new NotFoundError('Hodnocení nenalezeno.');
  }
}

function remove(id) {
  if (reviewRepo.remove(id).changes === 0) {
    throw new NotFoundError('Hodnocení nenalezeno.');
  }
}

module.exports = { summary, submit, withdraw, listForAdmin, setStatus, remove };
