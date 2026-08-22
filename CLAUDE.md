# Working notes for this repo

`index.html` is the whole site: one self-contained file, no build step, no
dependencies, no backend. `tests/` holds the regression suites and has its own
README. `build_snapshot.py` rebuilds the embedded snapshot.

## Standing constraints

- **Never run `git init` outside this directory.** It was once run by mistake in
  a home directory containing `.env` and `.ssh`. Check the working directory
  before any git command.
- **The repo is public.** No secret, no private key, no recovery phrase. The tip
  address is a public receiving address and is fine.
- **The page never asks for a token approval, nor for any signature other than
  the withdrawal itself.** That is the central anti-phishing guarantee, and the
  README states it. Do not add anything that would break it.
- Deploys go to `main`, mirrored to `gh-pages`.

## Testing

```bash
node tests/run.js --vite     # ~35 s — between edits
node tests/run.js            # ~110 s — before pushing
RAPIDE=0 node tests/run.js   # real timeouts — before deploying
```

## Pace: what wasted the most time, measured

A session audit over 655 tool calls and 492 minutes found the time went where
nobody would guess. Keep these in mind.

**40 % of the time was spent waiting, and half of that waiting was empty.**
Twenty calls held 162 of the 197 waiting minutes; eight of them ran to the
tool's 10-minute ceiling polling for a completion marker that the test never
printed — 80 minutes lost to a grep pattern that did not match. So:

- Background work notifies on completion. Do not launch it and then block in an
  `until` loop: that costs the full wait and gains nothing.
- Before polling for a marker, confirm the marker exists in the real output.
- While something long runs, do the next piece of work rather than watch it.

**Tool-call count drives cost, not what the calls do.** 240 edit calls averaged
40 s each whether they touched the 2 MB `index.html` or a small test file.
Group related edits into one call.

**Do not re-run the full battery at every step.** Use `--vite` while iterating
and the full battery once, before pushing.

## Two failure modes this codebase has bitten on twice

- **`innerText` returns *rendered* text.** `.total .lead` is
  `text-transform: uppercase`, so it reads `ALREADY CLAIMED`. A test that polls
  for `Already claimed` never matches and silently sleeps out its timeout.
  Every polling helper now warns when it gives up — never ignore a
  `⚠ sondage épuisé`.
- **Assertions pinned to a live onchain balance expire.** Someone withdrew the
  35 AZTEC a suite asserted on, and it went red — the registry working as
  intended. Assert logic against the page's own functions through
  `page.evaluate`; assert the live path only on invariants that survive the
  chain moving.
