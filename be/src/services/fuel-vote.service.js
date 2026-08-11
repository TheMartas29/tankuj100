const fuelVoteRepo = require('../repositories/fuel-vote.repo');
const { fuelVerdict } = require('../fuel-verdict');

function summary(stationId) {
  const counts = fuelVoteRepo.countsForStation(stationId);
  return { ...counts, total: counts.e5 + counts.e10, verdict: fuelVerdict(counts) };
}

const kindVotedByDevice = (stationId, deviceId) =>
  fuelVoteRepo.findByDevice(stationId, deviceId)?.fuel_kind || null;

function castVote(stationId, input) {
  fuelVoteRepo.upsert({ stationId, ...input });
  return summary(stationId);
}

module.exports = { summary, kindVotedByDevice, castVote };
