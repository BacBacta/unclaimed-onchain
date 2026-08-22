# Regression suites

21 Playwright suites, ~260 assertions, driving the real `index.html` in a real
browser. They cover EIP-55 validation, EOA/contract detection, the live
Multicall3 sweep, wallet detection and its failure modes, the withdrawal
history, pricing, and the copy shown in each of them.

```bash
cd tests && npm install         # once — the site itself has no dependencies
node run.js                     # the whole battery, ~1.7 min
node run.js seuil prix          # only suites whose name contains these
RAPIDE=0 node run.js            # with the page's real timeouts
```

`run.js` prints one line per suite with its duration, then the wall-clock total
against the cumulative one. A failing suite has its `FAIL` lines reprinted at
the end; the process exit code is the battery's.

## Why it takes under two minutes and not 33

The battery went from **1 999 s of sequential work to 104 s of wall clock**.
Five things got it there, in order of what they were worth.

**A render-blocking font stylesheet — the single biggest cost.** Every
`page.goto` waited 12.8 s for `fonts.googleapis.com` to fail, on a network
where it is unreachable. The suites meant to cut it off with
`page.route('https://fonts.g**')`, a glob that never matched a single request —
`'**fonts.g**'` does. The page itself now loads that stylesheet non-blocking,
so a visitor behind such a network no longer stares at a blank page either.
12.8 s → 0.2 s, on ~50 page loads.

**Running suites in parallel.** They are independent, so the battery costs its
slowest suite rather than the sum. `PAR` defaults to twice the core count,
which is where the measurements land: on 4 cores, 4 → 131 s, 6 → 117 s,
**8 → 107 s**, 12 → 125 s *and* flaky. These suites wait far more than they
compute, so oversubscribing helps — until they start starving each other of
CPU and polls begin to expire.

**Polling loops that never matched, and so just slept.** `waitFor(page,
/Already claimed/)` looked for text that Chromium renders as `ALREADY CLAIMED`,
because `innerText` applies `text-transform: uppercase`. It never matched, burnt
its full 30 s timeout, and the assertions passed anyway on a different check. Two
of those cost 65 s in one suite. Every polling helper now says so when it gives
up (`⚠ sondage épuisé`), and `run.js` counts those warnings per suite — a test
that waits out its own timeout is not synchronised, it is sleeping.

**Fixed sleeps standing in for conditions.** `waitForTimeout(4000)` after each
click became a poll on that click's actual outcome. Where an assertion is that
*nothing* happens, the poll waits for the action to complete — new RPC calls
arriving, the "n transaction(s) re-read from the chain" message — and only then
checks that the unwanted thing is absent. Faster, and a stronger assertion than
a sleep.

**Waiting out real deadlines.** Proving that a silent wallet is abandoned after
`PROMPT_MS` used to cost the full 180 s, three times over. The page reads its
four timeouts from `window.__delais` when present, and `run.js` serves a copy of
the page with shortened ones — no suite knows about it, they all just read
`PAGE`. Assertions sample the *pending* state by polling for it rather than at a
fixed instant, so they hold under both profiles.

`RAPIDE=0` runs everything against the file as shipped, with the real 20 s and
180 s deadlines. Run it before deploying: it is the profile that proves the
shortened ones change nothing.

## Assertions pinned to live chain state

`test_prix.js` used to assert that one address held 35 AZTEC. Someone withdrew
them, and the suite went red — the registry working exactly as intended, read as
a regression. Anything asserting a specific onchain amount has that expiry date
built in.

So assertions about *logic* are made against the page's own functions
(`prixDe`, `fmtAmt`) through `page.evaluate`, which is deterministic and
instant, and the live RPC path is only asserted on invariants that survive the
chain moving: that every position on screen carries a dollar figure, whatever
today's balance is. Keep new assertions on that side of the line.

## Conventions

- Every suite reads its page from `PAGE`, defaulting to `../index.html`, so the
  battery can be pointed at any build. `run.js` also serves it over a local HTTP
  origin for the suites that want a real URL (`TEST_URL`).
- `CHROME` overrides the browser binary; unset, `run.js` finds a Chromium under
  `PLAYWRIGHT_BROWSERS_PATH`, and failing that Playwright resolves its own.
- No suite fetches its HTML over the network. Some do call the public RPC
  endpoints on purpose — that is the behaviour under test.

## `outils/`

Diagnostics, not tests: they print what the page does under a given wallet stub
and never fail. `diag.js` dumps provider state under a mute, a triple and an
absent wallet; `apres_snapshot.js` shows what an address outside the snapshot
gets offered; `site.js` dumps banner, buttons and results against a deployed
URL. Run them by hand when something is puzzling.
