const SOURCES = [
  require('./orlen'),
  require('./mol'),
  require('./omv'),
  require('./shell'),
  require('./eurooil'),
  require('./km-prona'),
  require('./one1'),
  require('./tank-ono'),
];

const bySlug = (slug) => SOURCES.find((source) => source.slug === slug) || null;

module.exports = { SOURCES, bySlug };
