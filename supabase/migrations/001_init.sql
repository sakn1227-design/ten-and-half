-- 10.5 production schema for Supabase.
-- Prerequisite: Authentication > Providers > Anonymous Sign-Ins = enabled.
-- Exact integer half-units: 0.5 => 1, 1 => 2, 10.5 => 21, BUST >= 22.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  host_user_id uuid not null,
  phase text not null default 'lobby' check (phase in ('lobby', 'playing', 'ended')),
  declarations integer not null default 0 check (declarations >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 24),
  seat integer not null check (seat > 0),
  declared_10_5 boolean not null default false,
  declared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, user_id), unique (room_id, seat)
);

-- Public table-card metadata. Values stay NULL until reveal so DevTools/API cannot inspect future cards.
create table if not exists public.field_cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  rank text,
  suit text,
  value_half_units smallint check (value_half_units between 1 and 20),
  is_revealed boolean not null default false,
  awarded_player_id uuid references public.players(id) on delete set null,
  sip_count numeric(7,1),
  trashed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, sequence),
  check ((is_revealed and rank is not null and suit is not null and value_half_units is not null)
      or (not is_revealed and rank is null and suit is null and value_half_units is null))
);

-- Never readable by app clients; only SECURITY DEFINER functions can read this table.
create table if not exists public.field_card_secrets (
  field_card_id uuid primary key references public.field_cards(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  rank text not null,
  suit text not null,
  value_half_units smallint not null check (value_half_units between 1 and 20)
);

create table if not exists public.player_cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  owner_user_id uuid not null,
  rank text not null,
  suit text not null,
  value_half_units smallint not null check (value_half_units between 1 and 20),
  is_initial boolean not null default false,
  is_revealed_public boolean not null default false,
  source_field_card_id uuid references public.field_cards(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.game_results (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  total_half_units integer not null,
  busted boolean not null,
  is_loser boolean not null,
  penalty_sips numeric(7,1) not null default 0,
  primary key (room_id, player_id)
);

-- Event stream for synchronized effects. It must never contain unrevealed/private card values.
create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  event_type text not null check (event_type in ('game_started','field_revealed','final_countdown','tie_break','card_awarded','card_trashed','ten_half_declared','game_ended')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists players_room_id_idx on public.players(room_id);
create index if not exists field_cards_room_id_idx on public.field_cards(room_id);
create index if not exists field_card_secrets_room_id_idx on public.field_card_secrets(room_id);
create index if not exists player_cards_room_id_idx on public.player_cards(room_id);
create index if not exists player_cards_owner_idx on public.player_cards(owner_user_id);
create index if not exists game_events_room_id_id_idx on public.game_events(room_id, id desc);

create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.players p where p.room_id = p_room_id and p.user_id = auth.uid());
$$;
revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.field_cards enable row level security;
alter table public.field_card_secrets enable row level security;
alter table public.player_cards enable row level security;
alter table public.game_results enable row level security;
alter table public.game_events enable row level security;

drop policy if exists rooms_member_select on public.rooms;
create policy rooms_member_select on public.rooms for select to authenticated using (public.is_room_member(id));
drop policy if exists players_member_select on public.players;
create policy players_member_select on public.players for select to authenticated using (public.is_room_member(room_id));
drop policy if exists field_cards_member_select on public.field_cards;
create policy field_cards_member_select on public.field_cards for select to authenticated using (public.is_room_member(room_id));
-- No SELECT policy exists on field_card_secrets.
drop policy if exists player_cards_visibility_select on public.player_cards;
create policy player_cards_visibility_select on public.player_cards for select to authenticated
using (public.is_room_member(room_id) and (owner_user_id = auth.uid() or is_revealed_public));
drop policy if exists game_results_member_select on public.game_results;
create policy game_results_member_select on public.game_results for select to authenticated using (public.is_room_member(room_id));
drop policy if exists game_events_member_select on public.game_events;
create policy game_events_member_select on public.game_events for select to authenticated using (public.is_room_member(room_id));

revoke all on public.rooms, public.players, public.field_cards, public.field_card_secrets, public.player_cards, public.game_results, public.game_events from anon;
revoke all on public.field_card_secrets from authenticated;
grant select on public.rooms, public.players, public.field_cards, public.player_cards, public.game_results, public.game_events to authenticated;
revoke insert, update, delete on public.rooms, public.players, public.field_cards, public.player_cards, public.game_results, public.game_events from authenticated;

create or replace function public.emit_game_event(p_room_id uuid, p_event_type text, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.game_events(room_id,event_type,payload) values(p_room_id,p_event_type,coalesce(p_payload,'{}'::jsonb)) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.emit_game_event(uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.create_room(p_name text)
returns table(room_id uuid, room_code text, player_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_player public.players%rowtype; v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 or char_length(trim(p_name)) > 24 then raise exception 'Name must be 1-24 characters'; end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(5),'hex'),1,6));
    exit when not exists(select 1 from public.rooms r where r.code=v_code);
  end loop;
  insert into public.rooms(code,host_user_id) values(v_code,v_user) returning * into v_room;
  insert into public.players(room_id,user_id,name,seat) values(v_room.id,v_user,trim(p_name),1) returning * into v_player;
  return query select v_room.id,v_room.code,v_player.id;
end; $$;

create or replace function public.join_room(p_code text, p_name text)
returns table(room_id uuid, room_code text, player_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_player public.players%rowtype; v_seat integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_name is null or char_length(trim(p_name))=0 or char_length(trim(p_name))>24 then raise exception 'Name must be 1-24 characters'; end if;
  select * into v_room from public.rooms where code=upper(trim(p_code)) limit 1 for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  select * into v_player from public.players where room_id=v_room.id and user_id=v_user;
  if v_player.id is not null then return query select v_room.id,v_room.code,v_player.id; return; end if;
  if v_room.phase <> 'lobby' then raise exception 'This game has already started'; end if;
  select coalesce(max(seat),0)+1 into v_seat from public.players where room_id=v_room.id;
  insert into public.players(room_id,user_id,name,seat) values(v_room.id,v_user,trim(p_name),v_seat) returning * into v_player;
  return query select v_room.id,v_room.code,v_player.id;
end; $$;

create or replace function public.start_game(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_player_count integer; v_field_count integer;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'Host only'; end if;
  if v_room.phase <> 'lobby' then raise exception 'Game already started'; end if;
  select count(*) into v_player_count from public.players where room_id=p_room_id;
  if v_player_count < 2 then raise exception 'At least 2 players are required'; end if;
  v_field_count := case when v_player_count between 2 and 3 then 5 when v_player_count between 4 and 5 then 6 else 7 end;

  create temporary table tmp_ten_half_deck(rank text not null,suit text not null,value_half_units smallint not null,rn integer not null) on commit drop;
  insert into tmp_ten_half_deck(rank,suit,value_half_units,rn)
  select rank,suit,value_half_units,row_number() over(order by random())::integer from (
    select r.rank,s.suit,case when r.rank='A' then 2 when r.rank in ('J','Q','K') then 1 else (r.rank::integer*2) end::smallint value_half_units
    from unnest(array['A','2','3','4','5','6','7','8','9','10','J','Q','K']) as r(rank)
    cross join unnest(array['♠','♥','♦','♣']) as s(suit)
  ) deck;

  insert into public.player_cards(room_id,player_id,owner_user_id,rank,suit,value_half_units,is_initial,is_revealed_public)
  select p_room_id,p.id,p.user_id,d.rank,d.suit,d.value_half_units,true,false
  from (select id,user_id,row_number() over(order by seat)::integer rn from public.players where room_id=p_room_id) p
  join tmp_ten_half_deck d on d.rn=p.rn;

  insert into public.field_cards(room_id,sequence) select p_room_id,seq from generate_series(1,v_field_count) seq;
  insert into public.field_card_secrets(field_card_id,room_id,rank,suit,value_half_units)
  select f.id,p_room_id,d.rank,d.suit,d.value_half_units from public.field_cards f
  join tmp_ten_half_deck d on d.rn=v_player_count+f.sequence where f.room_id=p_room_id;

  update public.rooms set phase='playing' where id=p_room_id;
  perform public.emit_game_event(p_room_id,'game_started',jsonb_build_object('player_count',v_player_count,'field_count',v_field_count));
end; $$;

create or replace function public.reveal_next_field_card(p_room_id uuid)
returns table(card_id uuid, sequence integer, rank text, suit text, value_half_units smallint)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_card public.field_cards%rowtype; v_secret public.field_card_secrets%rowtype;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'Host only'; end if;
  if v_room.phase <> 'playing' then raise exception 'Game is not active'; end if;
  if exists(select 1 from public.field_cards where room_id=p_room_id and is_revealed and awarded_player_id is null and not trashed) then raise exception 'Resolve the current auction first'; end if;
  select * into v_card from public.field_cards where room_id=p_room_id and not is_revealed order by sequence limit 1 for update;
  if v_card.id is null then raise exception 'No field cards remain'; end if;
  select * into v_secret from public.field_card_secrets where field_card_id=v_card.id;
  if v_secret.field_card_id is null then raise exception 'Card secret missing'; end if;
  update public.field_cards set rank=v_secret.rank,suit=v_secret.suit,value_half_units=v_secret.value_half_units,is_revealed=true where id=v_card.id returning * into v_card;
  perform public.emit_game_event(p_room_id,'field_revealed',jsonb_build_object('field_card_id',v_card.id,'sequence',v_card.sequence,'rank',v_card.rank,'suit',v_card.suit));
  return query select v_card.id,v_card.sequence,v_card.rank,v_card.suit,v_card.value_half_units;
end; $$;

create or replace function public.start_final_countdown(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id=p_room_id;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'Host only'; end if;
  if v_room.phase <> 'playing' then raise exception 'Game is not active'; end if;
  if not exists(select 1 from public.field_cards where room_id=p_room_id and is_revealed and awarded_player_id is null and not trashed) then raise exception 'No active auction'; end if;
  perform public.emit_game_event(p_room_id,'final_countdown',jsonb_build_object('requested_at',now()));
end; $$;

create or replace function public.start_tie_break(p_room_id uuid,p_player_ids uuid[],p_min_sips numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_valid_count integer; v_names text[];
begin
  select * into v_room from public.rooms where id=p_room_id;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'Host only'; end if;
  if v_room.phase <> 'playing' then raise exception 'Game is not active'; end if;
  if p_player_ids is null or cardinality(p_player_ids)<2 then raise exception 'At least two tied players are required'; end if;
  if p_min_sips is null or p_min_sips<0 then raise exception 'Invalid sip count'; end if;
  select count(*),array_agg(name order by seat) into v_valid_count,v_names from public.players where room_id=p_room_id and id=any(p_player_ids);
  if v_valid_count <> cardinality(p_player_ids) then raise exception 'Invalid tie players'; end if;
  perform public.emit_game_event(p_room_id,'tie_break',jsonb_build_object('player_ids',to_jsonb(p_player_ids),'player_names',to_jsonb(v_names),'minimum_sips',p_min_sips));
end; $$;

create or replace function public.award_field_card(p_room_id uuid,p_field_card_id uuid,p_player_id uuid,p_sips numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_card public.field_cards%rowtype; v_player public.players%rowtype;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'Host only'; end if;
  if v_room.phase <> 'playing' then raise exception 'Game is not active'; end if;
  if p_sips is null or p_sips<0 or p_sips>999 then raise exception 'Invalid sip count'; end if;
  select * into v_card from public.field_cards where id=p_field_card_id and room_id=p_room_id for update;
  if v_card.id is null then raise exception 'Card not found'; end if;
  if not v_card.is_revealed then raise exception 'Card is not revealed'; end if;
  if v_card.awarded_player_id is not null or v_card.trashed then raise exception 'Card already resolved'; end if;
  select * into v_player from public.players where id=p_player_id and room_id=p_room_id;
  if v_player.id is null then raise exception 'Player not found'; end if;
  update public.field_cards set awarded_player_id=p_player_id,sip_count=p_sips where id=p_field_card_id;
  insert into public.player_cards(room_id,player_id,owner_user_id,rank,suit,value_half_units,is_initial,is_revealed_public,source_field_card_id)
  values(p_room_id,v_player.id,v_player.user_id,v_card.rank,v_card.suit,v_card.value_half_units,false,true,v_card.id);
  perform public.emit_game_event(p_room_id,'card_awarded',jsonb_build_object('field_card_id',v_card.id,'player_id',v_player.id,'player_name',v_player.name,'rank',v_card.rank,'suit',v_card.suit,'sips',p_sips));
end; $$;

create or replace function public.trash_field_card(p_room_id uuid,p_field_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_card public.field_cards%rowtype;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'Host only'; end if;
  if v_room.phase <> 'playing' then raise exception 'Game is not active'; end if;
  select * into v_card from public.field_cards where id=p_field_card_id and room_id=p_room_id for update;
  if v_card.id is null then raise exception 'Card not found'; end if;
  if not v_card.is_revealed then raise exception 'Card is not revealed'; end if;
  if v_card.awarded_player_id is not null or v_card.trashed then raise exception 'Card already resolved'; end if;
  update public.field_cards set trashed=true where id=p_field_card_id;
  perform public.emit_game_event(p_room_id,'card_trashed',jsonb_build_object('field_card_id',v_card.id,'rank',v_card.rank,'suit',v_card.suit));
end; $$;

create or replace function public.declare_ten_half(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_player public.players%rowtype; v_total integer; v_phase text; v_initial public.player_cards%rowtype;
begin
  select phase into v_phase from public.rooms where id=p_room_id;
  if v_phase <> 'playing' then raise exception 'Game is not active'; end if;
  select * into v_player from public.players where room_id=p_room_id and user_id=v_user for update;
  if v_player.id is null then raise exception 'Player not found'; end if;
  if v_player.declared_10_5 then return; end if;
  select coalesce(sum(value_half_units),0)::integer into v_total from public.player_cards where room_id=p_room_id and player_id=v_player.id;
  if v_total <> 21 then raise exception 'Your total is not 10.5'; end if;
  update public.players set declared_10_5=true,declared_at=now() where id=v_player.id;
  update public.player_cards set is_revealed_public=true where room_id=p_room_id and player_id=v_player.id and is_initial returning * into v_initial;
  update public.rooms set declarations=declarations+1 where id=p_room_id;
  perform public.emit_game_event(p_room_id,'ten_half_declared',jsonb_build_object('player_id',v_player.id,'player_name',v_player.name,'rank',v_initial.rank,'suit',v_initial.suit));
end; $$;

create or replace function public.end_game(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_base_sips numeric; v_has_bust boolean; v_min_total integer; v_loser_count integer;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'Host only'; end if;
  if v_room.phase <> 'playing' then raise exception 'Game is not active'; end if;
  v_base_sips := 4*(1+v_room.declarations);
  delete from public.game_results where room_id=p_room_id;
  with totals as (
    select p.id player_id,coalesce(sum(pc.value_half_units),0)::integer total from public.players p
    left join public.player_cards pc on pc.player_id=p.id and pc.room_id=p_room_id where p.room_id=p_room_id group by p.id
  ) select exists(select 1 from totals where total>=22) into v_has_bust;
  if not v_has_bust then
    with totals as (
      select p.id player_id,coalesce(sum(pc.value_half_units),0)::integer total from public.players p
      left join public.player_cards pc on pc.player_id=p.id and pc.room_id=p_room_id where p.room_id=p_room_id group by p.id
    ) select min(total) into v_min_total from totals;
  end if;
  with totals as (
    select p.id player_id,coalesce(sum(pc.value_half_units),0)::integer total from public.players p
    left join public.player_cards pc on pc.player_id=p.id and pc.room_id=p_room_id where p.room_id=p_room_id group by p.id
  ), marked as (select *,case when v_has_bust then total>=22 else total=v_min_total end is_loser from totals)
  select count(*) into v_loser_count from marked where is_loser;
  insert into public.game_results(room_id,player_id,total_half_units,busted,is_loser,penalty_sips)
  with totals as (
    select p.id player_id,coalesce(sum(pc.value_half_units),0)::integer total from public.players p
    left join public.player_cards pc on pc.player_id=p.id and pc.room_id=p_room_id where p.room_id=p_room_id group by p.id
  ) select p_room_id,t.player_id,t.total,t.total>=22,
      case when v_has_bust then t.total>=22 else t.total=v_min_total end,
      case when (case when v_has_bust then t.total>=22 else t.total=v_min_total end)
           then round(v_base_sips/greatest(v_loser_count,1),1) else 0 end
    from totals t;
  update public.player_cards set is_revealed_public=true where room_id=p_room_id;
  update public.rooms set phase='ended' where id=p_room_id;
  perform public.emit_game_event(p_room_id,'game_ended',jsonb_build_object('penalty_total',v_base_sips,'loser_count',v_loser_count));
end; $$;

revoke all on function public.create_room(text) from public,anon;
revoke all on function public.join_room(text,text) from public,anon;
revoke all on function public.start_game(uuid) from public,anon;
revoke all on function public.reveal_next_field_card(uuid) from public,anon;
revoke all on function public.start_final_countdown(uuid) from public,anon;
revoke all on function public.start_tie_break(uuid,uuid[],numeric) from public,anon;
revoke all on function public.award_field_card(uuid,uuid,uuid,numeric) from public,anon;
revoke all on function public.trash_field_card(uuid,uuid) from public,anon;
revoke all on function public.declare_ten_half(uuid) from public,anon;
revoke all on function public.end_game(uuid) from public,anon;

grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text,text) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.reveal_next_field_card(uuid) to authenticated;
grant execute on function public.start_final_countdown(uuid) to authenticated;
grant execute on function public.start_tie_break(uuid,uuid[],numeric) to authenticated;
grant execute on function public.award_field_card(uuid,uuid,uuid,numeric) to authenticated;
grant execute on function public.trash_field_card(uuid,uuid) to authenticated;
grant execute on function public.declare_ten_half(uuid) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then alter publication supabase_realtime add table public.rooms; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='players') then alter publication supabase_realtime add table public.players; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='field_cards') then alter publication supabase_realtime add table public.field_cards; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_cards') then alter publication supabase_realtime add table public.player_cards; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_results') then alter publication supabase_realtime add table public.game_results; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_events') then alter publication supabase_realtime add table public.game_events; end if;
end $$;
