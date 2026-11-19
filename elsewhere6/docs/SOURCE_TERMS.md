# Feed provenance and terms — operational checklist

RSS/Atom availability does not automatically grant a right to publish full articles, images, or commercial derivatives. Elsewhere displays publisher-supplied excerpts, outbound article links, publisher names and original publication dates. No publisher's original image is downloaded into the app. The code does not bypass paywalls.

**Feeds configured:** 44 entries (some deliberately disabled until their URLs/terms are verified). See `src/server/config.ts` and `/api/latest` `sources` for each `enabled` flag and category. Enabled means it can be attempted, **not** that the publisher agreed to syndication or that every feed responds.

**Publisher-specific due diligence before public/commercial launch:**

| Provider | Feeds used | Rights/action |
|---|---|---|
| BBC News and Sport | World, Politics, regions, Business, Science, Technology, Entertainment, Sport | Review BBC RSS feed terms and permitted attribution/display; public commercial reuse may need permission. |
| The Guardian | World, Politics, Business, Fashion, Culture, Sport, Travel, Food, Technology, Science | Review API/RSS terms; API key and commercial license may be needed for broader reuse. |
| NPR | National, World, Arts | Review NPR RSS and usage rules. |
| NASA | News releases | NASA public-content policies apply; exceptions exist for certain third-party content/marks. |
| ESA | Candidate, disabled | Validate endpoint and ESA permissions. |
| ScienceDaily | Main and health feeds | Review copyright; RSS summaries may be for reader distribution only. |
| Nature | Candidate, disabled | Nature reuse/licensing and feed access require validation. |
| Ars Technica, WIRED, The Verge, MIT News | Technology / science | Verify feed addresses, attribution, and republication permissions. |
| Variety, Pitchfork, Billboard, Polygon, IGN | Film, music, games | Some candidates disabled; review terms and feed reliability. |
| Vogue | Fashion | Verify rights before commercial syndication. |
| Smithsonian | Culture/history | Check Smithsonian licensing and distinguish its institution-authored media from third-party material. |
| Eater, Dezeen, National Geographic | Food, design, nature | Verify feed and reuse terms; National Geographic candidate disabled. |
| Google Trends | Candidate, disabled | Search interest is not verified reporting; do not show as news without corroboration. |
| Wikimedia | Featured article and on-this-day | Follow Wikimedia API user-agent guidelines and individual article CC BY-SA / attribution requirements. |

**Important:** No live terms audit or contract/license acceptance was performed for all sources. Enabled RSS fetching should be reviewed against applicable terms before commercial/public operation.
