const MIN_DECISIVE_VOTES = 2;
const MAJORITY_RATIO = 0.6;

function fuelVerdict({ e5 = 0, e10 = 0 }) {
  const decisive = e5 + e10;
  if (decisive < MIN_DECISIVE_VOTES) return 'unconfirmed';

  const ratio = e5 / decisive;
  if (ratio >= MAJORITY_RATIO) return 'e5';
  if (ratio <= 1 - MAJORITY_RATIO) return 'e10';
  return 'disputed';
}

module.exports = { fuelVerdict, MIN_DECISIVE_VOTES, MAJORITY_RATIO };
