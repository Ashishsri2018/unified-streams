# Unified Streams — Open Items (todo.md)

Completed work is recorded in `CHANGELOG.md` and `memory.md`.

## Open items
- [ ] Run the one-time `Cleanup Legacy Environment` workflow on Beamup (requires typing `CLEAN`).
- [ ] Monitor provider success/timeout rates via `/stats`.
- [ ] Weekly review of failing providers (>30% timeouts or >50% errors) and swap in reserve providers via reversible `config/providers.json` PRs.
- [ ] Hydrate prefilled configuration in `src/addon/configureHtml.ts`.
- [ ] `scripts/healthcheck.mjs`: don't terminate the container during transient single-worker restarts.
- [ ] Fix the `/status` dashboard 503 crash in `src/addon/statusHtml.ts`.
- [ ] Generate CSP nonces for HTML pages and remove `'unsafe-inline'`.
- [ ] Remove dead SA7 files (`server.js`, `run.js`).
- [ ] Normalize SA7 `lastError` objects to strings in `src/addon/health.ts`.
