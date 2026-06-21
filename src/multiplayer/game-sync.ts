import { broadcast } from './channel';
import {
  getMpState, isHost, setMpRoundStart, markGuessed,
  setRoundResults, setFinalScores, setMpPlayers, emitMpSync,
} from './mp-state';
import {
  submitGuessToDb, getRoundGuesses, getRoomPlayers,
  setRoomStatus, updatePlayerScore, getPlayerId, setRoundTarget,
  markPlayerGuessed, resetPlayersToPlaying, getNextRoundLocation,
} from './rooms';
import { getState } from '../state';
import { locationFromCoords } from '../services/randomLocation';
import type { BroadcastEvent, RoundResult, FinalScore, RoomPlayer } from './types';
import type { BehaviorMeta } from './anti-cheat';

const TOTAL_ROUNDS = 5;
const ROUND_DISPLAY_MS = 8_000;
const GAME_END_DELAY_MS = ROUND_DISPLAY_MS;

let resolveTimer: ReturnType<typeof setTimeout> | null = null;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
// Prevents _resolveRound running twice if _checkAllGuessed and resolveTimer fire together
let roundResolved = false;
// Set synchronously in handleBroadcastEvent when round:start arrives, before the async
// DB fetch for the round location. Used by _checkAllGuessed to filter stale events
// without racing against startMpRound() (which updates getState().round later).
let mpCurrentRound = 0;

// ─── Central broadcast router ─────────────────────────────────────────────────

export function handleBroadcastEvent(event: BroadcastEvent): void {
  switch (event.type) {
    case 'round:start': {
      roundResolved = false;
      mpCurrentRound = event.round; // set synchronously so _checkAllGuessed guard works immediately
      if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
      setMpRoundStart(event.start_time);
      // Coordinates are no longer in the broadcast. Each client fetches them
      // from room_secrets via the get_round_location security-definer RPC.
      // This prevents coordinate extraction from channel eavesdropping.
      _fetchAndEmitRoundStart(event.round, event.start_time, event.duration);
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

// Fetch this round's location from room_secrets (not from the broadcast) then
// emit the round:start sync event so the game screen can start loading.
async function _fetchAndEmitRoundStart(
  round: number,
  startTime: number,
  duration: number,
): Promise<void> {
  const mpState = getMpState();
  if (!mpState.room) return;
  try {
    const rawLoc = await getNextRoundLocation(mpState.room.id, round);
    emitMpSync({ type: 'round:start', round, loc: rawLoc, startTime, duration });
  } catch (err) {
    console.error('[AC] Failed to fetch round location from DB:', err);
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
  meta: BehaviorMeta,   // behavioral signals logged to round_guesses.meta
): Promise<void> {
  const mpState = getMpState();
  const gameState = getState();
  if (!mpState.room) return;

  const round = gameState.round;

  try {
    // submit_guess RPC validates room membership, game state, and coordinate
    // ranges before inserting. score/time_ms are computed by server trigger.
    await submitGuessToDb(
      mpState.room.id,
      round,
      noGuess ? null : lat,
      noGuess ? null : lng,
      meta as unknown as Record<string, unknown>,
    );
    // Update DB status to 'guessed' — Postgres Changes fires on all clients, giving the
    // host a reliable DB-backed trigger for _checkAllGuessed, not just broadcast delivery.
    await markPlayerGuessed(mpState.room.id, getPlayerId());
  } catch (err) {
    console.error('[MP] DB write failed, broadcasting anyway so host can still resolve round:', err);
  }
  // Always broadcast — even if DB writes failed the host can still tally via broadcast.
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
  if (!isHost() || round === 0 || roundResolved) return;
  // Ignore stale events from a different round. Uses mpCurrentRound (set synchronously
  // when round:start arrives) rather than getState().round (set later, after the async
  // DB fetch in _fetchAndEmitRoundStart completes). Without this, a player:guessed
  // broadcast arriving before _fetchAndEmitRoundStart finishes would be incorrectly
  // rejected because getState().round still reflects the previous round.
  if (round !== mpCurrentRound) return;
  const mpState = getMpState();
  const active = mpState.players.filter((p) => p.status !== 'disconnected');
  // Accept either the DB status ('guessed' set by markPlayerGuessed via Postgres Changes)
  // OR the in-memory guessedIds set (populated immediately when player:guessed broadcast arrives).
  // This way the round resolves correctly even when Postgres Changes hasn't fired yet.
  if (active.length > 0 && active.every((p) => p.status === 'guessed' || mpState.guessedIds.has(p.player_id))) {
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
      player_id:   p.player_id,
      name:        p.name,
      color:       p.color,
      lat:         g?.lat ?? null,
      lng:         g?.lng ?? null,
      distance_km: g?.distance_km ?? null,
      score:       g?.score ?? 0,    // server-computed value from DB trigger
      no_guess:    !g || g.lat === null,
      time_ms:     g?.time_ms ?? 0,  // server-computed value from DB trigger
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
        player_id:    p.player_id,
        name:         p.name,
        color:        p.color,
        total_score:  p.total_score,
        round_scores: p.round_scores as number[],
        rank:         i + 1,
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

    // Fetch from room_secrets via security-definer RPC — not from the broadcast or
    // rooms table, so the host is also subject to the same access control.
    let rawLoc;
    try {
      rawLoc = await getNextRoundLocation(mpState.room.id, nextRound);
    } catch (err) {
      console.error(`[MP] Failed to fetch loc for round ${nextRound}:`, err);
      return;
    }

    await resetPlayersToPlaying(mpState.room.id);
    // Sets cur_lat/cur_lng and round_started_at (offset by 1 500 ms = broadcast delay)
    await setRoundTarget(mpState.room.id, rawLoc.lat, rawLoc.lng, 1500);

    // Broadcast round:start WITHOUT coordinates — clients fetch via get_round_location()
    broadcast({
      type:       'round:start',
      round:      nextRound,
      start_time: Date.now() + 1500,
      duration:   90,
    });
    advanceTimer = null;
  }, ROUND_DISPLAY_MS);
}

// ─── Host: start game from lobby ──────────────────────────────────────────────

export async function hostStartGame(): Promise<void> {
  if (!isHost()) return;
  const mpState = getMpState();
  if (!mpState.room) return;

  let rawLoc;
  try {
    rawLoc = await getNextRoundLocation(mpState.room.id, 1);
  } catch (err) {
    console.error('[MP] Failed to fetch loc for round 1:', err);
    return;
  }

  await setRoomStatus(mpState.room.id, 'playing', 1);
  // Offset by 2 000 ms to match the longer start_time delay below
  await setRoundTarget(mpState.room.id, rawLoc.lat, rawLoc.lng, 2000);

  // Broadcast round:start WITHOUT coordinates
  broadcast({
    type:       'round:start',
    round:      1,
    start_time: Date.now() + 2000,
    duration:   90,
  });
}

// Re-export for game.ts to convert RawLoc → full Location without a direct dep on services/
export { locationFromCoords };
