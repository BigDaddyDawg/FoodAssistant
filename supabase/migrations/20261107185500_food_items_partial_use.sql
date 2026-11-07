-- Part-used food (a quarter bag of sweetcorn, milk after a coffee) and a usage history.

alter table public.food_items
  add column left_fraction numeric(3,2) not null default 1,
  add column opened_at timestamptz,
  add constraint food_items_left_fraction_chk check (left_fraction > 0 and left_fraction <= 1);

comment on column public.food_items.left_fraction is
  'How much of the open one is left: 1 unopened, 0.75, 0.5, 0.25. With quantity 3 and left_fraction 0.25 there are two full ones and one with a quarter left.';
comment on column public.food_items.opened_at is
  'When someone first used part of it. Null while unopened.';

create table public.food_item_events (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  item_client_id text not null,
  name text not null,
  location text not null,
  action text not null,
  quantity text,
  left_fraction numeric(3,2),
  at timestamptz not null default now(),
  constraint food_item_events_action_chk check (action in ('added','used_some','used_one','used_up','put_back','removed')),
  constraint food_item_events_location_chk check (location in ('fridge','freezer','cupboard')),
  constraint food_item_events_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint food_item_events_left_chk check (left_fraction is null or (left_fraction >= 0 and left_fraction <= 1))
);

comment on table public.food_item_events is
  'Append-only history of the household food list. One row each time something is added, partly used, used up, put back, or removed. quantity and left_fraction are what was left after the action. Written by Larder; read by the future home assistant.';

create index food_item_events_at_idx on public.food_item_events (at desc);
create index food_item_events_item_idx on public.food_item_events (item_client_id, at desc);

alter table public.food_item_events enable row level security;

create policy food_item_events_anon_select on public.food_item_events
  for select to anon, authenticated using (true);
create policy food_item_events_anon_insert on public.food_item_events
  for insert to anon, authenticated with check (true);

grant select, insert on public.food_item_events to anon, authenticated;

create or replace view public.food_on_hand
with (security_invoker = true) as
select id, client_id, name, location, quantity, unit, notes, source, added_at, updated_at, left_fraction, opened_at
from public.food_items
where used_at is null;

create or replace function public.food_inventory()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'household', 'family',
    'as_of', now(),
    'locations', jsonb_build_array('fridge', 'freezer', 'cupboard'),
    'on_hand', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id, 'client_id', client_id, 'name', name, 'location', location,
          'quantity', quantity, 'unit', unit, 'left_fraction', left_fraction, 'opened_at', opened_at,
          'notes', notes, 'source', source, 'added_at', added_at
        )
        order by location, lower(name)
      )
      from public.food_items
      where used_at is null
    ), '[]'::jsonb),
    'recently_used', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id, 'client_id', client_id, 'name', name, 'location', location,
          'quantity', quantity, 'unit', unit, 'notes', notes, 'source', source,
          'added_at', added_at, 'used_at', used_at
        )
        order by used_at desc
      )
      from (
        select * from public.food_items
        where used_at is not null and used_at > now() - interval '14 days'
        order by used_at desc
        limit 100
      ) recent
    ), '[]'::jsonb),
    'recent_events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'item_client_id', item_client_id, 'name', name, 'location', location,
          'action', action, 'quantity', quantity, 'left_fraction', left_fraction, 'at', at
        )
        order by at desc
      )
      from (
        select * from public.food_item_events
        where at > now() - interval '14 days'
        order by at desc
        limit 300
      ) ev
    ), '[]'::jsonb)
  );
$$;

comment on function public.food_inventory() is
  'Read-only snapshot of the household food list for Larder and the future home assistant. GET or POST /rest/v1/rpc/food_inventory with the anon key. on_hand is still in the house, with left_fraction for part-used items. recently_used is used up in the last 14 days. recent_events is the last 14 days of adds and uses.';

notify pgrst, 'reload schema';
