import { supabase } from './client';
import type { Room, RoomPlayer, RawLoc } from './types';
import { randomLandLocation } from '../services/randomLocation';

export const PLAYER_COLORS = ['#00e5a0', '#7c6aff', '#ff6b35', '#ff3d5a'];
export const PLAYER_GLOWS  = [
  'rgba(0,229,160,.45)',
  'rgba(124,106,255,.45)',
  'rgba(255,107,53,.45)',
  'rgba(255,61,90,.45)',
];

// ─── Player identity ──────────────────────────────────────────────────────────

export function getPlayerId(): string {
  let id = localStorage.getItem('gs_player_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('gs_player_id', id); }
  return id;
}

export function getPlayerName(): string {
  return localStorage.getItem('gs_player_name') ?? '';
}

export function savePlayerName(name: string): void {
  localStorage.setItem('gs_player_name', name.trim().slice(0, 20));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genLocSeq(): RawLoc[] {
  return Array.from({ length: 5 }, () => {
    const loc = randomLandLocation();
    return { lat: loc.lat, lng: loc.lng, head: loc.head ?? 0 };
  });
}

async function genCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const { data } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle();
    if (!data) return code;
  }
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export async function createRoom(
  type: 'public' | 'private',
  maxPlayers: 2 | 4,
  playerName: string,
): Promise<{ room: Room; player: RoomPlayer } | { error: string }> {
  const player_id = getPlayerId();
  const code = await genCode();
  const loc_seq = genLocSeq();

  // create_room_with_secret atomically inserts the room and its loc_seq into
  // room_secrets, keeping location data out of the publicly readable rooms table.
  const { data: room, error: re } = await supabase.rpc('create_room_with_secret', {
    p_code:        code,
    p_host_id:     player_id,
    p_type:        type,
    p_max_players: maxPlayers,
    p_loc_seq:     JSON.stringify(loc_seq),
  });

  if (re || !room) return { error: re?.message ?? 'Could not create room' };

  const name = playerName.trim() || 'Player 1';
  const { data: player, error: pe } = await supabase
    .from('room_players')
    .insert({ room_id: room.id, player_id, name, color: PLAYER_COLORS[0], status: 'waiting' })
    .select()
    .single();

  if (pe || !player) return { error: pe?.message ?? 'Could not join room' };
  return { room: room as Room, player: player as RoomPlayer };
}

export async function findAndJoinPublicRoom(
  maxPlayers: 2 | 4,
  playerName: string,
): Promise<{ room: Room; player: RoomPlayer; players: RoomPlayer[] } | { error: string }> {
  const now = new Date().toISOString();
  const { data: candidates } = await supabase
    .from('rooms')
    .select('id, max_players')
    .eq('type', 'public')
    .eq('max_players', maxPlayers)
    .eq('status', 'waiting')
    .gt('expires_at', now)
    .order('created_at', { ascending: true })
    .limit(20);

  if (candidates) {
    for (const c of candidates) {
      const { data: existing } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', c.id)
        .neq('status', 'disconnected');

      if (existing && existing.length > 0 && existing.length < c.max_players) {
        const res = await _joinById(c.id, playerName, existing as RoomPlayer[]);
        if ('room' in res) return res;
      }
    }
  }

  // No suitable room — create one
  const cr = await createRoom('public', maxPlayers, playerName);
  if ('error' in cr) return cr;
  return { room: cr.room, player: cr.player, players: [cr.player] };
}

export async function joinRoomByCode(
  code: string,
  playerName: string,
): Promise<{ room: Room; player: RoomPlayer; players: RoomPlayer[] } | { error: string }> {
  const now = new Date().toISOString();
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('status', 'waiting')
    .gt('expires_at', now)
    .maybeSingle();

  if (!room) return { error: 'Room not found or already started' };

  const { data: existing } = await supabase
    .from('room_players')
    .select('*')
    .eq('room_id', room.id)
    .neq('status', 'disconnected');

  if (!existing) return { error: 'Could not fetch players' };
  if (existing.length >= room.max_players) return { error: 'Room is full' };

  return _joinById(room.id, playerName, existing as RoomPlayer[]);
}

async function _joinById(
  roomId: string,
  playerName: string,
  existing: RoomPlayer[],
): Promise<{ room: Room; player: RoomPlayer; players: RoomPlayer[] } | { error: string }> {
  const player_id = getPlayerId();

  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (!room) return { error: 'Room not found' };

  const alreadyIn = existing.find((p) => p.player_id === player_id);
  if (alreadyIn) return { room: room as Room, player: alreadyIn, players: existing };

  const idx = existing.length % PLAYER_COLORS.length;
  const name = playerName.trim() || `Player ${existing.length + 1}`;

  // Atomic RPC: raises 'room_full' if room filled between our check and insert (TOCTOU guard)
  const { data: player, error } = await supabase.rpc('join_room_safe', {
    p_room_id: roomId,
    p_player_id: player_id,
    p_name: name,
    p_color: PLAYER_COLORS[idx],
  });

  if (error) {
    if (error.message?.includes('room_full')) return { error: 'Room is full' };
    return { error: error.message ?? 'Could not join' };
  }
  return { room: room as Room, player: player as RoomPlayer, players: [...existing, player as RoomPlayer] };
}

// ─── Location access ──────────────────────────────────────────────────────────

// Fetches a single round's location from room_secrets via security-definer RPC.
// Requires the caller to be an active player in the room.
// The broadcast no longer includes raw coordinates — all clients call this.
export async function getNextRoundLocation(roomId: string, round: number): Promise<RawLoc> {
  const { data, error } = await supabase.rpc('get_round_location', {
    p_room_id:   roomId,
    p_round:     round,
    p_player_id: getPlayerId(),
  });
  if (error || !data) throw new Error(error?.message ?? 'round_not_found');
  return data as RawLoc;
}

// ─── Player operations ────────────────────────────────────────────────────────

export async function getRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data } = await supabase
    .from('room_players')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at');
  return (data ?? []) as RoomPlayer[];
}

export async function leaveRoom(roomId: string): Promise<void> {
  await supabase
    .from('room_players')
    .update({ status: 'disconnected' })
    .eq('room_id', roomId)
    .eq('player_id', getPlayerId());
}

export async function setRoomStatus(
  roomId: string,
  status: 'waiting' | 'playing' | 'finished',
  round?: number,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (round !== undefined) update.round = round;
  const { error } = await supabase.from('rooms').update(update).eq('id', roomId);
  if (error) console.error(`setRoomStatus: ${error.message}`);
}

// ─── Guess operations ─────────────────────────────────────────────────────────

// Submits a guess via the submit_guess security-definer RPC.
// score / time_ms / distance_km are NOT sent — the server trigger computes them.
export async function submitGuessToDb(
  roomId: string,
  round: number,
  lat: number | null,
  lng: number | null,
  meta: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc('submit_guess', {
    p_room_id:   roomId,
    p_round:     round,
    p_player_id: getPlayerId(),
    p_lat:       lat,
    p_lng:       lng,
    p_meta:      meta,
  });
  if (error) throw new Error(`submitGuessToDb: ${error.message}`);
}

// Mark a player as having submitted their guess for this round.
// Triggers Postgres Changes → handlePlayersUpdate → _checkAllGuessed on the host.
export async function markPlayerGuessed(roomId: string, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('room_players')
    .update({ status: 'guessed' })
    .eq('room_id', roomId)
    .eq('player_id', playerId);
  if (error) throw new Error(`markPlayerGuessed: ${error.message}`);
}

// Reset all non-disconnected players to 'playing' at the start of each round.
export async function resetPlayersToPlaying(roomId: string): Promise<void> {
  await supabase
    .from('room_players')
    .update({ status: 'playing' })
    .eq('room_id', roomId)
    .neq('status', 'disconnected');
}

export async function getRoundGuesses(
  roomId: string,
  round: number,
): Promise<Array<{ player_id: string; lat: number | null; lng: number | null; distance_km: number | null; score: number; time_ms: number }>> {
  const { data } = await supabase
    .from('round_guesses')
    .select('player_id, lat, lng, distance_km, score, time_ms')
    .eq('room_id', roomId)
    .eq('round', round);
  return data ?? [];
}

// Store the current round's target coordinates for the score-recomputation trigger.
// startOffsetMs must match the delay used in the broadcast so that round_started_at
// reflects the actual moment clients begin playing, not the DB write time.
export async function setRoundTarget(
  roomId: string,
  lat: number,
  lng: number,
  startOffsetMs = 1500,
): Promise<void> {
  const roundStartedAt = new Date(Date.now() + startOffsetMs).toISOString();
  const { error } = await supabase
    .from('rooms')
    .update({ cur_lat: lat, cur_lng: lng, round_started_at: roundStartedAt })
    .eq('id', roomId);
  if (error) console.error(`setRoundTarget: ${error.message}`);
}

// Atomic score increment — prevents lost-update race if two rounds resolve close together.
// Requires the add_round_score RPC in supabase/schema.sql.
export async function updatePlayerScore(
  roomId: string,
  playerId: string,
  delta: number,
  roundScore: number,
): Promise<void> {
  await supabase.rpc('add_round_score', {
    p_room_id:     roomId,
    p_player_id:   playerId,
    p_delta:       delta,
    p_round_score: roundScore,
  });
}
