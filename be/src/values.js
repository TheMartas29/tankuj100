function cleanValue(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  return text || null;
}

const isEmpty = (raw) => cleanValue(raw) === null;

function normalizeZip(raw) {
  const zip = cleanValue(raw);
  return zip ? zip.replace(/\s+/g, '') : null;
}

function normalizePhone(raw) {
  const first = cleanValue(raw);
  if (!first) return null;

  // U pumpy bývá čísel víc oddělených ";" – bereme první.
  let digits = first.split(';')[0].replace(/\D/g, '');
  if (!digits) return null;
  // Zápis „00420…“ z odkazů tel: na webech značek.
  if (digits.length > 11 && digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('420')) return digits.slice(3);
  if (digits.length === 11 && digits.startsWith('42')) return digits.slice(2);
  return digits;
}

module.exports = { cleanValue, isEmpty, normalizeZip, normalizePhone };
