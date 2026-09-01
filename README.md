# Should I evolve this Pokémon?

A small static site that answers one question: should you evolve the Pokémon you have right now?

## Data sources

1. `pokemon.csv` (the project dataset, required). Gives the 811 Pokémon, their stats, types, generation, image filename and which species each one evolves from. Everything the site needs for a verdict is here, so it works even if PokéAPI is down.
2. [PokéAPI](https://pokeapi.co) (bonus, live). Adds how each evolution is triggered (level, stone, trade, friendship) and compares level-up move lists so the site can say "wait until level X for this move".

## Images

The dataset's `url_image` column holds a filename (for example `25.png`) when an image exists and `NA` when it doesn't. The site looks for the file in an `images/` folder first. If it isn't there, it falls back to PokéAPI's sprite set, which uses the same numbering. Pokémon with `NA` show a "No image available" placeholder.

If you have the image files, drop them into `images/`. If not, the fallback covers all 718 numbered ones.

## Files

- `index.html`, `style.css`, `app.js`: the site
- `pokemon.csv`: the dataset, must sit next to `index.html`
- `images/`: optional local images

## Publish on GitHub Pages

1. Create a public repository, for example `should-i-evolve`.
2. Upload every file in this folder to the root of the repository (Add file, then Upload files). Keep `pokemon.csv` at the root and any images inside `images/`.
3. Settings, then Pages. Under Build and deployment set Source to "Deploy from a branch", branch `main`, folder `/ (root)`, Save.
4. After a minute or two the site is at `https://<your-username>.github.io/should-i-evolve/`.

Every commit to `main` redeploys automatically.

## Run locally

Browsers block `fetch()` of local files when a page is opened straight from disk, so the CSV won't load by double-clicking `index.html`. Run a tiny server instead: `python3 -m http.server` in this folder, then open `http://localhost:8000`.

## How the verdict is decided

1. No evolution in the dataset: **No**. If PokéAPI knows a newer-generation evolution, that's mentioned.
2. Otherwise the dataset gives an instant **Yes** with the base stat gain.
3. PokéAPI then refines it. If your level is below the required evolution level: **Not yet**. If the current form learns moves after your level that the evolution gets later or never: **Wait**, with the level to wait for. Without a level entered it becomes **Yes, but** with the moves listed.
4. If PokéAPI can't be reached, the stat-based answer stands and a note says so.

Branched evolutions (Eevee, Wurmple, Tyrogue) show every option with its own stat comparison.
