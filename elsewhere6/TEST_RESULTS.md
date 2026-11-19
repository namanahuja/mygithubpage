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
- **Live Render deployment:** pending separate deployment verification; the old Python Elsewhere instance is unrelated to this V6 Node build.
- **Docker build:** Docker engine unavailable in the current test container; Dockerfile/compose syntax not run.
- **Production Scheduler uptime and disk persistence:** unverified; requires always-on hosting and mounted volume.
- **Exact 50–100 word Latest summary for every source:** not guaranteed if publisher feed exposes less text. The app refuses to fabricate.

No quality-gate, real-device or external API claims are inferred from static linting/unit tests.
