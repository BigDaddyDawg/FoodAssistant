# Larder read API

This is the contract for a later home assistant. The assistant is not part of this app. Reads do not change any rows.

Family database: `https://oaonarmpqybbvtldlusx.supabase.co`

Send the public anon key from `larder/config.js` on both headers below. That key is already in the repo. It is not a service-role secret.

```http
apikey: <anon key from config.js>
Authorization: Bearer <anon key from config.js>
```

## Simple read

`GET /rest/v1/rpc/food_inventory`

No body. No query arguments.

```json
{
  "ok": true,
  "household": "family",
  "as_of": "2026-11-07T18:00:00.000Z",
  "locations": ["fridge", "freezer", "cupboard"],
  "on_hand": [
    {
      "id": "8b1c1a4e-1e2b-4c3d-9f00-111111111111",
      "client_id": "phone-minted-id",
      "name": "Sweetcorn",
      "location": "freezer",
      "quantity": "1",
      "unit": "bag",
      "left_fraction": 0.25,
      "opened_at": "2026-11-05T17:40:00.000Z",
      "notes": "",
      "source": "receipt",
      "added_at": "2026-11-01T12:00:00.000Z"
    }
  ],
  "recently_used": [
    {
      "id": "8b1c1a4e-1e2b-4c3d-9f00-222222222222",
      "client_id": "another-id",
      "name": "Semi-skimmed milk",
      "location": "fridge",
      "quantity": "1",
      "unit": "bottle",
      "notes": "",
      "source": "manual",
      "added_at": "2026-11-03T12:00:00.000Z",
      "used_at": "2026-11-07T08:10:00.000Z"
    }
  ],
  "recent_events": [
    {
      "item_client_id": "phone-minted-id",
      "name": "Sweetcorn",
      "location": "freezer",
      "action": "used_some",
      "quantity": "1",
      "left_fraction": 0.25,
      "at": "2026-11-07T17:40:00.000Z"
    }
  ]
}
```

- `on_hand` is still in the house (`used_at` is null), ordered by place then name.
- `left_fraction` is how much of the open one is left: `1` unopened, `0.9` opened (a splash or a bit used), `0.75`, `0.5`, `0.25`, `0.1` nearly gone. With `quantity` `3` and `left_fraction` `0.25` there are two unopened and one with a quarter left.
- `recently_used` was used up in the last 14 days, newest first, at most 100 rows.
- `recent_events` is the last 14 days of adds and uses, newest first, at most 300 rows.
- `location` is `fridge`, `freezer`, or `cupboard`.
- `source` is `manual` (typed) or `receipt` (kept from a scanned till receipt).
- `quantity` is text, so `2` and `half` are both valid. `unit` may be empty.

## Table `public.food_items`

One row per thing in the house.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | Database id. |
| `client_id` | text, unique | Id minted on the phone or tablet so a retry does not add the item twice. |
| `name` | text | What it is. 1–120 characters. |
| `location` | text | `fridge`, `freezer`, or `cupboard`. |
| `quantity` | text | How many, as typed. Defaults to `1`. **Used 1** takes one off a whole number. |
| `unit` | text | Optional. Examples: `tin`, `bag`, `bottle`. Empty string if none. |
| `left_fraction` | numeric | How much of the open one is left, above 0 up to 1. `1` is unopened. |
| `opened_at` | timestamptz, null | When part of it was first used. Null while unopened. |
| `notes` | text | Optional short note. Empty string if none. |
| `source` | text | `manual` or `receipt`. |
| `added_at` | timestamptz | When it was put on the list. |
| `used_at` | timestamptz, null | Null while it is still in the house. Set when someone taps **All gone**. |
| `updated_at` | timestamptz | Last change. |

View `public.food_on_hand` is the same rows with `used_at` null. It omits `used_at`.

## Table `public.food_item_events`

Append-only history. The app inserts a row each time something changes. Rows are never edited or deleted.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | Database id. |
| `client_id` | text, unique | Id minted on the device so a retry does not log twice. |
| `item_client_id` | text | The `food_items.client_id` it is about. |
| `name`, `location` | text | Copied from the item at the time, so history still reads after the item is gone. |
| `action` | text | `added`, `used_some` (partly used, or a bit used), `used_one` (one of several), `used_up`, `put_back` (undo), `removed` (a mistake, not eaten). |
| `quantity` | text | How many were left after the action. `0` after `used_up`. |
| `left_fraction` | numeric | How much of the open one was left after the action. `0` after `used_up`. |
| `at` | timestamptz | When it happened on the device. |

`removed` means the item was taken off the list by mistake. Do not count it as eaten. A `put_back` undoes the action just before it for that item.

## Other reads

Full item history:

`GET /rest/v1/food_items?select=*&order=added_at.desc`

Still in the house, via the view:

`GET /rest/v1/food_on_hand?select=*`

Usage over a period:

`GET /rest/v1/food_item_events?select=*&at=gte.2026-11-01&order=at.desc`

## What the app writes

The wall and the phone use the tables, not the read function.

- Add: `POST /rest/v1/food_items?on_conflict=client_id` with `Prefer: resolution=merge-duplicates`
- Part used, used one, all gone, or undo: `PATCH /rest/v1/food_items?client_id=eq.<client_id>` with the changed fields (`left_fraction`, `opened_at`, `quantity`, `used_at`)
- Not this: `DELETE /rest/v1/food_items?client_id=eq.<client_id>`
- History: `POST /rest/v1/food_item_events?on_conflict=client_id` with `Prefer: resolution=ignore-duplicates`

Receipt photos are not uploaded. The browser reads the photo on the phone and stores item names only.

## If the family database is down

The page keeps the list in `localStorage` (`larder.items.v1`) and queues changes in `larder.outbox.v1`. The banner names the step still left, for example no internet, or the table refusing the key. When the database answers, the queue is sent in order and the screen matches the other devices again.

## Schema files

The SQL that created these tables is in `supabase/migrations/`.
