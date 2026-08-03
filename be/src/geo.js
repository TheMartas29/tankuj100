// Geografické pomůcky – hlavně test "je bod na území ČR?".
//
// Hranice ČR je uložená v ../data/cz-border.json jako jeden zjednodušený polygon
// [[lon, lat], ...] (zdroj: OpenStreetMap / Nominatim, zjednodušeno Douglas–Peuckerem
// na toleranci ~0,002° ≈ 200 m). Pro filtrování benzínek je to víc než dost přesné
// a soubor má jen ~35 kB, takže nepotřebujeme žádnou geo knihovnu.

const fs = require('fs');
const path = require('path');

const BORDER_PATH = path.join(__dirname, '..', 'data', 'cz-border.json');

let czBorder = null;

function loadBorder() {
  if (czBorder) return czBorder;
  czBorder = JSON.parse(fs.readFileSync(BORDER_PATH, 'utf8'));
  return czBorder;
}

/** Ray-casting: leží bod [lon, lat] uvnitř polygonu? */
function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Je souřadnice na území České republiky? Nesmyslné vstupy → false. */
function isInCzechia(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  return pointInPolygon(lo, la, loadBorder());
}

module.exports = { isInCzechia, pointInPolygon };
