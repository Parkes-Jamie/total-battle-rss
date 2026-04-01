-- Run this entire script in Supabase SQL Editor

-- Players table
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rank text not null,
  rank_order integer not null default 4,
  created_at timestamptz default now()
);

-- Weekly totals (one row per player per week)
create table if not exists weekly_totals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  week_id date not null,  -- Monday date of that week e.g. 2025-01-27
  wood bigint default 0,
  stone bigint default 0,
  iron bigint default 0,
  food bigint default 0,
  silver bigint default 0,
  updated_at timestamptz default now(),
  unique(player_id, week_id)
);

-- Submission tracking (one row per week, JSON blob for the day/resource grid)
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  week_id date not null unique,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Enable RLS but allow full public read + write (admin URL is security by obscurity)
alter table players enable row level security;
alter table weekly_totals enable row level security;
alter table submissions enable row level security;

create policy "Public read players" on players for select using (true);
create policy "Public write players" on players for all using (true);

create policy "Public read totals" on weekly_totals for select using (true);
create policy "Public write totals" on weekly_totals for all using (true);

create policy "Public read submissions" on submissions for select using (true);
create policy "Public write submissions" on submissions for all using (true);

-- Seed the full roster
insert into players (name, rank, rank_order) values
  ('Ren', 'Leader', 0),
  ('swift', 'Superior', 1),
  ('Rafur', 'Superior', 1),
  ('Bazan', 'Superior', 1),
  ('Skipper', 'Superior', 1),
  ('Tey', 'Superior', 1),
  ('Conrad Hauser', 'Superior', 1),
  ('BELLA Queen', 'Superior', 1),
  ('ReTkit73', 'Superior', 1),
  ('Neli', 'Officer', 2),
  ('midnight rider', 'Officer', 2),
  ('Elodi', 'Officer', 2),
  ('Catharina CTH', 'Officer', 2),
  ('Lady McPowers', 'Officer', 2),
  ('Pathfinder SSO', 'Officer', 2),
  ('RoyalDonkeyPunch', 'Officer', 2),
  ('bigrani', 'Officer', 2),
  ('BAYBARS', 'Officer', 2),
  ('Aden', 'Officer', 2),
  ('Fegorm', 'Officer', 2),
  ('Scrast', 'Officer', 2),
  ('Bitrir', 'Officer', 2),
  ('Teven', 'Officer', 2),
  ('Yuslasay', 'Officer', 2),
  ('Finfiring', 'Officer', 2),
  ('Car85', 'Officer', 2),
  ('Pejurus', 'Officer', 2),
  ('Legionaire', 'Veteran', 3),
  ('eduu', 'Veteran', 3),
  ('Galakayilas', 'Veteran', 3),
  ('Green Hornet', 'Veteran', 3),
  ('Bathris', 'Veteran', 3),
  ('Ferdinand X', 'Veteran', 3),
  ('Arevenilas', 'Veteran', 3),
  ('AliZet', 'Veteran', 3),
  ('Glorninod', 'Veteran', 3),
  ('ESTRELLA', 'Veteran', 3),
  ('Turfinil', 'Veteran', 3),
  ('Duzragore', 'Veteran', 3),
  ('Diana', 'Veteran', 3),
  ('Railkayen', 'Veteran', 3),
  ('Gadar', 'Veteran', 3),
  ('Aeglinil', 'Veteran', 3),
  ('Salda', 'Veteran', 3),
  ('Gardazragore', 'Veteran', 3),
  ('Maedfanir', 'Veteran', 3),
  ('Firond', 'Veteran', 3),
  ('Rafaelllll', 'Veteran', 3),
  ('Eyneel', 'Veteran', 3),
  ('Eyfir', 'Veteran', 3),
  ('Ejvening', 'Veteran', 3),
  ('Lerilad', 'Veteran', 3),
  ('Vudor', 'Veteran', 3),
  ('Ayanin', 'Soldier', 4),
  ('Funien', 'Soldier', 4),
  ('Nilann', 'Soldier', 4),
  ('Loranen', 'Soldier', 4),
  ('Prince meli', 'Soldier', 4),
  ('Drakonis', 'Soldier', 4),
  ('Vogar', 'Soldier', 4),
  ('Dorr', 'Soldier', 4);
