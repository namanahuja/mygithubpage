# Elsewhere — Know what you don't know.

A mobile-first, no-interest-onboarding discovery app. **Exactly two primary tabs:** Latest (up to 25 source-dated news stories) and General (25 time-aware, offline-ready knowledge stories). Search, Saved/History, and You are top-bar overlays. Built with a dependency-light TypeScript browser client, a Node/TypeScript HTTP server, a scheduled RSS/Atom aggregator, and a bundled 175-topic library across 23 categories.

## What is actually implemented

- Editorial worth scores (1–5) and visible `whyRead` reasons; no category quotas, interest profiles, or engagement-driven ranking.
- Latest score with weights **55% worth, 25% freshness, 10% corroboration, 5% source quality, 5% novelty**, dated 7-day hard limit; similar headlines merged within 48 hours and `alsoReportedBy` retained. Read stories move behind unread ones.
- General selection: 25 at a time, editorial ranking, preference for unread/not previously shown, with read stories last. Opening or returning to the app **re-evaluates** the current mix without unnecessarily replacing it: under one hour since the last mix, retain all 25; after 1–6 hours, replace up to 5; after 6–24 hours, replace up to 12; after 24+ hours, replace up to 25 when the library permits. The previous selection survives reloads and tab switches, and **New mix** can force a replacement. Time is measured since the last substantive mix update so frequent short visits do not prevent eventual rotation.
- On every app open and foreground resume, the client checks the `/api/latest` feed (the backend may not have new publishing), checks for new Wikimedia General discoveries, and preserves its most recent offline data if disconnected. The Latest lineup stays unchanged if source reports are unchanged; newly relevant reports can enter immediately, and read items stay last. This never changes based on interests or likes.
- Story cards with directly readable summaries, native stretched-link anchors and separate save/source controls. Story details show context, why it matters, cited sources, feedback, sharing, and related topics.
- Local saves retain **full copies**, and read/viewed/known/hidden/interesting/history persists locally. Interesting is recorded but never changes ranking. Known and Not interested support Undo and recovery from Saved overlay.
- Latest API with loading skeleton, device-cache fallback, explicit ages/provenance, manual demo option and meaningful error state (never silently mixes in General).
- 175 local reference-based General stories; 50–100-word summaries and 200–500-word contextual explanations. Wikimedia featured feed enrichments are optional and can be shorter when the source text is insufficient.
- Source aggregator with 44 candidate feeds, individual failures isolated, HTTPS article URLs, ETags/Last-Modified, 9-second source timeouts, atomic JSON cache, and configurable scheduled tiers. Some candidates are intentionally disabled.
- PWA manifest, service worker, static no-JavaScript :target edition, and a standalone fully inlined HTML demo.

## Run locally

Requirements: Node.js 20+ and npm. Internet is needed to install TypeScript and retrieve new publisher feeds. An already-built package starts without third-party runtime dependencies. The deploy build pins TypeScript 5.8.3 and Node.js 22 so newer compiler defaults do not break the build.

```bash
npm install
npm run build
npm test
npm start
# open http://localhost:3000
```

To start the server with **no background ingestion**, set `SCHEDULER=off`. To run a tier once, use `npm run ingest -- breaking` (or `science`, `business`, `pop`, `lifestyle`, `trends`, `general`, `links`).

Data is stored in `DATA_DIR` (default `runtime-data/`). The scheduler is in the same Node process as the API. A dormant free hosting plan suspends the scheduler. For reliable production refresh, use an always-on paid plan and a persistent disk, or a separate external scheduler.

## API

- `GET /api/latest`: `{generatedAt, stale, stories, sources, window, tiers, provenance}`. At most 25 stories, all sourced and dated within seven days.
- `GET /api/general?visit=N&read=...&hidden=...&known=...&last=...`: 25 eligible curated topics, assuming 25 remain.
- `GET /api/general/discoveries`: periodically fetched Wikimedia general-knowledge additions, merged client-side with the 175 bundled stories. The source refresh aims for every six hours while the backend is awake.
- `GET /api/schedule`: tier refresh targets, next due time, errors, last checks.
- `GET /api/health`: uptime configuration and cache counts.
- `GET /api/stories?q=...`: mixed search results.

The API reports **publisher excerpts, not independently fact-checked articles**. With no summarization credentials, summaries are trimmed publisher text and can be shorter than 50 words rather than invented. With `LLM_API_KEY` + `SUMMARY_MODEL` set, the backend calls a model using ONLY publisher RSS excerpts and marks outputs `AI summary of publisher text`. Default is **zero API calls**. The model still cannot independently verify events from one publisher.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port; default 3000. |
| `DATA_DIR` | Atomic cache directory; use persistent volume in production. |
| `SCHEDULER` | `off` disables background polling; anything else runs it. |
| `FEEDS_JSON` / `FEEDS_FILE` | Reserved for a configuration override; code defaults are in `src/server/config.ts` (not yet wired into runtime overrides). |
| `SCHEDULE_JSON` | JSON object mapping tier to minutes. |
| `REFRESH_<TIER>_MINUTES` | Overrides tier interval, e.g. `REFRESH_BREAKING_MINUTES=15`. |
| `GENERAL_FEED` | Reserved for alternative Wikimedia feed endpoint (not yet wired). |
| `LINK_CHECK` | `on` enables daily outbound link validation (off by default to avoid unnecessary crawling). |
| `MAX_AGE_HOURS` | Reserved; the hard 168-hour maximum is enforced in code. |
| `LLM_API_KEY` | Optional, server only. Never expose in browser; no default billing. |
| `SUMMARY_MODEL` | Optional model name; both it and key are required. |

## Deployment

- **Docker:** `docker compose up --build`, then open `http://localhost:3000`.
- **Render:** `render.yaml` is a *paid Starter* production example with a 1 GB persistent disk. Do not apply without approving the cost. Free Node Render web service is possible for demos but sleeps when unused and loses its in-memory scheduling continuity.
- **Static preview:** `Elsewhere_standalone_demo.html` is a standalone file. Latest is clearly labelled as a dated demo; it never claims live updates.

## Testing, limitations and reliability

`npm test` executes dependency-free Node unit tests. `npm run test:browser` uses Python Playwright + Chromium to test embedded DOM/touch interactions. **Do not claim these tests represent iOS Safari or a deployed service.** See `TEST_RESULTS.md`.

Caveats: exact RSS availability and copyright permissions for every publisher have not been tested. The 175 reference-backed evergreen topics have not undergone independent line-by-line fact verification or a full external hyperlink audit. Several long explanations contain editorial framing/interpretations rather than uniquely sourced deep reporting. This is a substantive content-quality task before representing the library as fully editor-verified. The demo has no independent web reporting, no cloud account sync, and no native app binaries. The link checker makes best-effort HEAD/GET requests, does not retire content if the network appears down, and does not guarantee editorial correctness. The optional model integration was not exercised with live credentials.

## Current hosted deployment (November 19, 2026)

- Render free web service: **https://elsewhere-discovery-v6.onrender.com** (confirmed `live` in the Render deployment record; build and server-start logs verified).
- GitHub source: https://github.com/namanahuja/mygithubpage/tree/master/elsewhere6.
- Hosted instance is free and can sleep after inactivity; scheduled source refreshes **do not run while asleep**, and the app may take time to wake. The instance currently has no persistent Render disk.
- Publisher feed API response contents cannot be independently inspected from the restricted build container (outbound DNS restricted); publisher availability/content quality remain unverified, despite the live server boot.
- Full-time operation requires the paid Starter plan or an external scheduler plus durable storage, and explicit user approval before charges.

## On-open refresh policy (6.1)

Every new page load, home-screen PWA open, foreground resume, and network reconnection checks the latest content available from the running server. On the Render Free service, a check can initially return an old/empty cache while the server starts its ingestion; the client schedules a retry rather than inventing news.

**General rotation is time-sensitive, not arbitrary:** keep all for <1 h, replace 5 for 1–6 h, replace 12 for 6–24 h, or replace up to 25 after 24 h. This period measures time since the *last General mix change*. The persisted selection is reused for same-hour reopenings; the backend's optional Wikimedia feed can expand the candidate pool. Read / Known / Hidden / Saved signals are stored locally and only affect reading priority, removal, and preservation—not category interests or preference-driven ranking. The Manual **New mix** button is immediate.

**Latest uses verified publication dates**, not a fixed daily reset: it requests the API on each open and only changes cards if a report enters or leaves the top 25 under current ranking, goes past the seven-day age limit, or is read/removed. Refresh interval controls upstream source checks, not the guarantee of new articles. The device cache is clearly labeled if publisher access fails. The free Render process and scheduler sleep after inactivity; this on-open request is not a substitute for an always-on background scheduler.