# ENTITY - project site

The public site for ENTITY, an offline on-device LLM runtime for Arm Android phones:
animated explainers of how the optimization works, a live device leaderboard over the
contributed benchmark dataset, and the evidence and falsification record.

Live: https://kkjjkamal123.github.io/ENTITY-WEB/

## Stack

Astro + Tailwind v4, static output, no client framework. Interactive figures and the
leaderboard are vanilla-TypeScript islands. Total figure JavaScript is under 10 KB gzipped;
the leaderboard island (including the inlined data snapshot) is ~12 KB gzipped.

## Local development

```bash
npm install
npm run dev        # http://localhost:4321/ENTITY-WEB/
npm run build      # static build into dist/
npm run preview    # serve dist/ at the deploy subpath
```

The build depends only on committed files. Three helper scripts regenerate committed
artifacts and need the private source working copy (`../github/`, `../PHOTOS ENTITY */`)
present locally:

```bash
npm run build:images     # screenshots -> public/shots, icons, plots -> public/plots
npm run build:changelog  # releases/*.md -> src/data/changelog.json
npm run build:og         # Open Graph PNGs -> public/og (needs JetBrains Mono in fontconfig)
```

## Leaderboard data

`src/data/leaderboard.json` is a committed snapshot of `public.bench_results` (Supabase,
PostgREST). The page renders the snapshot immediately and replaces it with a live fetch when
the network allows; on failure it says so and keeps the snapshot.

```bash
npm run refresh:leaderboard   # refresh the snapshot (requires the anon read policy)
```

`.github/workflows/refresh-leaderboard.yml` runs the same refresh daily and commits on
change, which redeploys the site. The publishable key in `src/lib/supabase.ts` is designed
to be public; with row-level security it can only insert and select rows
(`benchmarks/CONTRIBUTE-BACKEND.md` in the source repo documents why).

Display rules implemented in `src/lib/bench.ts` / `src/scripts/leaderboard.ts`, each tracing
to `benchmarks/CONTRIBUTED-DATA.md`:

- power and tok/W never render where `power_valid` is false (charging runs);
- rows whose arms disagree on watts by more than 4x, or read under 0.8 W during decode,
  are flagged "power implausible" and excluded from power columns and aggregates (raw
  values stay visible in the detail panel) - the same judgment the dataset doc applies to
  the device that motivated it;
- run count is always shown; single-pass rows are marked provisional (documented 1-pass
  noise floor: up to 19.6%);
- arms with decode relative SD above 25% are flagged and excluded from aggregates;
- one row per device + quantization, newest first; byte-identical re-uploads are collapsed
  and counted; older runs expand inside the row.

SoC marketing names are mapped only where unambiguous (repo-documented ones, plus
Snapdragon 865 / Dimensity 700 / Helio G37); MT6886 ships under several Dimensity names and
stays raw.

## Where the content comes from

Every number on the site traces to a named file in the source repository
(`kkjjkamal123/ENTITY---Arm-Create-AI-Optimization-Challenge`); the map is
[`CONTENT-SOURCES.md`](CONTENT-SOURCES.md). Figures are labelled `measured` or `schematic`;
a schematic never borrows the look of data.

Design tokens are the shipped app's own palette (ENTITY v3.4.0, which retired pure #000 and
#FFF for halation). Status hues were validated with a palette validator against both themes;
see the comments in `src/styles/global.css`.

### v1.2.0 - hosted, live, and reconciled with the dataset

- **Hosted** at `/ENTITY-WEB` on GitHub Pages, deployed by Actions on push to `main`.
- **The live fetch actually resolves.** `public.bench_results` had row-level security on with only
  an insert policy for `anon`, so every browser fetch returned `[]` and the page silently served
  the snapshot. With the select policy applied the leaderboard reads live and says so; the nightly
  refresh workflow, which had been failing its empty-rows guard, now commits real snapshots.
- **Editorial reconciled with the table.** The prose beside the leaderboard still claimed 12 rows
  across 5 SoCs and "positive on only 3 of 6 rows" while the table below it rendered 22 rows across
  9 SoCs - the page contradicted itself. Every hardcoded dataset figure on every page was
  recomputed: thread-count range 1.34x-4.25x, pinning median +0.7% decode / +2.0% tok/W over 15
  and 14 rows. The "pinning is not an energy lever" framing was retired: one device gains 24.0%
  decode on 7.9% less power, so the honest claim is that the sign is device-dependent and
  unpredictable. Source map updated in `CONTENT-SOURCES.md`; the same corrections landed in the
  source repository's `BENCHMARKS.md`, `CONTRIBUTED-DATA.md` and `JOURNEY.md`.
- **APK links** point at the source repository's release assets instead of a repo that never existed.

### v1.1.0 - product-first redesign

The site was reworked into a product page with benchmarks. Highlights:

- **Type**: a readable system sans for prose and headings; JetBrains Mono kept only for the
  technical register (data tables, code, labels, chips, numbers).
- **Accent**: the app's own teal (`#19C39A` dark / `#10A37F` light) for chrome - links,
  buttons, focus, decoration, ambient glow. Measured figures keep their validated data palette.
- **Motion**: scroll reveals, a hero entrance, a live-metrics ticker, count-up stat numbers,
  and a keyword marquee. All are invisible-safe (nothing is hidden until `<html>` gets the `js`
  class) and fully lifted under `prefers-reduced-motion`; verify with
  `node scripts/qa-shots.mjs --nojs` and `--rm`.
- **Components**: `Carousel.astro` (one-at-a-time screenshot showcase, scroll-snap first,
  JS-enhanced arrows/dots), `Marquee.astro`, a click-to-enlarge image lightbox in `Layout`.
- **Structure**: primary nav trimmed to Overview / Leaderboard / Apps / Evidence; the deep
  technical pages moved to the footer; the leaderboard leads with a decluttered 7-column table
  and collapses its caveats into disclosures.

## Deploying

GitHub Pages via `.github/workflows/deploy.yml` on push to `main` (Pages source:
GitHub Actions). `astro.config.mjs` sets `site` and `base` for the project subpath; internal
links go through `withBase()` in `src/lib/url.ts`.

APKs are distributed as GitHub Release assets on the source repository
(`ENTITY---Arm-Create-AI-Optimization-Challenge/releases/latest/download/<file>`), not
committed to this tree.
