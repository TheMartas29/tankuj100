// Jednoduchý in-memory rate limit (sliding window) pro veřejné POST endpointy.
//
// Backend běží jako jeden PM2 proces, takže paměť stačí – nepotřebujeme Redis.
// Cíl není dokonalá ochrana, ale zabránit tomu, aby jedno zařízení nebo jedna IP
// zaplavila databázi hodnoceními a reporty.

const buckets = new Map();

// Občasný úklid, ať nám Map neroste do nekonečna.
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < 60 * 60 * 1000);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}, 10 * 60 * 1000).unref();

/**
 * Vytvoří middleware omezující počet requestů.
 * @param {object} opts
 * @param {number} opts.max      maximální počet požadavků v okně
 * @param {number} opts.windowMs délka okna v ms
 * @param {string} opts.name     jmenný prostor (aby se limity endpointů nemíchaly)
 */
function rateLimit({ max, windowMs, name }) {
  return (req, res, next) => {
    // Klíčujeme podle IP i device_id – jedno zařízení nesmí obejít limit přes VPN
    // a jedna IP (např. mobilní NAT) nesmí zablokovat všechny za ní.
    const device = (req.body && req.body.device_id) || '';
    const key = `${name}:${req.ip}:${device}`;
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);

    if (hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'too_many_requests',
        message: 'Zkoušíš to moc často. Dej tomu chvilku a zkus to znovu.',
        retry_after: retryAfter,
      });
    }

    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

module.exports = { rateLimit };
