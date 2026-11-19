# Elsewhere V6 — Actual verification record (2026-11-19)

## Tests executed

- **Node unit tests:** `npm test` — **21 passed / 0 failed** (initial run had 3 invalid fixture failures because synthetic titles were too similar for deduplication; fixture corrected and full run passed). Covers age windows, scoring, deduplication, read ordering, General selection, deterministic visits, same ranking without interests/likes, RSS/Atom, link checker 403/405 fallback, Wikimedia parser, schedule configuration, source isolation, atomic persistence, tier lock, and 175-story content shape.
- **Chromium interaction suite:** `python tests/browser.py` — **5 scenarios passed / 0 failed**: desktop, phone-sized viewport with touch, static HTML with JavaScript disabled, HTTP 502 fallback simulation, and slow API loading state. Captured screenshots in `docs/desktop.png`, `docs/mobile.png`, `docs/nojs.png`.
- **Actual API smoke test:** A local Node HTTP server started with `SCHEDULER=off`, and `curl http://localhost:3107/api/health` returned HTTP 200 and the expected `generalLibrary:175`/`scheduler:false` fields.
- **TypeScript build:** Successful via `npm run build` using global TypeScript installed in the test environment.

## Browser-test environment limitation

The browser sandbox blocks normal navigation to `http://localhost:3107/`, `file://...` and external sites with `ERR_BLOCKED_BY_ADMINISTRATOR`. The Playwright script therefore exercised the actual rendered frontend **through `page.set_content()`** using the same self-contained client HTML and stubbed API responses. These were real Chromium DOM/touch tests, but they **did not** verify the complete HTTP browser-served app, service-worker offline reload, or any publisher links opening successfully on a real network.

## Not tested or not complete

- **Real iPhone Safari, iOS in-app browser, Safari/WebKit engine:** not tested.
- **External publisher feeds:** no live HTTP calls from this restricted test container; endpoint validity and terms pending.
- **Live AI summarization:** no API key; optional path not tested with a model.
- **Full factual review of 175 topics and article-specific citation links:** not completed; current content is reference-backed but not individually editor-verified.
- **Render deployment:** the first build failed because unpinned TypeScript compiled against an incompatible resolution mode. After pinning TypeScript 5.8.3 and Node 22, build passed and Render confirmed deployment `live` for V6, with boot log `175 general | 37 feeds`. The public API response contents and true individual publisher freshness could not be independently inspected from this restricted network.
- **Docker build:** Docker engine unavailable in the current test container; Dockerfile/compose syntax not run.
- **Production Scheduler uptime and disk persistence:** unverified; requires always-on hosting and mounted volume.
- **Exact 50–100 word Latest summary for every source:** not guaranteed if publisher feed exposes less text. The app refuses to fabricate.

No quality-gate, real-device or external API claims are inferred from static linting/unit tests.

## Deployment and follow-up verification (2026-11-19)

- GitHub commit `4e399abf6c56814a1264dad957cb1d2418283400` fixed compiler pinning, isolated cache temp filenames and General mix stability; a later patch tightened the definition of a fresh Latest feed.
- Render service `srv-dbvn8lv40ujc73e8r7m0`, deploy `dep-dbvnbgff3r2c73cptop0`: **status live**. Service started successfully with the 175-story library and 37 configured enabled feeds.
- Latest `/api/latest` verifies recent publication timestamps in code and reports `stale` when no qualifying content has come from a successful publisher feed in the last six hours. The app never silently fills this tab with General stories.
- External publisher returns, article-by-article accuracy, mobile Safari/WebKit/real-iPhone interaction, all 175 link endpoints, and persistent storage under Render sleeping/restarts **not verified**.
- Build and test suite re-run after compiler/package and cache changes: Node **21 passed**, Chromium **5 scenarios passed**; no retries configured in the browser suite.

## On-open refresh change verification (2026-11-19)

- Updated browser selection logic to persist General's chosen 25 across reloads and tab switches, and to rotate based on elapsed time: **0 under 1 hour, 5 at 1–6 hours, 12 at 6–24 hours, up to 25 after 24 hours**. Added foreground-resume refresh through visibility, `pageshow` and focus events, with duplicate-event throttling.
- After updating the mocked API test harness for the new General discovery endpoint, `python tests/browser.py` passed **8/8 Chromium scenarios**, retries disabled. The new scenarios exercise four timed page reopenings with persisted storage, a foreground resume, and unchanged-versus-new Latest publisher feed data.
- `npm test` passed **21/21 Node unit tests** before final documentation changes; `npm run build` succeeded.
- Local HTTP smoke using `PORT=8767 SCHEDULER=off` returned 200 for `/api/health`, `/api/latest`, `/api/general/discoveries`, `/api/general?visit=99` and `/api/schedule`; General contained 25 stories and the optional discovery response was a valid empty list (scheduler disabled). No outside publisher responses were fabricated.
- Physical iPhone, WebKit/Safari, remote-source freshness, and a full offline service-worker lifecycle are **not verified** by these tests.