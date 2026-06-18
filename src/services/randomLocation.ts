import type { Location } from '../data/locations';

interface Region {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  weight: number;
}

// Weighted bounding boxes covering major landmasses.
// Weights are proportional to approx. land area inside each box.
// Some boxes overlap at boundaries — acceptable for a game.
const REGIONS: readonly Region[] = [
  { latMin: 15,  latMax: 73,  lngMin: -168, lngMax: -50,  weight: 22 }, // North America
  { latMin: -56, latMax: 12,  lngMin: -82,  lngMax: -34,  weight: 16 }, // South America
  { latMin: 35,  latMax: 72,  lngMin: -11,  lngMax: 40,   weight: 10 }, // Europe
  { latMin: -35, latMax: 38,  lngMin: -18,  lngMax: 52,   weight: 28 }, // Africa
  { latMin: 12,  latMax: 42,  lngMin: 35,   lngMax: 65,   weight: 5  }, // Middle East
  { latMin: 5,   latMax: 38,  lngMin: 60,   lngMax: 92,   weight: 8  }, // South Asia
  { latMin: -10, latMax: 28,  lngMin: 92,   lngMax: 115,  weight: 6  }, // SE Asia mainland
  { latMin: -9,  latMax: 20,  lngMin: 95,   lngMax: 142,  weight: 4  }, // Indonesia / Philippines
  { latMin: 18,  latMax: 55,  lngMin: 100,  lngMax: 135,  weight: 14 }, // China / East Asia
  { latMin: 50,  latMax: 78,  lngMin: 28,   lngMax: 145,  weight: 16 }, // Russia / Siberia
  { latMin: 31,  latMax: 46,  lngMin: 129,  lngMax: 146,  weight: 2  }, // Japan
  { latMin: -44, latMax: -10, lngMin: 112,  lngMax: 155,  weight: 7  }, // Australia
  { latMin: -47, latMax: -34, lngMin: 166,  lngMax: 178,  weight: 1  }, // New Zealand
  { latMin: 60,  latMax: 84,  lngMin: -56,  lngMax: -17,  weight: 2  }, // Greenland
  { latMin: 63,  latMax: 66,  lngMin: -25,  lngMax: -13,  weight: 1  }, // Iceland
  { latMin: -26, latMax: -12, lngMin: 43,   lngMax: 51,   weight: 1  }, // Madagascar
];

// Precompute CDF for weighted region selection
const _cdf: number[] = [];
let _total = 0;
for (const r of REGIONS) {
  _total += r.weight;
  _cdf.push(_total);
}

function pickRegion(): Region {
  const roll = Math.random() * _total;
  for (let i = 0; i < _cdf.length; i++) {
    if (roll < _cdf[i]) return REGIONS[i];
  }
  return REGIONS[REGIONS.length - 1];
}

function fmtCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${ns}, ${Math.abs(lng).toFixed(3)}°${ew}`;
}

function climateHint(lat: number): string {
  const a = Math.abs(lat);
  if (a < 10)   return 'equatorial — dense tropical rainforest, year-round heat and rain';
  if (a < 23.5) return 'tropical — wet and dry seasons, lush vegetation';
  if (a < 35)   return 'subtropical — warm and dry, Mediterranean or desert character';
  if (a < 55)   return 'temperate — four seasons, mixed or deciduous forest';
  if (a < 68)   return 'subarctic / boreal — long cold winters, conifer forest or tundra';
  return 'polar / arctic — permafrost, sparse vegetation, extreme cold';
}

export function locationFromCoords(lat: number, lng: number, head?: number): Location {
  return {
    lat,
    lng,
    head: head ?? Math.floor(Math.random() * 360),
    name: fmtCoord(lat, lng),
    h: `${lat >= 0 ? 'Northern' : 'Southern'} hemisphere. ${climateHint(lat)}. Coordinates: ${fmtCoord(lat, lng)}.`,
  };
}

export function randomLandLocation(): Location {
  const r = pickRegion();
  const lat = Math.round((r.latMin + Math.random() * (r.latMax - r.latMin)) * 10000) / 10000;
  const lng = Math.round((r.lngMin + Math.random() * (r.lngMax - r.lngMin)) * 10000) / 10000;
  return locationFromCoords(lat, lng);
}
