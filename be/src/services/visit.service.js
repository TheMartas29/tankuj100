const crypto = require('crypto');

const visitRepo = require('../repositories/visit.repo');
const { visitToken } = require('../config');

/**
 * Počítání návštěv kampaňových adres (dnes jediná: `/stahnout`).
 *
 * Záměrně **bez cookies a bez čehokoli uloženého v prohlížeči**. Jediné, co se
 * ukládá, je otisk `sha256(sůl dne + IP + user agent)` zkrácený na 16 znaků – a sůl
 * se každý den mění, takže tentýž člověk má zítra jiný otisk a spojit ho napříč dny
 * nejde ani nám. Slouží jen k tomu, aby se dvojí načtení stránky nepočítalo jako
 * dva lidi.
 *
 * Praktický důsledek: na terminálovém zařízení se nic neukládá, takže tohle
 * nespadá pod souhlas podle ePrivacy a web nepotřebuje cookie lištu.
 */

/** Sůl dne. Bez tajemství by šel otisk dopočítat hrubou silou – adres IPv4 je konečně. */
const dailySalt = (secret, day) => crypto.createHash('sha256').update(`${day}:${secret}`).digest();

function fingerprint({ ip, userAgent, day }) {
  const salt = dailySalt(visitToken || 'bez-tajemstvi', day);
  return crypto
    .createHash('sha256')
    .update(salt)
    .update(`${ip}|${userAgent}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Hrubý rozbor user agenta. Schválně **žádná knihovna**: pár set kilobajtů
 * závislosti kvůli rozlišení „iPhone / Android / počítač“ se nevyplatí a tabulky
 * zařízení stejně zastarávají. Co se nepozná, spadne do „ostatní“ – radši přiznaná
 * neznalost než vymyšlené číslo.
 */
function parseUserAgent(raw) {
  const ua = String(raw || '');

  const isTablet = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isMobile = /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
  const device = isTablet ? 'tablet' : isMobile ? 'mobil' : ua ? 'počítač' : 'ostatní';

  let os = 'ostatní';
  let match;
  if ((match = ua.match(/iPhone OS (\d+)[_.](\d+)/))) os = `iOS ${match[1]}.${match[2]}`;
  else if ((match = ua.match(/CPU OS (\d+)[_.](\d+)/))) os = `iPadOS ${match[1]}.${match[2]}`;
  else if ((match = ua.match(/Android (\d+)(?:\.(\d+))?/))) os = `Android ${match[1]}`;
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows NT 10/.test(ua)) os = 'Windows';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';

  // Pořadí je podstatné: Edge i Chrome se v user agentu vydávají za Safari a Edge
  // se navíc vydává za Chrome. Kdo se testuje první, ten vyhrává.
  let browser = 'ostatní';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/(OPR|Opera)\//.test(ua)) browser = 'Opera';
  else if (/FBAN|FBAV|Instagram/.test(ua)) browser = 'Facebook/Instagram';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return { device, os, browser };
}

/** Z odkazujícího URL jen doména – celá adresa může nést parametry o konkrétním člověku. */
function referrerHost(raw) {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function record({ path, ip, userAgent, referrer }) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const { device, os, browser } = parseUserAgent(userAgent);

  visitRepo.insert({
    path,
    visitor: fingerprint({ ip, userAgent, day }),
    device,
    os,
    browser,
    referrer: referrerHost(referrer),
    createdAt: now.toISOString(),
  });
}

module.exports = { record, parseUserAgent, referrerHost };
