CREATE TABLE IF NOT EXISTS site_campaigns (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO site_campaigns (id, enabled, starts_at, ends_at, updated_at)
VALUES ('samla', 1, '2026-11-24T00:00:00.000Z', '2026-12-03T06:00:00.000Z', '2026-11-24T00:00:00.000Z');
