const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Solo: pure distance score, max 5000
export function calcScore(km: number): number {
  return Math.max(0, Math.round(5000 * Math.exp(-km / 2000)));
}

// Multiplayer: distance is primary (max 4000, 80%) + time bonus (max 1000, 20%)
// Distance still dominates: a 0 km guess at time limit (4000) beats any guess ≥ 1600 km instantly
export function calcMpScore(km: number, elapsedMs: number, durationMs: number): number {
  const distScore = Math.max(0, Math.round(4000 * Math.exp(-km / 2000)));
  const remaining = Math.max(0, durationMs - elapsedMs);
  const timeBonus = Math.round(1000 * (remaining / durationMs));
  return distScore + timeBonus;
}

export function scoreColorClass(pts: number, noGuess: boolean): string {
  if (noGuess) return 'cr';
  const pct = pts / 5000;
  if (pct > 0.85) return 'cg';
  if (pct > 0.55) return 'cp';
  if (pct > 0.25) return 'co';
  return 'cr';
}

export function verdictText(pts: number, noGuess: boolean): string {
  if (noGuess) return "⏱ Time’s up — no pin placed";
  const pct = pts / 5000;
  if (pct > 0.85) return '🏆 Outstanding!';
  if (pct > 0.55) return '🎯 Great guess!';
  if (pct > 0.25) return '👍 Not bad';
  return '📍 Keep exploring';
}
