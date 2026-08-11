const reviewRepo = require('../repositories/review.repo');
const reviewService = require('./review.service');
const reportService = require('./report.service');
const fuelVoteService = require('./fuel-vote.service');

function forStation(stationId, deviceId) {
  return {
    station_id: stationId,
    rating: reviewService.summary(stationId),
    reviews: reviewRepo.listPublished(stationId),
    fuel: fuelVoteService.summary(stationId),
    open_reports: reportService.countOpenForStation(stationId),
    mine: deviceId
      ? {
          review: reviewRepo.findByDevice(stationId, deviceId) || null,
          fuel_kind: fuelVoteService.kindVotedByDevice(stationId, deviceId),
        }
      : null,
  };
}

module.exports = { forStation };
