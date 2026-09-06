create table if not exists players (
  id text primary key,
  username text,
  current_character_id text,
  pending_inheritance jsonb,
  created_at timestamptz not null default now()
);

create table if not exists characters (
  id text primary key,
  player_id text not null references players(id),
  name text not null,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table characters add column if not exists away_until timestamptz;
alter table characters add column if not exists away_notified boolean not null default false;
create index if not exists characters_player_idx on characters(player_id);
create index if not exists characters_away_idx on characters(away_until) where away_until is not null and not away_notified;
create index if not exists characters_name_idx on characters(lower(name));

create table if not exists hall_of_heroes (
  id bigserial primary key,
  character_id text not null references characters(id),
  name text not null,
  ending text not null,
  record jsonb not null,
  at timestamptz not null
);

create table if not exists corpses (
  id bigserial primary key,
  floor int not null,
  room_id text not null,
  item jsonb not null,
  character_id text not null references characters(id),
  character_name text not null,
  epitaph text not null,
  looted_by text,
  looted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists corpses_place_idx on corpses(floor, room_id) where looted_by is null;

create table if not exists heir_claims (
  token text primary key,
  from_character_id text not null references characters(id),
  from_name text not null,
  label text not null,
  shards int not null,
  item jsonb,
  claimed_by text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists achievements (
  id bigserial primary key,
  key text not null,
  character_id text not null references characters(id),
  data jsonb not null,
  at timestamptz not null default now()
);
create unique index if not exists achievements_first_idx on achievements(key) where key like 'first:%';

-- every Defy fate attempt: the Chronicler's primary input
create table if not exists improvise_log (
  id bigserial primary key,
  character_id text not null references characters(id),
  player_id text not null,
  floor int not null,
  room_id text not null,
  in_combat boolean not null,
  text text not null,
  proposal jsonb not null,
  roll int not null,
  dc int not null,
  success boolean not null,
  result text not null,
  narration text,
  model text,
  fallback boolean not null default false,
  latency_ms int not null default 0,
  at timestamptz not null default now()
);
create index if not exists improvise_log_at_idx on improvise_log(at);
