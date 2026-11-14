# AGENTS.md — Unified Streams

## Start here
- Single root npm package; Node 22 (`.nvmrc`), ESM, TypeScript `NodeNext`. Run commands from the repo root: config, policy, and asset paths resolve from `process.cwd()`.
- Current architecture: `src/addon/` is the only public gateway, `src/core/` is shared runtime, and `src/fleets/{sa7,nuvio,vega}` are loopback workers on ports 7001-7003.
- Read root `architecture.md` for current deployment/provider policy. `docs/architecture.md` and `BUILD_PLAN.md` are older design docs; trust code and CI when they disagree.

## Commands
```bash
npm ci
npm run dev          # tsx watch gateway; supervisor spawns all three workers
npm run test:feature
npx vitest run tests/features/app.test.ts -t "GET and HEAD /"   # single test
npm run lint
npm run typecheck
npm run build        # tsc + copy vendored fleet assets into dist
npm run verify       # policy -> icon -> lint -> typecheck -> all tests -> build
```
- ESLint ignores `src/fleets/sa7/**` and vendored fleet snapshots/baselines; `tsc` also excludes SA7 and `tests/`. SA7 edits must be plain JS.
- `npm run dev` prefers `dist/fleets/*/worker.js` when present, so it can run stale compiled workers. Rebuild or delete `dist/` after changing worker source.

## Configuration and provider policy
- Env load order: `config/defaults.env` -> `config/instances/$INSTANCE_PROFILE.env` -> process env. `INSTANCE_PROFILE=generic` locally; `beamup` and `railway` intentionally use different provider sets and timeout budgets.
- Provider availability is canonical in `config/providers.json` (fleet allow/deny plus `instances.<profile>`). `src/core/env.ts` derives worker-scoped env from it. Runtime `*_ENABLED_*` / `*_DISABLED_*` env vars are per-run overrides, not the source of truth.
- `torrentio`, `internetarchive`, `youtube`, `brellor`, and `mxplayer` are hard-disabled in both `src/core/env.ts` and `scripts/check-provider-policy.mjs`; keep both lists in sync.
- Keep `config/provider-audit.csv` aligned when replacing providers. `npm run policy:check` warns about IDs absent from the audit.
- Local `DATA_DIR` defaults to `/data`; use `DATA_DIR=./data` if it is not writable. Startup creates the per-fleet subdirectories.

## Non-obvious invariants
- Workers bind only to `127.0.0.1`, expose only `/internal/{health,stream,reload}`, and must not cache stream responses.
- Public routes support GET/HEAD/OPTIONS. `HEAD /stream/...` returns 200 without worker fan-out; `/subtitles*` is always 404; unsupported methods return 405.
- Upstream/provider failures must return HTTP 200 with `{ "streams": [] }`, never 5xx.
- Cache only non-empty gateway results: 180s complete, 30s partial, coalesced. Stream responses themselves are `no-store`.
- Only HTML pages and archives (`.zip`, `.rar`, `.7z`, etc.) go in `externalUrl`; direct playable media and extensionless links stay in `url`. Archives carry both the `🔲` name prefix and the `🖥️` title prefix applied in `src/addon/merge.ts`.
- SA7 reads providers from `DATA_DIR/sa7/cb-providers` (seeded from the bundled vendor snapshot); the updater replaces that copy atomically and then reloads the worker. Do not update bundled assets at runtime.
- New HTTP/config/env input should pass Zod; `any` is a lint error. Redact secrets and full stream URLs in logs.

## Tests, CI, and deploys
- Tests are feature/unit tests under `tests/features/`; they mock workers and do not require Docker or upstream network. Live stream behavior needs real credentials/network.
- The GitHub Actions workflow is the source of truth for `verify` (policy, icon, lint, typecheck, all Vitest tests, build) and the Docker build/smoke test run there. Local Vitest runs are allowed for iteration, but do not treat other local-only checks as sufficient evidence.
- Do not deploy to Beamup, Railway, or Cloudflare unless explicitly asked. A push to `main` triggers the production deploy workflow, so do not push unless explicitly allowed.
- `deploy-cloudflare.yml` is manual and only deploys the optional log ingest Worker.
- Docker runtime needs `config/`, `assets/`, `scripts/`, plus vendored `sa7`, `nuvio/snapshot`, and `vega/providers-baseline` copied into `dist` by `scripts/copy-fleet-assets.mjs`.
