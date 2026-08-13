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

const listForAdmin = () =>
  fuelVoteRepo.listVotedStations().map((row) => {
    const counts = { e5: row.e5 || 0, e10: row.e10 || 0 };
    return {
      ...row,
      ...counts,
      total: counts.e5 + counts.e10,
      verdict: fuelVerdict(counts),
    };
  });

module.exports = { summary, kindVotedByDevice, castVote, listForAdmin };
