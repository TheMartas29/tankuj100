const { ValidationError } = require('../errors');

const PROFANITY = [
  'kurva', 'kurvy', 'kurwa', 'pica', 'picu', 'pico', 'picus', 'pizda',
  'jebat', 'jebe', 'zmrd', 'debil', 'kreten', 'mrdat', 'mrdka', 'prdel',
  'srac', 'sracka', 'hovno', 'curak', 'penis', 'vagina', 'nigger', 'fuck',
  'shit', 'bitch', 'cunt', 'asshole', 'retard',
];

const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
const SHOUTING_MIN_LETTERS = 20;
const REPEATED_CHAR_PATTERN = /(.)\1{19,}/u;
const MIN_LENGTH_FOR_SPACED_MATCH = 5;

function normalizeForFilter(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/1|!/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5|\$/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z\s]/g, '');
}

function findProfanity(text) {
  const normalized = normalizeForFilter(text);
  const collapsed = normalized.replace(/\s+/g, '');
  return PROFANITY.find(
    (word) =>
      new RegExp(`\\b${word}`).test(normalized) ||
      // Slepený text chytá „k u r v a“. Krátká slova by v něm ale nacházela samá
      // falešná shody uprostřed nevinných vět, proto jen od pěti znaků výš.
      (word.length >= MIN_LENGTH_FOR_SPACED_MATCH && collapsed.includes(word))
  );
}

function checkContent(text, { field, label }) {
  if (!text) return text;

  if (findProfanity(text)) {
    throw new ValidationError(
      'Text obsahuje vulgarismus. Zkuste to prosím napsat slušněji – ostatním řidičům to pomůže víc.',
      field
    );
  }

  if (URL_PATTERN.test(text)) {
    throw new ValidationError(`${label} nesmí obsahovat odkaz.`, field);
  }

  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length > SHOUTING_MIN_LETTERS && letters === letters.toUpperCase()) {
    throw new ValidationError(`Napište ${label.toLowerCase()} prosím normálně, ne velkými písmeny.`, field);
  }

  if (REPEATED_CHAR_PATTERN.test(text)) {
    throw new ValidationError(`${label} vypadá jako nesmyslný text.`, field);
  }

  return text;
}

module.exports = { checkContent };
