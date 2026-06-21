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

// Multiplayer: 50/50 split — distance component (max 2500) + time component (max 2500).
// Server trigger mirrors this formula and also applies the instant-submit penalty
// (< 3 s → 30% score) and speed-intuition bonus (3–15 s → +200 pts).
// This client-side value is used for display only; the authoritative score comes
// from the DB trigger via round:end results.
export function calcMpScore(km: number, elapsedMs: number, durationMs: number): number {
  const distScore = Math.max(0, Math.round(2500 * Math.exp(-km / 2000)));
  const remaining = Math.max(0, durationMs - elapsedMs);
  const timeScore = Math.round(2500 * (remaining / durationMs));
  return distScore + timeScore;
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
