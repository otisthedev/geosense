import { broadcast } from './channel';
import {
  getMpState, isHost, setMpRoundStart, markGuessed,
  setRoundResults, setFinalScores, setMpPlayers, emitMpSync,
} from './mp-state';
import {
  submitGuessToDb, getRoundGuesses, getRoomPlayers,
  setRoomStatus, updatePlayerScore, getPlayerId, setRoundTarget,
} from './rooms';
import { getState } from '../state';
import { haversineKm } from '../services/scoring';
import { locationFromCoords } from '../services/randomLocation';
import type { BroadcastEvent, RoundResult, FinalScore, RoomPlayer } from './types';

const TOTAL_ROUNDS = 5;
const ROUND_DISPLAY_MS = 8_000;
const GAME_END_DELAY_MS = ROUND_DISPLAY_MS;

let resolveTimer: ReturnType<typeof setTimeout> | null = null;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
// Prevents _resolveRound running twice if _checkAllGuessed and resolveTimer fire together
let roundResolved = false;

// ─── Central broadcast router ─────────────────────────────────────────────────

export function handleBroadcastEvent(event: BroadcastEvent): void {
  switch (event.type) {
    case 'round:start': {
      roundResolved = false;
      if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
      setMpRoundStart(event.start_time);
      emitMpSync({ type: 'round:start', round: event.round, loc: event.loc, startTime: event.start_time, duration: event.duration });
      break;
    }
    case 'player:guessed': {
      markGuessed(event.player_id);
      emitMpSync({ type: 'players:update', players: getMpState().players });
      _checkAllGuessed(event.round);
      break;
    }
    case 'round:end': {
      if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
      setRoundResults(event.results);
      emitMpSync({ type: 'round:end', results: event.results });
      break;
    }
    case 'game:end': {
      if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
      setFinalScores(event.final_scores);
      emitMpSync({ type: 'game:end', finalScores: event.final_scores });
      break;
    }
    case 'player:left': {
      emitMpSync({ type: 'players:update', players: getMpState().players });
      // Re-check in case we were waiting on this player to guess
      _checkAllGuessed(getState().round);
      break;
    }
  }
}

export function handlePlayersUpdate(players: RoomPlayer[]): void {
  setMpPlayers(players);
  emitMpSync({ type: 'players:update', players });
  _checkAllGuessed(getState().round);
}

// ─── Local guess submission ───────────────────────────────────────────────────

export async function handleMpGuessSubmit(
  lat: number | null,
  lng: number | null,
  noGuess: boolean,
  pts: number,
): Promise<void> {
  const mpState = getMpState();
  const gameState = getState();
  if (!mpState.room) return;

  const round = gameState.round;
  const loc = gameState.currentLocation!;
  const dist = (!noGuess && lat !== null && lng !== null)
    ? haversineKm(lat, lng, loc.lat, loc.lng)
    : null;
  const timeMs = Date.now() - mpState.roundStartTime;

  await submitGuessToDb(mpState.room.id, round, lat, lng, dist, pts, timeMs);
  broadcast({ type: 'player:guessed', player_id: getPlayerId(), round });
}

// ─── Timer expiry (called by game.ts) ────────────────────────────────────────

export function handleTimerExpired(): void {
  if (!isHost()) return;
  const round = getState().round;
  if (resolveTimer) clearTimeout(resolveTimer);
  resolveTimer = setTimeout(() => _resolveRound(round), 2500);
}

// ─── Host: force advance to next round early ─────────────────────────────────

export function hostForceAdvance(currentRound: number): void {
  if (!isHost()) return;
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  // Minimum 1 s so lagging clients finish processing round:end before round:start arrives
  advanceTimer = setTimeout(() => _scheduleNextRound(currentRound), 1000);
}

export function cancelAllTimers(): void {
  if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
}

// ─── Host: resolve round ──────────────────────────────────────────────────────

function _checkAllGuessed(round: number): void {
  if (!isHost() || round === 0) return;
  const { players, guessedIds } = getMpState();
  const active = players.filter((p) => p.status !== 'disconnected');
  if (active.length > 0 && active.every((p) => guessedIds.has(p.player_id))) {
    if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
    _resolveRound(round);
  }
}

async function _resolveRound(round: number): Promise<void> {
  if (roundResolved || !isHost()) return;
  roundResolved = true;
  const mpState = getMpState();
  if (!mpState.room) return;

  const [rawGuesses, freshPlayers] = await Promise.all([
    getRoundGuesses(mpState.room.id, round),
    getRoomPlayers(mpState.room.id),
  ]);

  const activePlayers = freshPlayers.filter((p) => p.status !== 'disconnected');

  const results: RoundResult[] = activePlayers.map((p) => {
    const g = rawGuesses.find((x) => x.player_id === p.player_id);
    return {
      player_id: p.player_id,
      name: p.name,
      color: p.color,
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      distance_km: g?.distance_km ?? null,
      score: g?.score ?? 0,
      no_guess: !g || g.lat === null,
      time_ms: g?.time_ms ?? 0,
    };
  });

  // Atomic increment — avoids lost-update if two rounds resolve close together
  await Promise.all(results.map((r) =>
    updatePlayerScore(mpState.room!.id, r.player_id, r.score, r.score),
  ));

  broadcast({ type: 'round:end', round, results });

  if (round >= TOTAL_ROUNDS) {
    advanceTimer = setTimeout(async () => {
      const updated = await getRoomPlayers(mpState.room!.id);
      const sorted = [...updated]
        .filter((p) => p.status !== 'disconnected')
        .sort((a, b) => b.total_score - a.total_score);

      const finalScores: FinalScore[] = sorted.map((p, i) => ({
        player_id: p.player_id,
        name: p.name,
        color: p.color,
        total_score: p.total_score,
        round_scores: p.round_scores as number[],
        rank: i + 1,
      }));

      await setRoomStatus(mpState.room!.id, 'finished');
      broadcast({ type: 'game:end', final_scores: finalScores });
    }, GAME_END_DELAY_MS);
  } else {
    _scheduleNextRound(round);
  }
}

function _scheduleNextRound(round: number): void {
  if (advanceTimer) clearTimeout(advanceTimer);
  advanceTimer = setTimeout(async () => {
    if (!isHost()) return;
    const mpState = getMpState();
    if (!mpState.room) return;
    const nextRound = round + 1;
    const rawLoc = mpState.room.loc_seq[nextRound - 1];
    if (!rawLoc) {
      console.error(`[MP] loc_seq[${nextRound - 1}] undefined — cannot start round ${nextRound}`);
      return;
    }
    await setRoundTarget(mpState.room.id, rawLoc.lat, rawLoc.lng);
    broadcast({
      type: 'round:start',
      round: nextRound,
      loc: rawLoc,
      start_time: Date.now() + 1500,
      duration: 90,
    });
    advanceTimer = null;
  }, ROUND_DISPLAY_MS);
}

// ─── Host: start game from lobby ──────────────────────────────────────────────

export async function hostStartGame(): Promise<void> {
  if (!isHost()) return;
  const mpState = getMpState();
  if (!mpState.room) return;

  const rawLoc = mpState.room.loc_seq[0];
  if (!rawLoc) {
    console.error('[MP] loc_seq[0] undefined — cannot start game');
    return;
  }

  await setRoomStatus(mpState.room.id, 'playing', 1);
  await setRoundTarget(mpState.room.id, rawLoc.lat, rawLoc.lng);

  broadcast({
    type: 'round:start',
    round: 1,
    loc: rawLoc,
    start_time: Date.now() + 2000,
    duration: 90,
  });
}

// Re-export for game.ts to convert RawLoc → full Location without a direct dep on services/
export { locationFromCoords };
