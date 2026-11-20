# Elsewhere V7 — observed test results

Executed on November 20, 2026 in the container environment with Node.js 22, TypeScript 5.8.3, Python Playwright and local Chromium. No retries were enabled in the suites.

| Check | Observed result |
|---|---|
| `npm run check` | PASS — server and client TypeScript compilation |
| `npm test` | **28 / 28 unit tests pass**; `npm run build` also completed successfully |
| `python tests/browser.py` | **8 / 8 Chromium scenarios pass**, including desktop and touch-sized mobile contexts |
| HTTP smoke test with `SCHEDULER=off` | PASS — `/`, `/api/health`, `/api/latest`, `/api/general`, `/api/schedule` all returned HTTP 200; General returned 25 articles |
| Source extraction test | PASS — publisher HTML and JSON-LD extraction; unconnected rugby introduction discarded from Welsh *Star Wars* example |
| Source access tests | PASS — robots disallow/allow logic, source redirect restriction, invalid local URLs excluded |
| Event grouping tests | PASS — alternate titles about Storm Helene merged; separate recovery-budget decision remained distinct |
| Cluster reporting tests | PASS — two publisher links and notes survive ranking; event ID reused across an ingestion and persisted restart |
| Browser UX tests | PASS — links on cards navigate **in-app**, source button is on story page, bookmarks and history, no-JavaScript fallback, mobile touch targets, offline/failure states, general rotation |

### Important items not verified

- Live third-party publisher article-body extraction and permissions/terms: **not verified** by container tests (outbound DNS restricted).
- Live grouping accuracy for the full feed pool and breaking-news contradictions: **not verified** (tests cover representative fixtures, not complete editorial assessment).
- Deployed Render service release status and live `/api/latest` contents: to be verified using actual service/deploy state after publication.
- Server-side AI summarization with real credentials: **not performed**; no API key enabled or charges authorized.
- Real physical iPhone / Safari WebKit interaction testing: **not done**. Chromium's mobile viewport/touch simulation is not physical iPhone testing.
- Continuous background refresh and persistent data on Render Free: **not guaranteed** because the free instance sleeps and may reset its local filesystem.

### Quality caveat

When permitted full text is accessible, without an LLM the default output is a **relevance-ranked extractive brief**, not a fully original prose paraphrase. It remains within Elsewhere and contains factual details selected from source text. Multi-source reporting is clustered into one card; reports from different outlets remain explicitly attributed rather than treated as independently verified consensus. Full professional summarization and reconciliation of conflicting reports requires permissioned source text plus a configured model and review.
