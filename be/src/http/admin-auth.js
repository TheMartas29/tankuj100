const crypto = require('crypto');

const { admin } = require('../config');
const { createAttemptLog } = require('./attempt-log');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const failures = createAttemptLog({ windowMs: WINDOW_MS, maxKeys: 5000 });

const disabled = (req, res) =>
  res.status(503).json({
    error: 'admin_disabled',
    message: 'Administrace není nastavená (chybí ADMIN_USERNAME a ADMIN_PASSWORD v .env).',
  });

/**
 * Porovnání v konstantním čase. `timingSafeEqual` vyžaduje stejně dlouhé buffery
 * a hodil by výjimku – hash má vždy 32 bajtů, takže tím délku schováme i před
 * útočníkem, který by ji jinak vyčetl z doby odpovědi.
 */
const digest = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();
const equals = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function credentials(req) {
  const [scheme, encoded] = (req.get('Authorization') || '').split(' ');
  if (!/^Basic$/i.test(scheme || '') || !encoded) return null;

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;

  return { name: decoded.slice(0, colon), pass: decoded.slice(colon + 1) };
}

function challenge(res) {
  res.set('WWW-Authenticate', 'Basic realm="tankuj100 admin"');
  return res.status(401).json({
    error: 'unauthorized',
    message: 'Přihlaste se prosím.',
  });
}

/**
 * Bez nastavených údajů se admin VŮBEC nezveřejní – bezpečnější než ho nechat otevřený.
 *
 * Heslo se hádat nedá donekonečna: po deseti nepovedených pokusech z jedné adresy
 * se na čtvrt hodiny zavře. Počítají se jen requesty, které opravdu nesly nějaké
 * údaje – první request prohlížeče přichází bez hlavičky schválně, protože čeká
 * na výzvu, a nesmí se počítat jako pokus.
 */
function requireAdmin(req, res, next) {
  if (!admin.enabled) return disabled(req, res);

  if (failures.hits(req.ip).length >= MAX_FAILURES) {
    const retryAfter = failures.retryAfter(req.ip);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'too_many_attempts',
      message: 'Příliš mnoho pokusů o přihlášení. Zkuste to prosím za chvíli.',
      retry_after: retryAfter,
    });
  }

  const sent = credentials(req);
  if (sent && equals(sent.name, admin.username) && equals(sent.pass, admin.password)) {
    failures.clear(req.ip);
    return next();
  }

  if (sent) {
    const count = failures.add(req.ip).length;
    console.warn(`[admin] Nepovedené přihlášení z ${req.ip} (${count}/${MAX_FAILURES}).`);
  }
  return challenge(res);
}

/**
 * Obrana proti CSRF. Prohlížeč si údaje basic auth pamatuje a přiloží je i k requestu,
 * který vyvolala cizí stránka. `Origin` u takového requestu sedí na útočníkův web –
 * a když hlavička chybí úplně (klasické GET navigace, curl), není co odkud podstrčit.
 */
function sameOriginOnly(req, res, next) {
  const origin = req.get('Origin');
  if (!origin || origin === `${req.protocol}://${req.get('Host')}`) return next();

  return res.status(403).json({
    error: 'cross_origin',
    message: 'Požadavek přišel z cizí stránky.',
  });
}

module.exports = { requireAdmin, sameOriginOnly, MAX_FAILURES };
