# That's Bazaar: fight replay

_Work in progress: the interface is still being improved._

Watch a simulated, timed replay of a [The Bazaar](https://playthebazaar.com) fight and see what luck decided it: win odds over 1,000 simulated fights, the single changes that flip the result, who got lucky in the real fight, and a What if panel for crits, hastes and freezes.

Fight data comes from public run pages on [BazaarHub](https://bazaarhub.gg). Game art and item text belong to Tempo Storm.

## Run it

```
npm start            # http://localhost:3000
npm run precompute   # re-run the odds for every fight in fights/
```

Node 18 or newer, no dependencies.

## How it's laid out

- `engine/sim.js` is the fight simulator: a deterministic 0.05 s tick sim with seeded luck. It covers haste, slow, freeze, charge, burn, poison, shield, regen, crits, multicast, Tempo and sandstorm.
- `fights/<run>-d<day>.json` holds one fight: both boards with each item's rules, plus a precomputed `summary` (odds, health ladder, luck that flips the result, luck report).
- `public/page.html` is the replay page. The server inlines the engine and fights into it.
- `server.js` serves the page, images and `GET /api/fight?run=<id>&day=<n>`.
- `tools/rules.py` is an early reader that turns item text into engine rules (about a quarter of items fully covered so far).

## One-click: Open in Replay bookmark

`docs/index.html` is the whole app in one file, served by GitHub Pages at https://soapbottle.github.io/ThatsBazaar/. Make a bookmark whose address is the contents of `tools/open_in_replay_bookmarklet.txt`. On a BazaarHub run page, click it: it reads that day's fights in your browser and opens the replay site with them already built.

## Building a fight from a paste

On a BazaarHub run page, open a day, click the Board Reader bookmarklet (tools/board_reader_bookmarklet.js) and press Copy. In the app, put the run link in the search box, click **Paste a fight**, paste and Build. Every fight of that day is built from the recap: each item uses its real per-use averages, its cooldown is fitted to its real number of uses, and the loser's health is fitted to the damage they took.

## Adding a fight

Write a fight file in `fights/` (copy an existing one), then run `npm run precompute`. Building fights straight from a pasted BazaarHub link is switched off (`FETCH_BAZAARHUB`) until BazaarHub agrees to it.
