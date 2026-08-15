const HOUR_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < HOUR_MS);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}, CLEANUP_INTERVAL_MS).unref();

// Klíč je IP i device_id zároveň: jedno zařízení nesmí limit obejít přes VPN a jedna IP
// (mobilní NAT) nesmí zablokovat všechny za ní. Paměť stačí, backend je jeden PM2 proces.
function rateLimit({ max, windowMs, name, byIpOnly = false }) {
  return (req, res, next) => {
    const device = byIpOnly ? '' : (req.body && req.body.device_id) || '';
    const key = `${name}:${req.ip}:${device}`;
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);

    if (hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'too_many_requests',
        message: 'Zkoušíte to příliš často. Dejte tomu chvilku a zkuste to znovu.',
        retry_after: retryAfter,
      });
    }

    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

const perHour = (name, max) => rateLimit({ name, max, windowMs: HOUR_MS });
const perHourByIp = (name, max) => rateLimit({ name, max, windowMs: HOUR_MS, byIpOnly: true });

module.exports = { perHour, perHourByIp };
