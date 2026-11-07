/* Larder — shared Family Vault.
   Same public project as the other household apps (panelbook hub).
   This is the public anon key. It is not the service role key.
   Do not put a service role key in this file. */
window.LARDER_CONFIG = {
  url: "https://oaonarmpqybbvtldlusx.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hb25hcm1wcXliYnZ0bGRsdXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NDM1MDksImV4cCI6MjA5OTQxOTUwOX0.VIYP8fNvEieHbFNLNRiTrTR-YNZP0IYkW1UmhIxgnqA",
  table: "food_items",
  eventsTable: "food_item_events",
  readRpc: "food_inventory"
};
