-- Household food inventory for FoodAssistant (Larder).
-- Applied to the shared family Supabase project (panelbook hub, ref oaonarmpqybbvtldlusx).
-- Read later by the home assistant through food_inventory().

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique default gen_random_uuid()::text,
  name text not null,
  location text not null,
  quantity text not null default '1',
  unit text not null default '',
  notes text not null default '',
  source text not null default 'manual',
  added_at timestamptz not null default now(),
  used_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint food_items_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint food_items_location_chk check (location in ('fridge', 'freezer', 'cupboard')),
  constraint food_items_quantity_len check (char_length(btrim(quantity)) between 1 and 40),
  constraint food_items_unit_len check (char_length(unit) <= 40),
  constraint food_items_notes_len check (char_length(notes) <= 280),
  constraint food_items_source_chk check (source in ('manual', 'receipt'))
);

comment on table public.food_items is
  'Household food on hand. One row per thing in the fridge, freezer, or cupboard. used_at stays null until someone ticks it off while cooking. Written by the Larder app (FoodAssistant). Read by that app and, later, the home assistant via public.food_inventory().';

comment on column public.food_items.client_id is
  'Id minted on the phone or tablet. Retries reuse it so the same item is not added twice.';
comment on column public.food_items.location is
  'Where it lives: fridge, freezer, or cupboard.';
comment on column public.food_items.quantity is
  'How many, as typed. Examples: 1, 2, half.';
comment on column public.food_items.unit is
  'Optional measure. Examples: tin, bag, bottle. Empty string if none.';
comment on column public.food_items.notes is
  'Optional short note, such as open or use first.';
comment on column public.food_items.source is
  'manual when someone typed it, receipt when it was taken from a scanned till receipt.';
comment on column public.food_items.added_at is
  'When it was put on the list.';
comment on column public.food_items.used_at is
  'Null while it is still in the house. Set when it is ticked off as used in cooking.';
comment on column public.food_items.updated_at is
  'Last change. Maintained by trigger.';

create index food_items_on_hand_idx
  on public.food_items (location, lower(name))
  where used_at is null;

create index food_items_used_at_idx
  on public.food_items (used_at desc)
  where used_at is not null;

create or replace function public.food_items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger food_items_set_updated_at
before update on public.food_items
for each row
execute function public.food_items_set_updated_at();

alter table public.food_items enable row level security;

create policy food_items_anon_select
  on public.food_items
  for select
  to anon, authenticated
  using (true);

create policy food_items_anon_insert
  on public.food_items
  for insert
  to anon, authenticated
  with check (
    location in ('fridge', 'freezer', 'cupboard')
    and source in ('manual', 'receipt')
    and char_length(btrim(name)) between 1 and 120
  );

create policy food_items_anon_update
  on public.food_items
  for update
  to anon, authenticated
  using (true)
  with check (
    location in ('fridge', 'freezer', 'cupboard')
    and source in ('manual', 'receipt')
    and char_length(btrim(name)) between 1 and 120
  );

create policy food_items_anon_delete
  on public.food_items
  for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.food_items to anon, authenticated;

create view public.food_on_hand
with (security_invoker = true) as
select
  id,
  client_id,
  name,
  location,
  quantity,
  unit,
  notes,
  source,
  added_at,
  updated_at
from public.food_items
where used_at is null;

comment on view public.food_on_hand is
  'Food still in the house. food_items rows whose used_at is null.';

grant select on public.food_on_hand to anon, authenticated;

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
          'id', id,
          'client_id', client_id,
          'name', name,
          'location', location,
          'quantity', quantity,
          'unit', unit,
          'notes', notes,
          'source', source,
          'added_at', added_at
        )
        order by location, lower(name)
      )
      from public.food_items
      where used_at is null
    ), '[]'::jsonb),
    'recently_used', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'client_id', client_id,
          'name', name,
          'location', location,
          'quantity', quantity,
          'unit', unit,
          'notes', notes,
          'source', source,
          'added_at', added_at,
          'used_at', used_at
        )
        order by used_at desc
      )
      from (
        select *
        from public.food_items
        where used_at is not null
          and used_at > now() - interval '14 days'
        order by used_at desc
        limit 100
      ) recent
    ), '[]'::jsonb)
  );
$$;

comment on function public.food_inventory() is
  'Read-only snapshot of the household food list for Larder and the future home assistant. GET or POST /rest/v1/rpc/food_inventory with the anon key. on_hand is still in the house. recently_used is ticked off in the last 14 days.';

grant execute on function public.food_inventory() to anon, authenticated;

notify pgrst, 'reload schema';
