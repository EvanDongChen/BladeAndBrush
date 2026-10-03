-- Gallery entries (PLAN.md section 8, step 5).
-- One row per submitted painting: seed + params + action log reproduce it,
-- png_url points at the object bucket (or a data URL when no bucket is set).

CREATE TABLE IF NOT EXISTS gallery_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name   TEXT,
  level_id      TEXT NOT NULL,
  seed          INTEGER NOT NULL,
  params        JSONB NOT NULL,
  action_log    JSONB NOT NULL,
  png_url       TEXT NOT NULL,
  result        JSONB NOT NULL,
  scan          JSONB,
  world_hash    INTEGER NOT NULL,
  app_version   TEXT NOT NULL,
  delete_secret UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_entries_level_created_idx
  ON gallery_entries (level_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gallery_entries_created_idx
  ON gallery_entries (created_at DESC);
