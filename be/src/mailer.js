const { mail, mailEnabled } = require('./config');

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
const REQUEST_TIMEOUT_MS = 10000;
const HOUR_MS = 60 * 60 * 1000;
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

const REPORT_TYPE_LABELS = {
  closed: 'zavřeno / nefunguje',
  fuel: 'chybí nebo přebývá palivo',
  location: 'špatná poloha nebo adresa',
  content: 'NEVHODNÝ KOMENTÁŘ – zkontroluj přednostně',
  other: 'jiná nesrovnalost',
};

const isConfigured = () => mailEnabled;

let sentTimestamps = [];
const lastSentByKey = new Map();

function canSend(dedupeKey) {
  const now = Date.now();
  sentTimestamps = sentTimestamps.filter((t) => now - t < HOUR_MS);
  if (sentTimestamps.length >= mail.maxPerHour) {
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

function buildPayload({ subject, body }) {
  return {
    service_id: mail.serviceId,
    template_id: mail.templateId,
    user_id: mail.publicKey,
    ...(mail.privateKey ? { accessToken: mail.privateKey } : {}),
    template_params: {
      from_name: `tankuj100 – ${subject}`,
      from_email: 'noreply@tankuj100.silkroadbrand.eu',
      message: `${body}\n\nAdmin: ${mail.adminUrl}`,
      ...(mail.notifyEmail ? { to_email: mail.notifyEmail } : {}),
    },
  };
}

/** Nikdy nevyhazuje výjimku – API kvůli e-mailu nesmí spadnout. Vrací { ok, skipped?, error? }. */
async function sendNotification({ subject, body, dedupeKey }) {
  if (!isConfigured()) {
    console.log(`[mailer] (nenakonfigurováno) ${subject}\n${body}`);
    return { ok: false, skipped: 'not-configured' };
  }
  if (!canSend(dedupeKey)) return { ok: false, skipped: 'throttled' };

  try {
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: mail.origin },
      body: JSON.stringify(buildPayload({ subject, body })),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

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

const stationLine = (station) => `Benzínka: ${station?.brand_name || '—'} – ${station?.name || '—'}`;

function notifyNewReport({ report, station }) {
  const lines = [
    `Nové hlášení: ${REPORT_TYPE_LABELS[report.type] || report.type}`,
    '',
    stationLine(station),
    `Adresa:   ${[station?.city, station?.address, station?.zip].filter(Boolean).join(', ') || '—'}`,
    `ID:       ${report.station_id}`,
  ];
  if (report.fuel_name) lines.push(`Palivo:   ${report.fuel_name}`);
  if (report.review_id) lines.push(`Nahlášené hodnocení: #${report.review_id}`);
  if (report.note) lines.push('', `Poznámka: ${report.note}`);
  lines.push('', 'Zkontroluj to prosím v adminu.');

  return sendNotification({
    subject: `hlášení u ${station?.brand_name || 'benzínky'} ${station?.city || ''}`.trim(),
    body: lines.join('\n'),
    dedupeKey: `report:${report.station_id}:${report.type}`,
  });
}

function notifyNewReview({ review, station }) {
  const stars = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
  const lines = [
    `Nové hodnocení: ${stars} (${review.rating}/5)`,
    '',
    stationLine(station),
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

module.exports = { sendNotification, notifyNewReport, notifyNewReview, isConfigured };
