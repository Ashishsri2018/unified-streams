# Operations Runbook — Unified Streams

## Health & Status Monitoring
- Health check: `GET /health` (returns JSON status of gateway, workers, cache, updater, and log sink).
- Metrics & stats: `GET /stats` (returns sliding window request and provider performance metrics).
- Dashboard: `GET /status` (human-readable operational overview).

## Deployment Procedure
1. Verification runs automatically in GitHub Actions (`npm run verify` + Docker build).
2. Deploys to staging first.
3. Live staging smoke checks run against `/health`, `/manifest.json`, and stream endpoints.
4. Requires environment approval before deploying to production.
5. Deploys production using the exact same verified commit SHA.

## Cloudflare Provider Settings Backup
- Optional D1 backup for `/admin` provider overrides. Configure
  `CLOUDFLARE_SETTINGS_ENDPOINT` and `CLOUDFLARE_SETTINGS_TOKEN` on the gateway.
- Apply the schema once per environment:
  `cd cloudflare/ingest-worker && npx wrangler d1 execute unified_streams_logs --remote --file ../migrations/0002_settings.sql`
- In `/admin`, click `Save to Cloudflare` after provider changes. Startup loads
  remote settings when present, otherwise the local `DATA_DIR/provider-overrides.json`,
  otherwise defaults.
- If the save fails, local state is still valid. If a Railway redeploy lacks a
  persistent disk, a never-saved remote snapshot cannot restore overrides.

## Incident Management
- If an upstream provider consistently fails (>30% timeouts or >50% errors over 7 days), check `config/providers.json` and replace it with a reserve duplicate from the local-only, gitignored `config/provider-audit.csv`. Use the `duplicates` and `*_active` columns to find a same-site provider that is already enabled.
- Never re-enable default-disabled scraper classes (YouTube, torrent scraper, Internet Archive).
