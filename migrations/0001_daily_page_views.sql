-- Deliberately coarse, anonymous service health metric. No player or room data is persisted.
CREATE TABLE IF NOT EXISTS daily_page_views (
  day INTEGER PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);
