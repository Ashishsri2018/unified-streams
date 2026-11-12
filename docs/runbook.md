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

## Incident Management
- If an upstream provider consistently fails (>30% timeouts or >50% errors over 7 days), check `config/providers.json` and replace it with a reserve duplicate from `config/provider-audit.csv`.
- Never re-enable default-disabled scraper classes (YouTube, torrent scraper, Internet Archive).
