# Gateway & Fleet Code Duplication Audit

## 1. Overview
Following the centralization of stream classification, all 8 audited code redundancies and duplicate subsystems shared between the public gateway (`src/addon/`) and loopback fleet workers (`src/fleets/{sa7,nuvio,vega}`) have been fully resolved and consolidated into shared canonical modules in `src/core/`.

---

## 2. Consolidation Status Summary

| Original Finding | Status | Canonical Location | Consolidations & Effects |
| :--- | :--- | :--- | :--- |
| **1. Content ID Parsing** | Resolved | `src/core/contentId.ts` | Nuvio, Vega, and SA7 now delegate to `src/core/contentId.ts`, harmonizing Season 0 specials, season packs, and anime IDs across all workers. |
| **2. Metadata Resolution** | Resolved | `src/core/metadata.ts` & `src/core/contract.ts` | Gateway resolves canonical metadata once and passes `x-meta-title`, `x-meta-year`, and `x-meta-tmdb-id` headers to loopback workers over `/internal/stream`. Workers prime local caches and eliminate duplicate upstream calls to Cinemeta & TMDB. |
| **3. Quality & Resolution** | Resolved | `src/core/streamQuality.ts` | Unified regex tables inferring 8K through 240p resolutions and quality ranking across Gateway, Nuvio, Vega, and SA7. |
| **4. Container Format Ranking** | Resolved | `src/core/streamQuality.ts` | `getContainerRank` shared across Gateway, Nuvio, and Vega, standardizing sorting priority (direct video containers > other media > streaming playlists). |
| **5. Subtitle Normalization** | Resolved | `src/core/subtitles.ts` | Centralized language alias mappings (covering Indic, European, and Asian languages) and deterministic track formatting (`normalizeSubtitlesTrackList`). |
| **6. File Size Parsing** | Resolved | `src/core/streamQuality.ts` | `parseSizeBytes` and `inferSizeBytes` handle metric/binary units (TB, GB, MB, KB, TiB, GiB, MiB) with comma or period decimals across all tiers. |
| **7. Hop-by-Hop Headers** | Resolved | `src/core/streamHeaders.ts` | Shared `sanitizeProxyHeaders` and `isPlaceholderHost` used by Nuvio and Vega to strip connection headers and validate media hosts. |
| **8. User Config Filtering** | Resolved | `src/addon/filters.ts` | Legacy v1 user configuration decoding and redundant local filter evaluation removed from SA7; Gateway performs canonical v2 user configuration filtering uniformly. |
