-- ==============================================================================
-- PredictionFantasy PostgreSQL Database Schema & Security Policies (Supabase)
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Profiles Table (Extends Supabase Auth.users)
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text,
    display_name text,
    avatar_url text,
    total_score integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Index for leaderboard queries
create index if not exists idx_profiles_total_score on public.profiles (total_score desc);

-- ------------------------------------------------------------------------------
-- 2. Matches Cache Table (Synced from Football-Data.org API)
-- ------------------------------------------------------------------------------
create table if not exists public.matches_cache (
    id text primary key, -- Format: '2026_week_1'
    season text not null default '2026',
    gameweek integer not null,
    matches jsonb not null default '[]'::jsonb,
    last_updated timestamptz default now()
);

-- ------------------------------------------------------------------------------
-- 3. Predictions Table
-- ------------------------------------------------------------------------------
create table if not exists public.predictions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    season text not null default '2026',
    gameweek integer not null,
    match_id text not null,
    home_score integer,
    away_score integer,
    points integer default 0,
    multiplier_badge text,
    updated_at timestamptz default now(),
    unique(user_id, season, gameweek, match_id)
);

create index if not exists idx_predictions_lookup on public.predictions (season, gameweek, user_id);
create index if not exists idx_predictions_gw_match on public.predictions (season, gameweek, match_id);

-- ------------------------------------------------------------------------------
-- 4. Leagues & Members Tables
-- ------------------------------------------------------------------------------
create table if not exists public.leagues (
    id uuid default gen_random_uuid() primary key,
    code text unique not null,
    name text not null,
    type text not null default 'classic', -- 'classic' | 'h2h'
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz default now()
);

create table if not exists public.league_members (
    league_id uuid references public.leagues(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    joined_at timestamptz default now(),
    primary key (league_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 5. System Announcements Table (Real-time Broadcasts)
-- ------------------------------------------------------------------------------
create table if not exists public.system_announcements (
    id text primary key default 'global',
    message text not null default '',
    type text not null default 'info', -- 'info' | 'warning' | 'success'
    active boolean not null default false,
    updated_at timestamptz default now()
);

-- Insert initial announcement row if empty
insert into public.system_announcements (id, message, type, active)
values ('global', 'Welcome to PredictionFantasy 2026/2027 Season!', 'info', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------
-- 6. User Signup Trigger (Auto-populates public.profiles on Auth register)
-- ------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email, display_name, avatar_url, total_score)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url',
        0
    )
    on conflict (id) do update set
        email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);
    return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists and recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 7. Row Level Security (RLS) Policies
-- ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.matches_cache enable row level security;
alter table public.predictions enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.system_announcements enable row level security;

-- Profiles: Anyone authenticated can view all profiles (for leaderboards); users can update their own profile; admin or user can delete
create policy "Allow public read for profiles" on public.profiles for select using (true);
create policy "Allow users to update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Allow admin and self delete profiles" on public.profiles for delete using (
    auth.uid() = id or (auth.jwt()->>'email') = 'yousefhegazi74@gmail.com'
);

-- Matches Cache: Public read; authenticated can trigger cache update
create policy "Allow public read matches_cache" on public.matches_cache for select using (true);
create policy "Allow write matches_cache" on public.matches_cache for all using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Predictions: Anyone can read predictions (for leaderboards & H2H); users can only write/update their own; admin can delete
create policy "Allow public read predictions" on public.predictions for select using (true);
create policy "Allow user insert own predictions" on public.predictions for insert with check (auth.uid() = user_id);
create policy "Allow user update own predictions" on public.predictions for update using (auth.uid() = user_id);
create policy "Allow admin and user delete predictions" on public.predictions for delete using (
    auth.uid() = user_id or (auth.jwt()->>'email') = 'yousefhegazi74@gmail.com'
);

-- Leagues: Public read; authenticated can create leagues
create policy "Allow public read leagues" on public.leagues for select using (true);
create policy "Allow authenticated create leagues" on public.leagues for insert with check (auth.role() = 'authenticated');
create policy "Allow creator update league" on public.leagues for update using (auth.uid() = created_by);
create policy "Allow creator delete league" on public.leagues for delete using (auth.uid() = created_by);

-- League Members: Public read; authenticated can join leagues
create policy "Allow public read league_members" on public.league_members for select using (true);
create policy "Allow user join league" on public.league_members for insert with check (auth.uid() = user_id);
create policy "Allow user leave league" on public.league_members for delete using (auth.uid() = user_id);

-- System Announcements: Public read; admin/service_role write
create policy "Allow public read announcements" on public.system_announcements for select using (true);
create policy "Allow write announcements" on public.system_announcements for all using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- Enable Realtime for live updates
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.predictions;
alter publication supabase_realtime add table public.matches_cache;
alter publication supabase_realtime add table public.system_announcements;
