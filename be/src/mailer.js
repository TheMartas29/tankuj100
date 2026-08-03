// E-mailové notifikace přes EmailJS (stejná služba jako web silkroadbrand.eu).
//
// EmailJS má REST API, které jde volat i ze serveru – stačí public key (`user_id`)
// a hlavička `origin`. Když jsou v EmailJS zapnuté "API calls from non-browser
// applications" s private key, doplní se ještě `accessToken` (EMAILJS_PRIVATE_KEY).
//
// Konfigurace přes .env (viz .env.example). Když chybí, notifikace se jen zalogují –
// aplikace ani API kvůli e-mailu NIKDY nespadne, hlášení uživatele se vždycky uloží.

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

const config = {
  serviceId: process.env.EMAILJS_SERVICE_ID || '',
  templateId: process.env.EMAILJS_TEMPLATE_ID || '',
  publicKey: process.env.EMAILJS_PUBLIC_KEY || '',
  privateKey: process.env.EMAILJS_PRIVATE_KEY || '',
  origin: process.env.EMAILJS_ORIGIN || 'https://tankuj100.silkroadbrand.eu',
  notifyEmail: process.env.NOTIFY_EMAIL || '',
  adminUrl: process.env.ADMIN_URL || 'https://tankuj100.silkroadbrand.eu/',
};

const isConfigured = () => Boolean(config.serviceId && config.templateId && config.publicKey);

// --- Ochrana proti zaplavení schránky -------------------------------------------------
// Kdyby někdo spamoval reporty, nechceme poslat 500 e-mailů. Držíme strop za hodinu
// a stejnou zprávu (typ + stanice) neposíláme dvakrát během 10 minut.
const MAX_MAILS_PER_HOUR = Number(process.env.MAIL_MAX_PER_HOUR || 30);
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

let sentTimestamps = [];
const lastSentByKey = new Map();

function canSend(dedupeKey) {
  const now = Date.now();
  sentTimestamps = sentTimestamps.filter((t) => now - t < 60 * 60 * 1000);
  if (sentTimestamps.length >= MAX_MAILS_PER_HOUR) {
    console.warn('[mailer] Hodinový strop notifikací vyčerpán, e-mail se neposílá.');
    return false;
  }
  if (dedupeKey) {
    const last = lastSentByKey.get(dedupeKey);
    if (last && now - last < DEDUPE_WINDOW_MS) return false;
  }
  return true;
}

function markSent(dedupeKey) {
  sentTimestamps.push(Date.now());
  if (dedupeKey) lastSentByKey.set(dedupeKey, Date.now());
}

/**
 * Pošle notifikaci. Nikdy nevyhazuje výjimku – vrací { ok, skipped?, error? }.
 * `dedupeKey` brání opakovanému odeslání téže zprávy během 10 minut.
 */
async function sendNotification({ subject, body, dedupeKey }) {
  if (!isConfigured()) {
    console.log(`[mailer] (nenakonfigurováno) ${subject}\n${body}`);
    return { ok: false, skipped: 'not-configured' };
  }
  if (!canSend(dedupeKey)) {
    return { ok: false, skipped: 'throttled' };
  }

  const payload = {
    service_id: config.serviceId,
    template_id: config.templateId,
    user_id: config.publicKey,
    ...(config.privateKey ? { accessToken: config.privateKey } : {}),
    template_params: {
      // Názvy odpovídají EmailJS šabloně používané na silkroadbrand.eu.
      from_name: `tankuj100 – ${subject}`,
      from_email: 'noreply@tankuj100.silkroadbrand.eu',
      message: `${body}\n\nAdmin: ${config.adminUrl}`,
      ...(config.notifyEmail ? { to_email: config.notifyEmail } : {}),
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: config.origin },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[mailer] EmailJS vrátil ${res.status}: ${text}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    markSent(dedupeKey);
    console.log(`[mailer] Odesláno: ${subject}`);
    return { ok: true };
  } catch (err) {
    console.error('[mailer] Odeslání selhalo:', err.message);
    return { ok: false, error: err.message };
  }
}

/** Notifikace o novém nahlášení nesrovnalosti. */
function notifyNewReport({ report, station }) {
  const label = {
    price: 'špatná cena',
    closed: 'zavřeno / nefunguje',
    fuel: 'chybí nebo přebývá palivo',
    location: 'špatná poloha nebo adresa',
    content: 'NEVHODNÝ KOMENTÁŘ – zkontroluj přednostně',
    other: 'jiná nesrovnalost',
  }[report.type] || report.type;

  const lines = [
    `Nové hlášení: ${label}`,
    '',
    `Benzínka: ${station?.brand_name || '—'} – ${station?.name || '—'}`,
    `Adresa:   ${[station?.city, station?.address, station?.zip].filter(Boolean).join(', ') || '—'}`,
    `ID:       ${report.station_id}`,
  ];
  if (report.fuel_name) lines.push(`Palivo:   ${report.fuel_name}`);
  if (report.claimed_price != null) lines.push(`Cena dle uživatele: ${report.claimed_price} Kč/l`);
  if (report.review_id) lines.push(`Nahlášené hodnocení: #${report.review_id}`);
  if (report.note) lines.push('', `Poznámka: ${report.note}`);
  lines.push('', 'Zkontroluj to prosím v adminu.');

  return sendNotification({
    subject: `hlášení u ${station?.brand_name || 'benzínky'} ${station?.city || ''}`.trim(),
    body: lines.join('\n'),
    dedupeKey: `report:${report.station_id}:${report.type}`,
  });
}

/** Notifikace o novém komentáři (kvůli moderaci) nebo velmi nízkém hodnocení. */
function notifyNewReview({ review, station }) {
  const lines = [
    `Nové hodnocení: ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} (${review.rating}/5)`,
    '',
    `Benzínka: ${station?.brand_name || '—'} – ${station?.name || '—'}`,
    `ID:       ${review.station_id}`,
  ];
  if (review.author) lines.push(`Autor:    ${review.author}`);
  if (review.comment) lines.push('', `Komentář: ${review.comment}`);

  return sendNotification({
    subject: `hodnocení ${review.rating}/5 u ${station?.brand_name || 'benzínky'}`,
    body: lines.join('\n'),
    dedupeKey: `review:${review.station_id}:${review.device_id}`,
  });
}

module.exports = { sendNotification, notifyNewReport, notifyNewReview, isConfigured, config };
