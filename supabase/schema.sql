-- GeoSense Multiplayer Schema
-- Run this in the Supabase SQL Editor for your project.

create extension if not exists "uuid-ossp";
-- Required for server-side haversine distance calculation
create extension if not exists cube;
create extension if not exists earthdistance;

-- ─── rooms ───────────────────────────────────────────────────────────────────
create table if not exists rooms (
  id          uuid default uuid_generate_v4() primary key,
  code        text unique not null,
  host_id     text not null,
  type        text not null default 'public'
                check (type in ('public', 'private')),
  max_players int  not null check (max_players in (2, 4)),
  status      text not null default 'waiting'
                check (status in ('waiting', 'playing', 'finished')),
  round       int  not null default 0,
  loc_seq     jsonb not null default '[]',
  -- Current round's target location — written by host before broadcasting round:start.
  -- Used by the score recomputation trigger so the server can validate client scores.
  cur_lat     double precision,
  cur_lng     double precision,
  created_at  timestamptz default now(),
  expires_at  timestamptz default (now() + interval '2 hours')
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
  id          uuid default uuid_generate_v4() primary key,
  room_id     uuid references rooms(id) on delete cascade,
  player_id   text not null,
  round       int  not null,
  lat         double precision,
  lng         double precision,
  distance_km double precision,
  score       int  not null default 0,
  time_ms     int  not null default 0,
  submitted_at timestamptz default now(),
  unique (room_id, player_id, round)
);

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

do $$ begin
  if not exists (select 1 from pg_policies where tablename='rooms' and policyname='anon_all') then
    create policy anon_all on rooms        for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='room_players' and policyname='anon_all') then
    create policy anon_all on room_players for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='round_guesses' and policyname='anon_all') then
    create policy anon_all on round_guesses for all using (true) with check (true);
  end if;
end $$;

-- ─── Enable Realtime ─────────────────────────────────────────────────────────
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table rooms;

-- ─── RPC: join_room_safe (P0-2 — atomic join, prevents TOCTOU over-enroll) ──
-- Uses advisory lock on the room to serialize concurrent join attempts.
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
  -- Serialize joins for this room using an advisory lock
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
$$ language plpgsql;

-- ─── RPC: add_round_score (P1-6 — atomic score increment) ───────────────────
-- Uses SET total_score = total_score + delta rather than a read-modify-write
-- so concurrent round resolutions don't produce lost updates.
create or replace function add_round_score(
  p_room_id    uuid,
  p_player_id  text,
  p_delta      int,
  p_round_score int
) returns void as $$
begin
  update room_players
    set total_score  = total_score + p_delta,
        round_scores = round_scores || to_jsonb(p_round_score)
    where room_id   = p_room_id
      and player_id = p_player_id;
end;
$$ language plpgsql;

-- ─── Trigger: recompute score server-side (P1-8) ─────────────────────────────
-- Overwrites the client-supplied score with the server-computed value so
-- clients cannot submit inflated scores. Requires cur_lat/cur_lng to be set on
-- the room before guesses are submitted (done by the host via setRoundTarget()).
create or replace function compute_guess_score() returns trigger as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_dist double precision;
begin
  -- Look up the authoritative target for this room's current round
  select cur_lat, cur_lng into v_lat, v_lng from rooms where id = new.room_id;

  if v_lat is not null and new.lat is not null then
    v_dist := earth_distance(
      ll_to_earth(new.lat, new.lng),
      ll_to_earth(v_lat,   v_lng)
    ) / 1000.0;
    new.distance_km := v_dist;
    new.score       := greatest(0, round(5000.0 * exp(-v_dist / 2000.0))::int);
  else
    new.distance_km := null;
    new.score       := 0;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_compute_guess_score on round_guesses;
create trigger trg_compute_guess_score
  before insert or update on round_guesses
  for each row execute function compute_guess_score();
