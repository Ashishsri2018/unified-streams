# Provider Policy Simplification and Remote Settings

Status: remote settings storage (section 6) and in-memory new/updated provider
badges (section 5) are implemented. The policy schema migration in sections 2-4,
upstream-disabled adoption, and update reconciliation logging are proposed and
not applied yet.

## 1. Goals

- Replace overlapping provider controls with one deploy-time policy file and one
  runtime admin layer.
- Make Railway the primary instance and Beamup the backup instance without
  maintaining long duplicate deny lists in two profiles.
- Keep admin overrides across restarts and deploys on Railway, which has no
  permanent disk.
- Preserve fail-open behavior: a missing provider or an upstream failure must not
  return 5xx to clients.

## 2. Target precedence

Lowest to highest:

1. Upstream manifest availability.
2. `config/providers.json` profile deny list.
3. Admin runtime override from `/admin`.
4. `locked` provider IDs in `config/providers.json`.

A provider is active only if it exists upstream and is not denied by the
effective policy. `locked` is absolute and cannot be overridden by `/admin` or
environment variables.

`INSTANCE_PROFILE` selects the profile. Unknown values and `generic` fall back to
the `defaultProfile`, which will be `railway`.

## 3. Target `config/providers.json` shape

```json
{
  "defaultProfile": "railway",
  "duplicatePriority": ["nuvio", "vega", "sa7"],
  "locked": ["torrentio"],
  "duplicates": {
    "4khdhub": { "nuvio": ["hexion"], "vega": ["4khdhub"], "sa7": ["4khdhub"] }
  },
  "profiles": {
    "railway": {
      "sa7": { "deny": [] },
      "nuvio": { "deny": [] },
      "vega": { "deny": [] }
    },
    "beamup": {
      "sa7": { "deny": [] },
      "nuvio": { "deny": [] },
      "vega": { "deny": [] }
    }
  }
}
```

Rules:

- `locked` is the single source for hard-disabled classes. Remove
  `HARD_DISABLED_PROVIDERS` and the matching list in
  `scripts/check-provider-policy.mjs`.
- Duplicate group keys are display/logical names. Fleet arrays list the actual
  upstream provider IDs. Variants in the same fleet are allowed.
- Profile lists contain only non-duplicate decisions. Duplicate copies are
  derived from `duplicates` plus `duplicatePriority`.
- Remove `allow` mode and `*_ENABLED_*` / `*_DISABLED_*` provider environment
  variables. `*` remains valid in a deny list to disable a whole fleet.
- New unique providers are enabled automatically on both profiles because both
  remain deny-based.
- New duplicate providers are also enabled automatically until they are added to
  `duplicates`; add the group and redeploy to enforce one primary copy on
  Railway and backups on Beamup.

## 4. Duplicate allocation

Railway:

- Exactly one copy per duplicate group.
- The first fleet in `duplicatePriority` that has the provider wins.
- All other copies are denied.

Beamup:

- Every non-primary copy in the group is active, including same-fleet variants.
- The Railway primary is denied.
- Non-duplicate providers keep the existing Beamup selection.

Groups whose current Railway primary must be corrected when this schema lands:
`anikoto`, `animesalt`, `anizone`, `castle`, `hdhub4u`, `kisskh`,
`multimovies`, `netmirror`, `moviebox`, `showbox`, `animeworld`.

Worker contract:

- Derive one `PROVIDER_POLICY_JSON` per fleet with
  `{ "version", "locked", "disabled", "overrides" }`.
- Workers apply `locked` first, then admin overrides, then `disabled`.
- Remove the separate enabled/disabled fleet environment variables after all
  three worker loaders consume the consolidated payload.

## 5. Providers added or enabled by upstream updates

### What already works

All profiles use deny lists, so a provider that appears in a new upstream manifest
with `enabled: true` (Nuvio/SA7) or `disabled: false` (Vega) is adopted
automatically on the next snapshot activation. No config edit or allowlist entry
is needed. This is the main reason to keep deny mode.

Upstream refresh timing differs by fleet:

- SA7: the scheduler replaces `DATA_DIR/sa7/cb-providers` and reloads the worker.
- Nuvio: the snapshot manager downloads and activates the new snapshot in-process.
- Vega: the updater installs and activates the new provider snapshot in-process.

### Current gap: upstream-disabled providers

Providers marked disabled by upstream are filtered out before runtime policy is
applied, so `/admin` cannot reliably enable them today:

- Nuvio keeps them in the catalog but `enabledEntries()` requires
  `entry.enabled`; an admin `true` override persists but the scraper is not
  loaded.
- SA7 shows them in the catalog but `buildRegistry()` filters
  `entry.enabled === false`; an admin `true` override has no effect.
- Vega's `parseManifest()` drops `disabled: true` entries entirely, so they do
  not appear in `/admin` and a toggle returns "not present".

That is not the same as a newly added provider. A new provider that upstream
ships enabled is already adopted; a provider upstream deliberately disables is a
separate decision.

### Recommended behavior

Keep upstream-disabled providers visible but inactive by default. Add one
explicit deploy-time adoption list:

```json
{
  "adoptUpstreamDisabled": ["some-provider-id"]
}
```

Semantics:

1. Parse and catalog every manifest entry, including upstream-disabled entries.
2. Add `upstreamEnabled: boolean` to `ProviderCatalogEntry` and show an
   `upstream disabled` badge in `/admin`.
3. Effective enablement is:
   `upstreamEnabled ? policy : adoptUpstreamDisabled.includes(id) && policy`.
4. `locked` still wins over everything. Profile denies and duplicate allocation
   still apply to adopted providers.
5. Do not let an ordinary admin toggle force an upstream-disabled provider.
   Require the config list so the exception is reviewed and deployed. If an
   admin force-enable path is wanted later, gate it behind a separate explicit
   env flag and log it as a forced activation.

This keeps the common case automatic while making the risky case deliberate.

### Admin-disabled providers and upstream version changes

Current behavior: admin overrides are keyed by provider ID, not version. When
upstream ships a new version with the same ID, the `false` override survives the
snapshot reload, so the provider stays disabled. If the ID changes, the old
override becomes `missing` and the new ID appears as a new provider.

Decisions:

- Do **not** auto-enable a provider because its upstream version changed. The
  operator disabled it deliberately, so a version bump alone is not enough.
- Show a `new` badge for an ID first seen after startup.
- Show an `updated v1.2.0 -> v1.3.0` badge when an existing ID changes version.
  Show it on any provider, not only admin-disabled ones.
- Badges are informational and do not affect enablement.
- A missing provider only produces the existing warning log; do not try to match
  it to a renamed ID or carry over the old override automatically.

How to detect it:

1. Add `version`, `isNew`, `updated`, and `previousVersion` to
   `ProviderCatalogEntry`. All three manifests already carry a per-provider
   version.
2. Each fleet keeps the versions from the first snapshot activated in the current
   process as its baseline and compares each new snapshot against that baseline.
   If there is no usable baseline yet, do not mark every provider as new.
3. The admin table renders `new` and `updated v1.2.0 -> v1.3.0` badges next to
   the provider name.
4. The flags reflect changes seen during the current process and reset on
   restart. No extra D1 schema is needed for badges.
5. Keep the existing Enable action and the normal disable override. A version
   update never changes the override.

### Update reconciliation

On every snapshot activation, compare previous and current manifest IDs and log:

- `providers_added`: new IDs and whether they are upstream-enabled.
- `providers_removed`: IDs that disappeared. The existing departed-provider
  warning remains the only rename signal.
- `providers_state_changed`: `enabled`/`disabled` flips reported by upstream.

Surface the same counts on `/admin` or `/health` so a new provider is visible
without reading logs. Do not auto-write new IDs into `config/providers.json`.

### Duplicate-map interaction

An unknown new ID auto-enables on both profiles until it is added to
`duplicates`. If that is too permissive for Railway, add a stricter option:

- `unknownDuplicatePolicy: "adopt" | "primary-only" | "hold"`.

Recommended default remains `adopt` so upstream additions are not silently lost.
`hold` would require an explicit map entry before Railway enables the provider.
The update reconciliation log should name any unclassified ID.

### Feasibility

- New upstream-enabled providers: already feasible; add diff tests and admin
  visibility.
- Enabling upstream-disabled providers: feasible with moderate changes to all
  three catalog/loader paths and the shared catalog contract. The main risk is
  loading providers upstream marked broken or incomplete, so make it an explicit
  config opt-in rather than a blanket admin override.
- No provider-selection rate limiting or new client throttles are needed.

## 6. Remote settings storage

Use the existing Cloudflare Worker and its D1 database. D1 is already bound to
the Worker, is transactional, and does not need S3 credentials or another R2
binding. R2 remains optional for log archives only.

### Data model

`cloudflare/migrations/0002_settings.sql`:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
```

The only key currently used is `provider_overrides`. The value is the same JSON
document as `DATA_DIR/provider-overrides.json`.

### Worker API

Both endpoints use the existing `Authorization: Bearer <AUTH_TOKEN>` check.

- `GET /v1/settings` returns `{ settings: null }` when no row exists, otherwise
  `{ settings, version, updatedAt }`.
- `PUT /v1/settings` accepts `{ settings }`, stores it atomically, increments the
  remote row version, and returns `{ ok: true, version, updatedAt }`.
- Payloads over 64 KiB are rejected with HTTP 413.

Apply the migration once per environment:

```bash
cd cloudflare/ingest-worker
npx wrangler d1 execute unified_streams_logs --remote --file ../migrations/0002_settings.sql
```

### Gateway behavior

Environment:

```bash
CLOUDFLARE_SETTINGS_ENDPOINT=https://<worker>.<account>.workers.dev
CLOUDFLARE_SETTINGS_TOKEN=<AUTH_TOKEN>
```

Startup order:

1. Load `DATA_DIR/provider-overrides.json`.
2. If the remote endpoint is configured and returns settings, validate and apply
   them, then rewrite the local file as a cache.
3. If the endpoint is unset, returns `settings: null`, or fails, keep the local
   file.
4. If neither has data, use empty overrides and the deploy-time defaults.

The admin page always writes to the local file first. A `Save to Cloudflare`
button uploads the current snapshot explicitly. This avoids losing the only copy
when a remote call fails and keeps toggles responsive. After a deploy, the remote
snapshot wins when present, so an operator can restore overrides without a
persistent volume.

Operational caveats:

- If D1 has no row, a Railway restart falls back to local state, then defaults.
  Click Save after the policy is correct.
- If the remote load fails, the gateway logs a warning and continues with local
  state; it does not fail startup.
- The endpoint must be protected by a long random token. Do not reuse the admin
  token.
- Remote settings are one global document, not per-instance. Running two
  writable instances means the last Save wins.

## 7. Implementation order

1. Add the D1 table and Worker settings endpoints.
2. Add the gateway remote client, startup load, admin save endpoint, and UI.
3. Add tests for load/save, missing remote data, and admin save.
4. Migrate the policy schema and duplicate map.
5. Add `upstreamEnabled` to the shared catalog, retain upstream-disabled entries
   in Vega, and render the admin badge.
6. Add `adoptUpstreamDisabled`, loader enforcement, and snapshot diff logging
   (the in-memory `updated`/`new` admin badges are implemented).
7. Remove provider environment overrides and allow mode from `src/core/env.ts`,
   docs, and examples.
8. Update all three fleet loaders to consume `PROVIDER_POLICY_JSON`.
9. Rewrite policy/admin tests around profile, duplicate, lock, and upstream
   precedence.
10. Run `npm run lint`, `npm run typecheck`, and `npm run test:feature`; leave
    `npm run build` and `npm run verify` to CI.
