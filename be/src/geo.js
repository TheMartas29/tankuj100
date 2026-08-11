// Hranice ČR je zjednodušená na toleranci ~0,002° ≈ 200 m, takže body těsně u hranice
// můžou vyjít na obě strany. Volající s tím musí počítat.

const fs = require('fs');
const path = require('path');

const BORDER_PATH = path.join(__dirname, '..', 'data', 'cz-border.json');

let czBorder = null;

function loadBorder() {
  if (czBorder) return czBorder;
  czBorder = JSON.parse(fs.readFileSync(BORDER_PATH, 'utf8'));
  return czBorder;
}

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

function isInCzechia(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  return pointInPolygon(lo, la, loadBorder());
}

const EARTH_RADIUS_M = 6371008.8;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

function distanceMeters(lat1, lon1, lat2, lon2) {
  const meanLat = toRadians((Number(lat1) + Number(lat2)) / 2);
  const dLat = toRadians(Number(lat2) - Number(lat1));
  const dLon = toRadians(Number(lon2) - Number(lon1)) * Math.cos(meanLat);
  return Math.sqrt(dLat * dLat + dLon * dLon) * EARTH_RADIUS_M;
}

module.exports = { isInCzechia, pointInPolygon, distanceMeters };
