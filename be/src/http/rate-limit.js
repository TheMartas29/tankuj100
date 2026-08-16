const { createAttemptLog } = require('./attempt-log');

const HOUR_MS = 60 * 60 * 1000;

const log = createAttemptLog({ windowMs: HOUR_MS, maxKeys: 20000 });

/**
 * Klíč je IP i device_id zároveň: jedno zařízení nesmí limit obejít přes VPN a jedna IP
 * (mobilní NAT) nesmí zablokovat všechny za ní.
 *
 * Pozor na to, že `device_id` si posílá klient sám. Limit vázaný na něj tedy drží
 * poctivou aplikaci, ale kdo si ho generuje náhodně, projde kolem. Proto nad ním
 * ještě stojí strop čistě podle IP (`writeGuard` níž) – ten obejít nejde.
 */
function rateLimit({ max, windowMs, name, byIpOnly = false }) {
  return (req, res, next) => {
    const device = byIpOnly ? '' : (req.body && req.body.device_id) || '';
    const key = `${name}:${req.ip}:${device}`;
    const now = Date.now();
    const hits = log.hits(key, now);

    if (hits.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'too_many_requests',
        message: 'Zkoušíte to příliš často. Dejte tomu chvilku a zkuste to znovu.',
        retry_after: retryAfter,
      });
    }

    log.add(key, now);
    next();
  };
}

const perHour = (name, max) => rateLimit({ name, max, windowMs: HOUR_MS });
const perHourByIp = (name, max) => rateLimit({ name, max, windowMs: HOUR_MS, byIpOnly: true });

/**
 * Strop na zápisy podle samotné IP. Čtení se nepočítá – to má vlastní, mnohem
 * vyšší limit. Sto dvacet zápisů za hodinu poctivý uživatel nevyčerpá ani omylem
 * (běžně jich udělá jednotky), spamovacímu skriptu to ale sebere řád.
 */
function writeGuard(max) {
  const guard = perHourByIp('writes', max);
  return (req, res, next) => (req.method === 'GET' ? next() : guard(req, res, next));
}

module.exports = { perHour, perHourByIp, writeGuard };
