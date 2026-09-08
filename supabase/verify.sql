-- Run after 001_init.sql to verify security-critical properties.
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('rooms','players','field_cards','field_card_secrets','player_cards','game_results','game_events')
order by relname;

-- Expected: false.
select has_table_privilege('authenticated', 'public.field_card_secrets', 'SELECT') as authenticated_can_select_field_secrets;

-- Expected: create_room=true, start_game=true, direct_emit_event=false.
select
  has_function_privilege('authenticated', 'public.create_room(text)', 'EXECUTE') as create_room,
  has_function_privilege('authenticated', 'public.start_game(uuid)', 'EXECUTE') as start_game,
  has_function_privilege('authenticated', 'public.emit_game_event(uuid,text,jsonb)', 'EXECUTE') as direct_emit_event;

-- Expected: field_card_secrets is absent.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
