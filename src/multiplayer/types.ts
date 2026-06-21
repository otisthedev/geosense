export type RoomType   = 'public' | 'private';
export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type PlayerStatus = 'waiting' | 'playing' | 'guessed' | 'disconnected';

export interface RawLoc {
  lat: number;
  lng: number;
  head: number;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  type: RoomType;
  max_players: 2 | 4;
  status: RoomStatus;
  round: number;
  // loc_seq intentionally absent: stored in room_secrets, not the public rooms table
  created_at: string;
  expires_at: string;
}

export interface RoomPlayer {
  room_id: string;
  player_id: string;
  name: string;
  color: string;
  total_score: number;
  round_scores: number[];
  status: PlayerStatus;
  joined_at: string;
}

export interface RoundResult {
  player_id: string;
  name: string;
  color: string;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  score: number;
  no_guess: boolean;
  time_ms: number;
}

export interface FinalScore {
  player_id: string;
  name: string;
  color: string;
  total_score: number;
  round_scores: number[];
  rank: number;
}

// ─── Broadcast event union ────────────────────────────────────────────────────

export interface RoundStartEvent {
  type: 'round:start';
  round: number;
  // loc is intentionally absent from the broadcast — clients fetch it via
  // get_round_location() RPC after receiving this event.
  start_time: number;
  duration: number;
}

export interface PlayerGuessedEvent {
  type: 'player:guessed';
  player_id: string;
  round: number;
}

export interface RoundEndEvent {
  type: 'round:end';
  round: number;
  results: RoundResult[];
}

export interface GameEndEvent {
  type: 'game:end';
  final_scores: FinalScore[];
}

export interface PlayerLeftEvent {
  type: 'player:left';
  player_id: string;
}

export type BroadcastEvent =
  | RoundStartEvent
  | PlayerGuessedEvent
  | RoundEndEvent
  | GameEndEvent
  | PlayerLeftEvent;
