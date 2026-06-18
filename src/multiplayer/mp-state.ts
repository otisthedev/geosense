import type { Room, RoomPlayer, RoundResult, FinalScore, BroadcastEvent, RawLoc } from './types';

export interface MpState {
  active: boolean;
  room: Room | null;
  localPlayer: RoomPlayer | null;
  players: RoomPlayer[];
  roundStartTime: number;
  guessedIds: Set<string>;
  pendingRoundResults: RoundResult[] | null;
  pendingFinalScores: FinalScore[] | null;
}

const s: MpState = {
  active: false,
  room: null,
  localPlayer: null,
  players: [],
  roundStartTime: 0,
  guessedIds: new Set(),
  pendingRoundResults: null,
  pendingFinalScores: null,
};

export function getMpState(): Readonly<MpState> { return s; }
export function setMpActive(v: boolean): void { s.active = v; }
export function setMpRoom(r: Room): void { s.room = r; }
export function setMpLocalPlayer(p: RoomPlayer): void { s.localPlayer = p; }
export function setMpPlayers(players: RoomPlayer[]): void { s.players = [...players]; }
export function setMpRoundStart(t: number): void { s.roundStartTime = t; s.guessedIds = new Set(); }
export function markGuessed(id: string): void { s.guessedIds.add(id); }
export function setRoundResults(r: RoundResult[]): void { s.pendingRoundResults = r; }
export function setFinalScores(f: FinalScore[]): void { s.pendingFinalScores = f; }

export function resetMpState(): void {
  s.active = false;
  s.room = null;
  s.localPlayer = null;
  s.players = [];
  s.roundStartTime = 0;
  s.guessedIds = new Set();
  s.pendingRoundResults = null;
  s.pendingFinalScores = null;
}

export function isHost(): boolean {
  if (!s.room || !s.localPlayer) return false;
  return s.room.host_id === s.localPlayer.player_id;
}

// ─── Pub/Sub for game events ──────────────────────────────────────────────────
// game-sync.ts emits here; main.ts wires the UI callbacks.

type GameSyncEvent =
  | { type: 'round:start'; round: number; loc: RawLoc; startTime: number; duration: number }
  | { type: 'round:end';   results: RoundResult[] }
  | { type: 'game:end';    finalScores: FinalScore[] }
  | { type: 'players:update'; players: RoomPlayer[] };

type SyncListener = (e: GameSyncEvent) => void;
const listeners = new Set<SyncListener>();

export function onMpSync(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitMpSync(event: GameSyncEvent): void {
  listeners.forEach((fn) => fn(event));
}

// Re-export the BroadcastEvent type for convenience
export type { BroadcastEvent };
