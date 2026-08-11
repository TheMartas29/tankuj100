'use strict';

// Pořadí rozhoduje: „ORLEN Benzina“ musí spadnout pod Orlen dřív, než ho chytí
// pravidlo pro Benzinu.
const BRAND_ALIASES = [
  [/orlen/i, 'Orlen'],
  [/^benz[ií]n[aá]\b/i, 'Orlen'],
  [/^mol\b/i, 'MOL'],
  [/^omv\b/i, 'OMV'],
  [/^shell\b/i, 'Shell'],
  [/^(euro\s?oil|[čc]epro)\b/i, 'EuroOil'],
  [/^(tank\s*)?ono\b/i, 'Tank ONO'],
  [/^pap\s?oil\b/i, 'PapOil'],
  [/^km\s*-?\s*prona\b/i, 'KM-PRONA'],
  [/^robin\s?oil\b/i, 'RoBiN OIL'],
  [/^top\s?tank\b/i, 'TOP TANK'],
  [/^one\s?1\b/i, 'one1'],
  [/^pasoil\b/i, 'Pasoil'],
  [/^(agip|eni)\b/i, 'Eni'],
  [/^avia\b/i, 'Avia'],
  [/^free\s?1\s?gas\b/i, 'Free1 GAS'],
];

// Oddělovač před zkratkou je povinný, jinak regexp ukousne konec slova
// („Tomegas“ → „Tomeg“, „TOPAS“ → „TOP“).
const LEGAL_SUFFIX =
  /[\s,]+(spol\.?\s*s\s*r\.?\s*o\.?|s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|z\.?\s*s\.?|k\.?\s*s\.?)\s*$/i;

const MAX_BRAND_LENGTH = 30;

function canonicalBrand(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  for (const [pattern, brand] of BRAND_ALIASES) {
    if (pattern.test(trimmed)) return brand;
  }

  const cleaned = trimmed.replace(LEGAL_SUFFIX, '').trim();
  if (!cleaned) return null;
  return cleaned.length <= MAX_BRAND_LENGTH ? cleaned : cleaned.slice(0, MAX_BRAND_LENGTH).trim();
}

const RETIRED_NAME_REWRITES = [
  [/\bORLEN\s+Benz[ií]n[aá]\b/gi, 'Orlen'],
  [/\bBenz[ií]n[aá]\b/gi, 'Orlen'],
];

function canonicalStationName(raw, brand = null) {
  if (!raw) return null;
  let name = String(raw).trim();
  if (!name) return null;

  for (const [pattern, replacement] of RETIRED_NAME_REWRITES) {
    name = name.replace(pattern, replacement);
  }

  // Po přepisu vznikají tvary „Orlen - Orlen“ nebo „Orlen Orlen“.
  name = name.replace(/\b(\p{L}[\p{L}\d]*)\b(\s*[-–,]\s*|\s+)\1\b/giu, '$1');
  name = name.replace(/\s{2,}/g, ' ').replace(/^[\s,–-]+|[\s,–-]+$/g, '').trim();

  if (!name) return brand || null;
  return name;
}

module.exports = { canonicalBrand, canonicalStationName, BRAND_ALIASES };
