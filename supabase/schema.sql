-- GeoSense Multiplayer Schema (Anti-Cheat Hardened)
-- Idempotent — safe to re-run against an existing database.
-- Anti-cheat changes: server-authoritative scoring, restricted data access,
-- behavioral metadata collection, instant-submit penalty.

create extension if not exists "uuid-ossp";
-- Required for server-side haversine distance calculation
create extension if not exists cube;
create extension if not exists earthdistance;

-- ─── rooms ───────────────────────────────────────────────────────────────────
create table if not exists rooms (
  id               uuid default uuid_generate_v4() primary key,
  code             text unique not null,
  host_id          text not null,
  type             text not null default 'public'
                     check (type in ('public', 'private')),
  max_players      int  not null check (max_players in (2, 4)),
  status           text not null default 'waiting'
                     check (status in ('waiting', 'playing', 'finished')),
  round            int  not null default 0,
  -- cur_lat/cur_lng: set by host before each round; used by the score trigger.
  cur_lat          double precision,
  cur_lng          double precision,
  -- round_started_at: authoritative round-start timestamp for server-side time_ms.
  -- Set to (now() + broadcast_delay) so elapsed time is measured from when clients
  -- actually start playing, not from when the host writes the target.
  round_started_at timestamptz,
  created_at       timestamptz default now(),
  expires_at       timestamptz default (now() + interval '2 hours')
);

-- Migration: remove loc_seq (moved to room_secrets) and add new columns
alter table rooms drop   column if exists loc_seq;
alter table rooms add    column if not exists round_started_at timestamptz;

-- ─── room_secrets ─────────────────────────────────────────────────────────────
-- Holds per-game location sequences. Anon clients cannot SELECT this table
-- directly; all access is gated through get_round_location() (security definer).
-- This prevents bulk-fetching all future rounds' coordinates via the REST API.
create table if not exists room_secrets (
  room_id uuid primary key references rooms(id) on delete cascade,
  loc_seq jsonb not null default '[]'
);

-- ─── room_players ─────────────────────────────────────────────────────────────
create table if not exists room_players (
  room_id      uuid references rooms(id) on delete cascade,
  player_id    text not null,
  name         text not null,
  color        text not null
                 check (color in ('#00e5a0', '#7c6aff', '#ff6b35', '#ff3d5a')),
  total_score  int  not null default 0,
  round_scores jsonb not null default '[]',
  status       text not null default 'waiting'
                 check (status in ('waiting', 'playing', 'guessed', 'disconnected')),
  joined_at    timestamptz default now(),
  primary key (room_id, player_id)
);

-- ─── round_guesses ────────────────────────────────────────────────────────────
create table if not exists round_guesses (
  id           uuid default uuid_generate_v4() primary key,
  room_id      uuid references rooms(id) on delete cascade,
  player_id    text not null,
  round        int  not null,
  lat          double precision,
  lng          double precision,
  distance_km  double precision,   -- overwritten by trigger; client value ignored
  score        int  not null default 0,   -- overwritten by trigger
  time_ms      int  not null default 0,   -- overwritten by trigger (server clock)
  submitted_at timestamptz default now(),
  meta         jsonb,   -- behavioral signals: mouse_events, first_pin_ms, tab_hidden, etc.
  unique (room_id, player_id, round)
);

-- Migration: add meta column if upgrading from previous schema
alter table round_guesses add column if not exists meta jsonb;

-- ─── Performance indexes ──────────────────────────────────────────────────────
create index if not exists idx_rooms_matchmaking
  on rooms (type, max_players, status, expires_at, created_at);

create index if not exists idx_room_players_room_status
  on room_players (room_id, status);

create index if not exists idx_round_guesses_room_round
  on round_guesses (room_id, round);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
alter table rooms         enable row level security;
alter table room_players  enable row level security;
alter table round_guesses enable row level security;
alter table room_secrets  enable row level security;

-- Remove old blanket-allow policies if they exist
do $$ begin
  if exists (select 1 from pg_policies where tablename='rooms'         and policyname='anon_all') then drop policy anon_all on rooms;         end if;
  if exists (select 1 from pg_policies where tablename='room_players'  and policyname='anon_all') then drop policy anon_all on room_players;  end if;
  if exists (select 1 from pg_policies where tablename='round_guesses' and policyname='anon_all') then drop policy anon_all on round_guesses; end if;
end $$;

-- rooms: readable by all; writable by all (room creation/status updates go direct)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='rooms' and policyname='rooms_read') then
    create policy rooms_read   on rooms for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='rooms' and policyname='rooms_write') then
    create policy rooms_write  on rooms for all    using (true) with check (true);
  end if;
end $$;

-- room_players: readable and writable by all (status updates, join, disconnect)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='room_players' and policyname='rp_all') then
    create policy rp_all on room_players for all using (true) with check (true);
  end if;
end $$;

-- round_guesses: readable by all; direct inserts/updates DENIED.
-- All writes MUST go through submit_guess() (security definer RPC), which
-- validates room membership, active-game status, and coordinate ranges.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='round_guesses' and policyname='rg_select') then
    create policy rg_select on round_guesses for select using (true);
  end if;
  -- Intentionally no insert/update policy → direct anon writes are rejected.
end $$;

-- room_secrets: no policies → no anon access at all.
-- Reads only via get_round_location() and create_room_with_secret() (security definer).

-- ─── Enable Realtime ─────────────────────────────────────────────────────────
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table rooms;

-- ─── RPC: join_room_safe ─────────────────────────────────────────────────────
-- Atomic join with advisory lock to prevent TOCTOU over-enrollment.
create or replace function join_room_safe(
  p_room_id   uuid,
  p_player_id text,
  p_name      text,
  p_color     text
) returns room_players as $$
declare
  v_max    int;
  v_count  int;
  v_result room_players;
begin
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  select max_players into v_max from rooms where id = p_room_id;
  select count(*) into v_count from room_players
    where room_id = p_room_id and status != 'disconnected';

  if v_count >= v_max then
    raise exception 'room_full';
  end if;

  insert into room_players (room_id, player_id, name, color, status)
    values (p_room_id, p_player_id, p_name, p_color, 'waiting')
    returning * into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- ─── RPC: create_room_with_secret ────────────────────────────────────────────
-- Atomically creates the room and stores its loc_seq in room_secrets (not rooms).
-- The loc_seq is never exposed in the publicly readable rooms table.
create or replace function create_room_with_secret(
  p_code        text,
  p_host_id     text,
  p_type        text,
  p_max_players int,
  p_loc_seq     jsonb
) returns rooms as $$
declare
  v_room rooms;
begin
  insert into rooms (code, host_id, type, max_players, status)
    values (p_code, p_host_id, p_type, p_max_players, 'waiting')
    returning * into v_room;

  insert into room_secrets (room_id, loc_seq)
    values (v_room.id, p_loc_seq);

  return v_room;
end;
$$ language plpgsql security definer;

-- ─── RPC: get_round_location ─────────────────────────────────────────────────
-- Returns the RawLoc for a specific round only if the requesting player is an
-- active member of the room. Prevents pre-fetching all future rounds.
-- Called by every client after receiving a round:start broadcast (which no
-- longer includes raw coordinates).
create or replace function get_round_location(
  p_room_id   uuid,
  p_round     int,
  p_player_id text
) returns jsonb as $$
declare
  v_loc jsonb;
begin
  -- Validate player is active in this room
  if not exists (
    select 1 from room_players
    where room_id  = p_room_id
      and player_id = p_player_id
      and status   != 'disconnected'
  ) then
    raise exception 'not_in_room';
  end if;

  select loc_seq -> (p_round - 1)
    into v_loc
    from room_secrets
   where room_id = p_room_id;

  if v_loc is null then
    raise exception 'round_not_found';
  end if;

  return v_loc;
end;
$$ language plpgsql security definer;

-- ─── RPC: submit_guess ───────────────────────────────────────────────────────
-- The ONLY way to record a guess. Validates room membership, active-game state,
-- and coordinate sanity before inserting. score/time_ms/distance_km are
-- overwritten by the compute_guess_score trigger — clients cannot set them.
create or replace function submit_guess(
  p_room_id   uuid,
  p_round     int,
  p_player_id text,
  p_lat       double precision,
  p_lng       double precision,
  p_meta      jsonb default null
) returns void as $$
begin
  -- Validate player is active in this room
  if not exists (
    select 1 from room_players
    where room_id  = p_room_id
      and player_id = p_player_id
      and status   != 'disconnected'
  ) then
    raise exception 'not_in_room';
  end if;

  -- Validate room is actively playing
  if not exists (
    select 1 from rooms where id = p_room_id and status = 'playing'
  ) then
    raise exception 'room_not_playing';
  end if;

  -- Reject obviously impossible coordinates
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then
    raise exception 'invalid_lat';
  end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then
    raise exception 'invalid_lng';
  end if;

  insert into round_guesses (room_id, player_id, round, lat, lng, meta)
    values (p_room_id, p_player_id, p_round, p_lat, p_lng, p_meta)
  on conflict (room_id, player_id, round) do update
    set lat          = excluded.lat,
        lng          = excluded.lng,
        meta         = excluded.meta,
        submitted_at = now();
end;
$$ language plpgsql security definer;

-- ─── RPC: add_round_score ────────────────────────────────────────────────────
-- Atomic score increment — avoids lost-update race if two rounds resolve close together.
create or replace function add_round_score(
  p_room_id     uuid,
  p_player_id   text,
  p_delta       int,
  p_round_score int
) returns void as $$
begin
  update room_players
    set total_score  = total_score + p_delta,
        round_scores = round_scores || to_jsonb(p_round_score)
    where room_id   = p_room_id
      and player_id = p_player_id;
end;
$$ language plpgsql security definer;

-- ─── Trigger: server-authoritative score recomputation ───────────────────────
-- Fires BEFORE INSERT OR UPDATE on round_guesses.
-- All client-submitted score/time_ms/distance_km values are IGNORED and
-- overwritten with server-computed values.
--
-- Scoring formula (50/50 speed vs accuracy):
--   distance_score = 2500 * exp(-km / 2000)          max 2500
--   time_score     = 2500 * (remaining_ms / 90000)   max 2500
--   total          = distance_score + time_score       max 5000
--
-- Modifiers:
--   Instant-submit penalty  : time_ms <  3 000 ms → score × 0.30
--     (penalises coordinate-extraction bots that submit before seeing the panorama)
--   Speed-intuition bonus   : time_ms 3 000–15 000 ms → +200 pts (capped at 5000)
--     (rewards fast human pattern recognition)
create or replace function compute_guess_score() returns trigger as $$
declare
  v_lat         double precision;
  v_lng         double precision;
  v_dist        double precision;
  v_round_start timestamptz;
  v_elapsed_ms  bigint;
  v_dist_score  int;
  v_time_score  int;
  v_total       int;
begin
  -- Load authoritative target coordinates and round-start timestamp
  select cur_lat, cur_lng, round_started_at
    into v_lat, v_lng, v_round_start
    from rooms
   where id = new.room_id;

  if v_lat is not null and new.lat is not null then
    -- Reject obviously impossible coordinates
    if new.lat < -90 or new.lat > 90 or new.lng < -180 or new.lng > 180 then
      new.lat         := null;
      new.lng         := null;
      new.distance_km := null;
      new.score       := 0;
      new.time_ms     := 90000;
      return new;
    end if;

    -- Distance (km)
    v_dist := earth_distance(
      ll_to_earth(new.lat, new.lng),
      ll_to_earth(v_lat,   v_lng)
    ) / 1000.0;
    new.distance_km := v_dist;

    -- Server-authoritative elapsed time (client-submitted time_ms is ignored)
    if v_round_start is not null then
      v_elapsed_ms := greatest(0,
        extract(epoch from (now() - v_round_start))::bigint * 1000
      );
      v_elapsed_ms := least(v_elapsed_ms, 90000);
    else
      v_elapsed_ms := 45000;   -- penalise if timing data missing
    end if;
    new.time_ms := v_elapsed_ms::int;

    -- 50 / 50 distance + time scoring (max 5 000 total)
    v_dist_score := greatest(0, round(2500.0 * exp(-v_dist / 2000.0))::int);
    v_time_score := greatest(0,
      round(2500.0 * (greatest(0, 90000 - v_elapsed_ms)::float / 90000.0))::int
    );
    v_total := v_dist_score + v_time_score;

    -- Instant-submit penalty: bots that read coordinates and submit in < 3 s
    -- get only 30 % of the calculated score, making the attack near-worthless.
    if v_elapsed_ms < 3000 then
      v_total := round(v_total * 0.3)::int;

    -- Speed-intuition bonus: 3–15 s suggests genuine fast human reasoning
    elsif v_elapsed_ms between 3000 and 15000 then
      v_total := least(5000, v_total + 200);
    end if;

    new.score := greatest(0, v_total);

  else
    -- No guess submitted or no target set
    new.distance_km := null;
    new.score       := 0;
    if v_round_start is not null then
      new.time_ms := least(90000,
        greatest(0, extract(epoch from (now() - v_round_start))::bigint * 1000)
      )::int;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_compute_guess_score on round_guesses;
create trigger trg_compute_guess_score
  before insert or update on round_guesses
  for each row execute function compute_guess_score();

-- ─── Function: check_round_outliers ──────────────────────────────────────────
-- Returns players whose score is ≥ 2.5 standard deviations above room average.
-- Called by the host after round resolution to surface suspicious sessions.
create or replace function check_round_outliers(
  p_room_id uuid,
  p_round   int
) returns table(player_id text, score int, z_score float) as $$
begin
  return query
  with stats as (
    select
      avg(rg.score::float)    as avg_s,
      stddev(rg.score::float) as std_s
    from round_guesses rg
    where rg.room_id = p_room_id and rg.round = p_round
  )
  select
    g.player_id,
    g.score,
    case
      when s.std_s > 0 then (g.score::float - s.avg_s) / s.std_s
      else 0.0
    end as z_score
  from round_guesses g, stats s
  where g.room_id = p_room_id
    and g.round   = p_round
    and s.std_s   > 0
    and (g.score::float - s.avg_s) / s.std_s >= 2.5;
end;
$$ language plpgsql security definer;
