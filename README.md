# Night Arcade

Two small browser games, as a static site with no build step and no backend.

- `index.html` is the home page.
- `deep-sky/` is the daily category game. Its categories and nightly schedule live in `deep-sky/skies.json`.
- `firefly/` is Firefly Dusk, an endless arcade dodger.

Scores, streaks and best runs are saved in each player's browser (localStorage).

## Hosting

Deployed on Vercel or Netlify, connected to this repo, so every push to `main`
deploys. It's a plain static site: no build command, and the output directory
is the repo root.

## Run locally

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

Deep Sky loads `skies.json` with `fetch`, so open it through a server, not as a file.

## Daily skies

The `Nightly sky` GitHub Action (`.github/workflows/nightly-sky.yml`) runs at
19:17 UTC (00:17 Pakistan time). It asks an OpenAI model to write one new category
(instructions in [scripts/sky-prompt.md](scripts/sky-prompt.md)), validates it,
schedules the next few nights, and commits `deep-sky/skies.json`. The hosting
platform sees the commit and redeploys. If the model's category fails
validation three times, nothing is saved.

Repository settings it needs (Settings → Secrets and variables → Actions):

- Secret `OPENAI_API_KEY`.
- Optional variable `OPENAI_MODEL` (default `gpt-6-luna`).

```bash
OPENAI_API_KEY=... node scripts/generate-sky.mjs --dry-run   # preview a category, save nothing
node scripts/skies.mjs stats      # categories, answer counts, last played
node scripts/skies.mjs plan 3     # schedule missing nights through today+3
node scripts/skies.mjs validate   # must print OK before anything ships
```

If a night has no entry, the game falls back to a seeded pick from the whole
bank, so a missed job run never breaks the game.
