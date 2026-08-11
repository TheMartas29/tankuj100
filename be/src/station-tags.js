const SERVICE_TAGS = {
  shop: 'obchod',
  car_wash: 'myčka',
  toilets: 'WC',
  compressed_air: 'kompresor',
  wheelchair: 'bezbariérový přístup',
  self_service: 'samoobslužná',
};

const PAYMENT_LABELS = {
  cash: 'hotovost',
  visa: 'Visa',
  mastercard: 'Mastercard',
  maestro: 'Maestro',
  american_express: 'American Express',
  v_pay: 'V Pay',
  debit_cards: 'debetní karty',
  credit_cards: 'kreditní karty',
  contactless: 'bezkontaktně',
  girocard: 'girocard',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

const PAYMENT_PREFIX = 'payment:';

function servicesText(stored) {
  const labels = stored
    .filter((tag) => tag.tag_key in SERVICE_TAGS)
    .map((tag) => {
      const label = SERVICE_TAGS[tag.tag_key];
      // „wheelchair=limited“ je jiná informace než „yes“, ať to uživatel pozná.
      return tag.tag_value === 'limited' ? `${label} (částečně)` : label;
    });
  return labels.length ? labels.join(', ') : null;
}

function paymentsText(stored) {
  const labels = stored
    .filter((tag) => tag.tag_key.startsWith(PAYMENT_PREFIX))
    .map((tag) => {
      const key = tag.tag_key.slice(PAYMENT_PREFIX.length);
      // Neznámé jsou skoro vždy tankovací karty (dkv, uta, ccs, routex…) – velkými.
      return PAYMENT_LABELS[key] || key.replace(/_/g, ' ').toUpperCase();
    });
  return labels.length ? labels.join(', ') : null;
}

module.exports = { SERVICE_TAGS, PAYMENT_LABELS, PAYMENT_PREFIX, servicesText, paymentsText };
