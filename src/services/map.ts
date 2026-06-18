import L from 'leaflet';
import type { RoundResult } from '../multiplayer/types';

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const VOYAGER_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_ATTR = '&copy; <a href="https://carto.com/">CARTO</a>';
const TILE_OPTS = { subdomains: 'abcd' as const, maxZoom: 19 };

let gameMap: L.Map | null = null;
let guessMarker: L.Marker | null = null;
let resMap: L.Map | null = null;
let mpResMap: L.Map | null = null;
let _onPin: ((lat: number, lng: number) => void) | null = null;

function pinIcon(color: string, size: number, glow: string): L.DivIcon {
  const border = size > 18 ? 3 : 2.5;
  const ring = size > 18 ? 3 : 2;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border}px solid #fff;border-radius:50%;box-shadow:0 0 0 ${ring}px ${glow},0 3px 14px rgba(0,0,0,.6);transform:translate(-50%,-50%)"></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function placePin(lat: number, lng: number): void {
  if (!gameMap) return;
  const icon = pinIcon('#ff6b35', 20, 'rgba(255,107,53,.35)');
  if (guessMarker) {
    guessMarker.setLatLng([lat, lng]);
  } else {
    guessMarker = L.marker([lat, lng], { icon, draggable: true, zIndexOffset: 1000 }).addTo(gameMap);
    guessMarker.on('dragend', (e) => {
      const p = (e.target as L.Marker).getLatLng();
      _onPin?.(p.lat, p.lng);
    });
  }
}

export function initGameMap(
  containerId: string,
  onPin: (lat: number, lng: number) => void,
  onInteract: () => void,
): void {
  destroyGameMap();
  _onPin = onPin;

  gameMap = L.map(containerId, {
    center: [20, 10],
    zoom: 2,
    zoomControl: true,
    attributionControl: true,
    minZoom: 1,
    maxZoom: 18,
  });

  L.tileLayer(DARK_TILES, { attribution: CARTO_ATTR, ...TILE_OPTS }).addTo(gameMap);

  gameMap.on('click', (e) => {
    placePin(e.latlng.lat, e.latlng.lng);
    onPin(e.latlng.lat, e.latlng.lng);
  });

  gameMap.on('zoomstart movestart', onInteract);
}

export function invalidateGameMap(): void {
  gameMap?.invalidateSize();
}

export function destroyGameMap(): void {
  if (gameMap) {
    gameMap.remove();
    gameMap = null;
    guessMarker = null;
    _onPin = null;
  }
}

export function initResultMap(
  containerId: string,
  gLat: number,
  gLng: number,
  tLat: number,
  tLng: number,
  noGuess: boolean,
  locationName: string,
): void {
  if (resMap) {
    resMap.remove();
    resMap = null;
  }

  resMap = L.map(containerId, {
    zoomControl: false,
    attributionControl: true,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
  });

  L.tileLayer(VOYAGER_TILES, { attribution: CARTO_ATTR, ...TILE_OPTS }).addTo(resMap);

  const targetIcon = pinIcon('#00e5a0', 22, 'rgba(0,229,160,.4)');
  L.marker([tLat, tLng], { icon: targetIcon })
    .addTo(resMap)
    .bindPopup(
      noGuess
        ? `<b style="color:#00e5a0">●</b> ${locationName} — no guess placed`
        : '<b style="color:#00e5a0">●</b> Target',
    );

  if (noGuess) {
    resMap.setView([tLat, tLng], 4);
    return;
  }

  const guessIcon = pinIcon('#ff6b35', 18, 'rgba(255,107,53,.35)');
  L.marker([gLat, gLng], { icon: guessIcon })
    .addTo(resMap)
    .bindPopup('<b style="color:#ff6b35">●</b> Your guess');

  const line = L.polyline([[gLat, gLng], [tLat, tLng]], {
    color: '#00e5a0',
    weight: 1.5,
    opacity: 0.75,
  }).addTo(resMap);

  const bounds = L.latLngBounds([[gLat, gLng], [tLat, tLng]]);
  resMap.fitBounds(bounds.pad(0.35));

  resMap.once('moveend', () => {
    const pathEl = line.getElement() as SVGGeometryElement | null;
    if (!pathEl) return;
    const len = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = `${len} ${len}`;
    pathEl.style.strokeDashoffset = String(len);
    pathEl.style.transition = 'none';
    pathEl.getBoundingClientRect();
    pathEl.style.transition = 'stroke-dashoffset 800ms ease-in-out';
    pathEl.style.strokeDashoffset = '0';
  });
}

export function initMpResultMap(
  containerId: string,
  results: RoundResult[],
  tLat: number,
  tLng: number,
  locationName: string,
): void {
  if (mpResMap) { mpResMap.remove(); mpResMap = null; }

  mpResMap = L.map(containerId, {
    zoomControl: false,
    attributionControl: true,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
  });

  L.tileLayer(VOYAGER_TILES, { attribution: CARTO_ATTR, ...TILE_OPTS }).addTo(mpResMap);

  const targetIcon = pinIcon('#00e5a0', 22, 'rgba(0,229,160,.4)');
  L.marker([tLat, tLng], { icon: targetIcon }).addTo(mpResMap)
    .bindPopup(`<b style="color:#00e5a0">●</b> ${locationName}`);

  const allPoints: [number, number][] = [[tLat, tLng]];

  results.forEach((r) => {
    if (r.no_guess || r.lat === null || r.lng === null) return;
    allPoints.push([r.lat, r.lng]);

    const gIcon = pinIcon(r.color, 16, `${r.color}55`);
    L.marker([r.lat, r.lng], { icon: gIcon }).addTo(mpResMap!)
      .bindPopup(`<b style="color:${r.color}">●</b> ${r.name}`);

    L.polyline([[r.lat, r.lng], [tLat, tLng]], {
      color: r.color,
      weight: 1.5,
      opacity: 0.65,
      dashArray: '4 4',
    }).addTo(mpResMap!);
  });

  if (allPoints.length > 1) {
    mpResMap.fitBounds(L.latLngBounds(allPoints).pad(0.3));
  } else {
    mpResMap.setView([tLat, tLng], 4);
  }
}
