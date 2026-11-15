CREATE TABLE IF NOT EXISTS log_events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  service TEXT NOT NULL,
  fleet TEXT,
  event TEXT NOT NULL,
  request_id TEXT,
  route TEXT,
  type TEXT,
  content_id TEXT,
  provider TEXT,
  outcome TEXT,
  status INTEGER,
  duration_ms INTEGER,
  streams INTEGER,
  error_name TEXT,
  error_message TEXT,
  meta_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_log_events_ts ON log_events(ts);
CREATE INDEX IF NOT EXISTS idx_log_events_request ON log_events(request_id);
CREATE INDEX IF NOT EXISTS idx_log_events_fleet_event ON log_events(fleet, event);
CREATE INDEX IF NOT EXISTS idx_log_events_level_ts ON log_events(level, ts);

CREATE TABLE IF NOT EXISTS provider_metrics_1m (
  bucket_ts TEXT NOT NULL,
  fleet TEXT NOT NULL,
  provider TEXT NOT NULL,
  requests INTEGER NOT NULL,
  successes INTEGER NOT NULL,
  empties INTEGER NOT NULL,
  timeouts INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  avg_ms REAL,
  p95_ms REAL,
  PRIMARY KEY (bucket_ts, fleet, provider)
);

CREATE TABLE IF NOT EXISTS fleet_metrics_1m (
  bucket_ts TEXT NOT NULL,
  fleet TEXT NOT NULL,
  requests INTEGER NOT NULL,
  successes INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  timeouts INTEGER NOT NULL,
  cache_hits INTEGER NOT NULL,
  cache_misses INTEGER NOT NULL,
  streams INTEGER NOT NULL,
  PRIMARY KEY (bucket_ts, fleet)
);
