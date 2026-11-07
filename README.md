# Larder

The household food list. Fridge, freezer, and cupboard, on the wall tablet and on a phone.

Live: https://bigdaddydawg.github.io/FoodAssistant/larder/ (the old address forwards there)

The app itself lives in `larder/`. It sits in its own folder so Android installs it as a fresh app.

## What you do with it

- Open **the list** on the wall tablet. Tap **Used** when something goes into a meal, then say how much is left: **A bit** (a splash of milk in a coffee), **¾**, **½**, **¼**, **Nearly gone**, **Used 1** of several, or **All gone**. Two taps. **Undo** if that was a mis-tap.
- Part-used food shows a fill bar and how much is left, so a quarter bag of sweetcorn reads as a quarter bag.
- On a phone, open **Add food**. Type an item, or photograph a till receipt and keep the lines that are actually food.
- The tablet does not need a camera. Receipt photos stay on the phone. Only the names go on the list.

The same list is stored in the shared family database, so every screen shows the same things. If that database cannot be reached, the list stays in the browser and the page says which step is left.

## Wall tablet

A 2017 Android tablet in Chrome is enough. Use landscape. The type is large and the **Used** buttons are meant to be hit from a step back. Add the page to the home screen if you want it full screen.

## For a later home assistant

The rows live in `public.food_items`, with every add and use logged in `public.food_item_events`. The simple read is `public.food_inventory()`. See [API.md](API.md). The SQL is in `supabase/migrations/`. This app does not include the assistant.

Do not put card numbers, passwords, or anything private in a note. The list is shared with the household apps on the family database, and the site is public in the same way as the other household pages.
