# Regression suites

21 Playwright suites, ~250 assertions, driving the real `index.html` in a real
browser. They cover EIP-55 validation, EOA/contract detection, the live
Multicall3 sweep, wallet detection and its failure modes, the withdrawal
history, pricing, and the copy shown in each of them.

```bash
cd tests && npm install         # once — the site itself has no dependencies
node run.js                     # the whole battery, ~2.5 min
node run.js seuil prix          # only suites whose name contains these
RAPIDE=0 node run.js            # with the page's real timeouts, ~5.5 min
```

`run.js` prints one line per suite with its duration, then the wall-clock total
against the cumulative one. A failing suite has its `FAIL` lines reprinted at
the end; the process exit code is the battery's.

## Why it takes 2.5 minutes and not 33

The suites are independent, so they run **6 at a time** (`PAR=6`). That alone is
worth ×5.5 — the battery costs its slowest suite, not the sum of all of them.

Four things had made each suite far slower than it needed to be:

- **A render-blocking font stylesheet.** Every `page.goto` waited 12.8 s for
  `fonts.googleapis.com` to fail, on a network where it is unreachable. The
  suites meant to cut it off with `page.route('https://fonts.g**')`, a glob that
  never matched a single request — `'**fonts.g**'` does. The page itself now
  loads that stylesheet non-blocking, so a visitor behind such a network no
  longer stares at a blank page either. 12.8 s → 0.2 s, on ~50 page loads.

- **Waiting out real deadlines.** Proving that a silent wallet is abandoned
  after `PROMPT_MS` used to cost the full 180 s, three times over. The page
  reads its four timeouts from `window.__delais` when present, and `run.js`
  serves a copy of the page with shortened ones — no suite knows about it, they
  all just read `PAGE`. Assertions sample the *pending* state by polling for it
  rather than at a fixed instant, so they hold under both profiles.

- **Fixed sleeps standing in for conditions.** `waitForTimeout(6000)` became a
  poll on the thing actually being awaited, which usually arrives in 300 ms.

- **Suites that could not fail.** Three scripts printed observations and
  asserted nothing, so they were always green and cost 2 minutes between them.
  They moved to `outils/`, where being diagnostics is the point.

`RAPIDE=0` runs everything against the file as shipped, with the real 20 s and
180 s deadlines. Run it before deploying: it is the profile that proves the
shortened ones change nothing.

## Conventions

- Every suite reads its page from `PAGE`, defaulting to `../index.html`, so the
  battery can be pointed at any build. `run.js` also serves it over a local HTTP
  origin for the suites that want a real URL (`TEST_URL`).
- `CHROME` overrides the browser binary; unset, `run.js` finds a Chromium under
  `PLAYWRIGHT_BROWSERS_PATH`, and failing that Playwright resolves its own.
- No suite fetches its HTML over the network. Some do call the public RPC
  endpoints on purpose — that is the behaviour under test.
- `test_prix.js` can replay a fixed bug against previously deployed bytes with
  `AVANT=old.html`; without it, it only asserts the current behaviour.

## `outils/`

Diagnostics, not tests: they print what the page does under a given wallet stub
and never fail. `diag.js` dumps provider state under a mute, a triple and an
absent wallet; `apres_snapshot.js` shows what an address outside the snapshot
gets offered; `site.js` dumps banner, buttons and results against a deployed
URL. Run them by hand when something is puzzling.
