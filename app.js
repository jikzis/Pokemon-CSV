/* Should I evolve this Pokémon?
   Data source 1 (required): pokemon.csv, the project dataset. Gives the roster,
   stats, types, images and evolution lines. Loaded once at start.
   Data source 2 (bonus): PokéAPI. Adds how an evolution is triggered and which
   level-up moves you would miss by evolving. If it can't be reached, the site
   still answers from the CSV alone. */

const API = "https://pokeapi.co/api/v2";
const SPRITE_FALLBACK = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const cache = new Map();

// Newest game versions first. Used to pick which move list to compare.
const VERSION_PRIORITY = [
  "scarlet-violet", "legends-arceus", "brilliant-diamond-and-shining-pearl",
  "sword-shield", "lets-go-pikachu-lets-go-eevee", "ultra-sun-ultra-moon",
  "sun-moon", "omega-ruby-alpha-sapphire", "x-y", "black-2-white-2",
  "black-white", "heartgold-soulsilver", "platinum", "diamond-pearl",
  "emerald", "firered-leafgreen", "ruby-sapphire", "crystal", "gold-silver",
  "yellow", "red-blue"
];

const STATS = [
  ["hp", "HP"], ["attack", "Attack"], ["defense", "Defense"],
  ["special_attack", "Sp. Atk"], ["special_defense", "Sp. Def"], ["speed", "Speed"]
];

/* ---------- DOM ---------- */

const form = document.getElementById("search-form");
const nameInput = document.getElementById("name-input");
const levelInput = document.getElementById("level-input");
const button = document.getElementById("check-button");
const status = document.getElementById("status");
const result = document.getElementById("result");
const verdictBox = document.getElementById("verdict");
const verdictWord = document.getElementById("verdict-word");
const verdictReason = document.getElementById("verdict-reason");
const pairBox = document.getElementById("pair");
const detailsBox = document.getElementById("details");
const cardTemplate = document.getElementById("card-template");
const suggestionsBox = document.getElementById("suggestions");

/* ---------- CSV dataset ---------- */

let rows = [];              // every row in pokemon.csv
let byName = new Map();     // pokemon slug -> row
let childrenOf = new Map(); // species_id -> [rows that evolve from it]
let requestId = 0;          // ignore late PokéAPI answers for an older search

loadCsv();

async function loadCsv() {
  button.disabled = true;
  setStatus("Loading the Pokémon dataset...");
  try {
    const res = await fetch("pokemon.csv");
    if (!res.ok) throw new Error("csv");
    rows = parseCsv(await res.text());
    for (const r of rows) {
      byName.set(r.pokemon, r);
      // Only base forms count as evolution targets (id equals species_id).
      if (r.id === r.species_id && r.evolves_from_species_id !== "NA") {
        const list = childrenOf.get(r.evolves_from_species_id) || [];
        list.push(r);
        childrenOf.set(r.evolves_from_species_id, list);
      }
    }
    setStatus("");
    button.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus("Couldn't load pokemon.csv. Make sure it sits next to index.html. If you opened the file directly from disk, run it through a local server or GitHub Pages instead.", true);
  }
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const cells = line.split(",");
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] === undefined ? "NA" : cells[i]; });
    return obj;
  });
}

function evolutionsOf(row) {
  return childrenOf.get(row.species_id) || [];
}

function imageSources(row) {
  // The dataset gives a filename in url_image when an image exists.
  // First try a local images/ folder, then PokéAPI's sprite set which uses the same numbering.
  if (row.url_image === "NA") return [];
  return ["images/" + row.url_image, SPRITE_FALLBACK + row.url_image];
}

function statTotal(row) {
  return STATS.reduce((sum, [key]) => sum + Number(row[key]), 0);
}

/* ---------- Suggestions ---------- */

let activeIndex = -1;
let shown = [];

function matchSpecies(query) {
  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const r of rows) {
    if (r.pokemon.startsWith(q)) starts.push(r);
    else if (r.pokemon.includes(q)) contains.push(r);
    if (starts.length >= 8) break;
  }
  return starts.concat(contains).slice(0, 8);
}

function showSuggestions() {
  const query = nameInput.value;
  shown = matchSpecies(query);
  activeIndex = -1;
  suggestionsBox.innerHTML = "";

  if (!query.trim() || rows.length === 0) { hideSuggestions(); return; }

  if (shown.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No Pokémon matches \"" + query.trim() + "\"";
    suggestionsBox.appendChild(li);
  }

  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  shown.forEach((r, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.id = "suggestion-" + i;
    const sources = imageSources(r);
    if (sources.length) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      attachImage(img, sources);
      li.appendChild(img);
    }
    const label = document.createElement("span");
    label.innerHTML = highlight(prettyName(r.pokemon), q);
    li.appendChild(label);
    li.addEventListener("mousedown", (e) => { e.preventDefault(); chooseSuggestion(i); });
    suggestionsBox.appendChild(li);
  });

  suggestionsBox.hidden = false;
  nameInput.setAttribute("aria-expanded", "true");
}

function highlight(text, q) {
  const plain = q.replace(/-/g, " ");
  const idx = text.toLowerCase().indexOf(plain);
  if (idx < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) + "<mark>" + escapeHtml(text.slice(idx, idx + plain.length)) + "</mark>" + escapeHtml(text.slice(idx + plain.length));
}

function escapeHtml(t) {
  return t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function hideSuggestions() {
  suggestionsBox.hidden = true;
  suggestionsBox.innerHTML = "";
  nameInput.setAttribute("aria-expanded", "false");
  nameInput.removeAttribute("aria-activedescendant");
  activeIndex = -1;
  shown = [];
}

function setActive(i) {
  const items = suggestionsBox.querySelectorAll("[role=option]");
  items.forEach((li, idx) => li.setAttribute("aria-selected", idx === i ? "true" : "false"));
  activeIndex = i;
  if (i >= 0) {
    nameInput.setAttribute("aria-activedescendant", "suggestion-" + i);
    items[i].scrollIntoView({ block: "nearest" });
  }
}

function chooseSuggestion(i) {
  const r = shown[i];
  if (!r) return;
  nameInput.value = prettyName(r.pokemon);
  hideSuggestions();
  form.requestSubmit();
}

nameInput.addEventListener("input", showSuggestions);
nameInput.addEventListener("focus", showSuggestions);
nameInput.addEventListener("blur", hideSuggestions);

nameInput.addEventListener("keydown", (e) => {
  if (suggestionsBox.hidden) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActive(Math.min(activeIndex + 1, shown.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActive(Math.max(activeIndex - 1, -1));
  } else if (e.key === "Enter" && activeIndex >= 0) {
    e.preventDefault();
    chooseSuggestion(activeIndex);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

/* ---------- Search ---------- */

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const slug = normaliseName(nameInput.value);
  const level = levelInput.value ? Number(levelInput.value) : null;
  if (!slug) return;

  const row = byName.get(slug);
  if (!row) {
    result.hidden = true;
    setStatus("No Pokémon called \"" + nameInput.value.trim() + "\" in the dataset. Check the spelling or pick a suggestion.", true);
    return;
  }

  const nextRows = evolutionsOf(row);
  renderFromCsv(row, nextRows, level);
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });

  const myRequest = ++requestId;
  enrichFromApi(row, nextRows, level, myRequest);
});

function normaliseName(raw) {
  let n = raw.trim().toLowerCase();
  n = n.replace(/♀/g, "-f").replace(/♂/g, "-m");
  n = n.replace(/[.'’:]/g, "").replace(/\s+/g, "-");
  return n;
}

function prettyName(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* ---------- Render from CSV (instant) ---------- */

function renderFromCsv(row, nextRows, userLevel) {
  pairBox.innerHTML = "";
  detailsBox.innerHTML = "";
  verdictBox.className = "verdict";

  pairBox.appendChild(buildCard(row, "current"));

  if (nextRows.length === 0) {
    pairBox.className = "pair single";
    setVerdict("no", "No", prettyName(row.pokemon) + " doesn't evolve any further. Train it as it is.");
    setStatus("");
    return;
  }

  pairBox.className = "pair";
  const arrow = document.createElement("div");
  arrow.className = "arrow";
  arrow.textContent = "→";
  arrow.setAttribute("aria-label", "evolves into");
  pairBox.appendChild(arrow);

  const stack = document.createElement("div");
  stack.className = "branch-stack";
  for (const next of nextRows) stack.appendChild(buildCard(next, "next"));
  pairBox.appendChild(stack);

  for (const next of nextRows) detailsBox.appendChild(buildStatsPanel(row, next));

  // Stat-based verdict from the dataset. PokéAPI may refine it afterwards.
  const curName = prettyName(row.pokemon);
  if (nextRows.length > 1) {
    setVerdict("yes", "Yes", curName + " has " + nextRows.length + " possible evolutions, all with higher base stats. Pick the one that fits your team.");
  } else {
    const gain = statTotal(nextRows[0]) - statTotal(row);
    setVerdict("yes", "Yes", prettyName(nextRows[0].pokemon) + " has " + signed(gain) + " base stat total compared with " + curName + ".");
  }
  setStatus("Checking evolution requirements and moves with PokéAPI...");
}

/* ---------- Enrich from PokéAPI (async) ---------- */

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? "not-found" : "network");
  const json = await res.json();
  cache.set(url, json);
  return json;
}

async function enrichFromApi(row, nextRows, userLevel, myRequest) {
  try {
    const current = await getJson(API + "/pokemon/" + row.pokemon);
    const species = await getJson(current.species.url);
    const chain = await getJson(species.evolution_chain.url);
    const node = findNode(chain.chain, species.name);
    const nextByApi = node ? node.evolves_to : [];

    const nexts = await Promise.all(nextRows.map(async (r) => {
      const pokemon = await getJson(API + "/pokemon/" + r.pokemon);
      const apiNode = nextByApi.find(n => n.species.name === r.pokemon);
      return { row: r, pokemon, how: apiNode ? describeEvolution(apiNode.evolution_details) : null };
    }));

    if (myRequest !== requestId) return; // user searched again in the meantime

    // Evolutions PokéAPI knows about that the dataset doesn't (newer generations).
    const missing = nextByApi.filter(n => !nextRows.some(r => r.pokemon === n.species.name)).map(n => prettyName(n.species.name));

    applyEnrichment(row, nexts, userLevel, missing);
    setStatus("");
  } catch (e) {
    console.warn("PokéAPI unavailable", e);
    if (myRequest !== requestId) return;
    setStatus("PokéAPI couldn't be reached, so the answer is based on the dataset's stats and evolution lines only.");
  }
}

function applyEnrichment(row, nexts, userLevel, missing) {
  const curName = prettyName(row.pokemon);

  // Evolution requirement chips on each next card.
  nexts.forEach((n, i) => {
    const card = pairBox.querySelectorAll(".card.next")[i];
    if (card && n.how) {
      const how = document.createElement("p");
      how.className = "how";
      how.textContent = n.how.text;
      card.appendChild(how);
    }
  });

  if (nexts.length === 0) {
    if (missing.length) {
      verdictReason.textContent += " In newer games it can evolve into " + missing.join(" or ") + ", which isn't part of this dataset.";
    }
    return;
  }

  // Can it evolve yet?
  const minLevels = nexts.map(n => n.how && n.how.minLevel).filter(Boolean);
  if (userLevel !== null && minLevels.length && userLevel < Math.min(...minLevels)) {
    setVerdict("wait", "Not yet", curName + " evolves at level " + Math.min(...minLevels) + ". You're at level " + userLevel + ". Keep training.");
    return;
  }

  // Move comparison.
  const analyses = nexts.map(n => ({ next: n, moves: compareMoves(row, n.pokemon, userLevel) }));
  const allRisk = analyses.flatMap(a => a.moves.atRisk);
  const branched = nexts.length > 1;
  const target = branched ? "its evolutions" : prettyName(nexts[0].row.pokemon);

  for (const a of analyses) {
    if (a.moves.atRisk.length) detailsBox.appendChild(buildMovesPanel(row, a, userLevel));
  }

  if (allRisk.length === 0) {
    verdictReason.textContent += " It also learns every move " + curName + " would, at the same level or earlier. Nothing to wait for.";
    return;
  }

  const lastLevel = Math.max(...allRisk.map(r => r.level));
  const moveList = listMoves(allRisk.slice(0, 3));
  const more = allRisk.length > 3 ? " and " + (allRisk.length - 3) + " more" : "";

  if (userLevel !== null) {
    setVerdict("wait", "Wait", curName + " still learns " + moveList + more + " that " + target +
      " gets later or never. Evolve after level " + lastLevel + " if you want them all, or evolve now and accept the trade-off.");
  } else {
    setVerdict("yes", "Yes, but", "Evolving is a stat upgrade. Just know " + curName + " learns " + moveList + more + " that " + target +
      " gets later or never. Enter your level above for a sharper answer.");
  }
}

function findNode(node, speciesName) {
  if (node.species.name === speciesName) return node;
  for (const child of node.evolves_to) {
    const found = findNode(child, speciesName);
    if (found) return found;
  }
  return null;
}

function describeEvolution(detailsList) {
  if (!detailsList || detailsList.length === 0) return { text: "Evolves (method unknown)", minLevel: null };
  const d = detailsList[0];
  const parts = [];
  let minLevel = null;

  switch (d.trigger.name) {
    case "level-up":
      if (d.min_level) { parts.push("Reach level " + d.min_level); minLevel = d.min_level; }
      else parts.push("Level up");
      break;
    case "use-item":
      parts.push("Use " + prettyName(d.item ? d.item.name : "an item"));
      break;
    case "trade":
      parts.push("Trade");
      break;
    case "shed":
      parts.push("Level 20 with an empty party slot and a Poké Ball");
      minLevel = 20;
      break;
    default:
      parts.push(prettyName(d.trigger.name));
  }

  if (d.min_happiness) parts.push("high friendship");
  if (d.min_affection) parts.push("high affection");
  if (d.min_beauty) parts.push("high beauty");
  if (d.time_of_day) parts.push("during the " + d.time_of_day);
  if (d.held_item) parts.push("holding " + prettyName(d.held_item.name));
  if (d.known_move) parts.push("knowing " + prettyName(d.known_move.name));
  if (d.known_move_type) parts.push("knowing a " + prettyName(d.known_move_type.name) + " move");
  if (d.location) parts.push("at " + prettyName(d.location.name));
  if (d.needs_overworld_rain) parts.push("while it rains");
  if (d.gender === 1) parts.push("female only");
  if (d.gender === 2) parts.push("male only");
  if (d.party_species) parts.push("with " + prettyName(d.party_species.name) + " in the party");
  if (d.party_type) parts.push("with a " + prettyName(d.party_type.name) + " type in the party");
  if (d.trade_species) parts.push("for " + prettyName(d.trade_species.name));
  if (d.turn_upside_down) parts.push("with the console upside down");
  if (d.relative_physical_stats === 1) parts.push("Attack > Defense");
  if (d.relative_physical_stats === -1) parts.push("Attack < Defense");
  if (d.relative_physical_stats === 0) parts.push("Attack = Defense");

  return { text: parts.join(", "), minLevel };
}

function levelUpMoves(pokemon) {
  const byVersion = {};
  for (const m of pokemon.moves) {
    for (const v of m.version_group_details) {
      if (v.move_learn_method.name !== "level-up") continue;
      const vg = v.version_group.name;
      byVersion[vg] = byVersion[vg] || {};
      const existing = byVersion[vg][m.move.name];
      byVersion[vg][m.move.name] = existing === undefined ? v.level_learned_at : Math.min(existing, v.level_learned_at);
    }
  }
  return byVersion;
}

function pickVersion(curMoves, nextMoves) {
  for (const vg of VERSION_PRIORITY) {
    if (curMoves[vg] && nextMoves[vg]) return vg;
  }
  const shared = Object.keys(curMoves).find(vg => nextMoves[vg]);
  return shared || Object.keys(curMoves)[0] || null;
}

function compareMoves(row, nextPokemon, userLevel) {
  const currentPokemon = cache.get(API + "/pokemon/" + row.pokemon);
  if (!currentPokemon) return { version: null, atRisk: [] };
  const curAll = levelUpMoves(currentPokemon);
  const nextAll = levelUpMoves(nextPokemon);
  const vg = pickVersion(curAll, nextAll);
  if (!vg) return { version: null, atRisk: [] };

  const cur = curAll[vg] || {};
  const nxt = nextAll[vg] || {};
  const atRisk = [];

  for (const [move, level] of Object.entries(cur)) {
    if (level <= 1) continue;
    if (userLevel !== null && level <= userLevel) continue;
    const nextLevel = nxt[move];
    if (nextLevel === undefined) atRisk.push({ move, level, nextLevel: null });
    else if (nextLevel > level) atRisk.push({ move, level, nextLevel });
  }
  atRisk.sort((a, b) => a.level - b.level);
  return { version: vg, atRisk };
}

/* ---------- UI builders ---------- */

function listMoves(list) {
  const names = list.map(r => prettyName(r.move) + " (Lv " + r.level + ")");
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function signed(n) { return (n >= 0 ? "+" : "") + n; }

function setVerdict(kind, word, reason) {
  verdictBox.className = "verdict " + kind;
  verdictWord.textContent = word;
  verdictReason.textContent = reason;
}

function attachImage(img, sources) {
  let i = 0;
  img.src = sources[0];
  img.onerror = () => {
    i += 1;
    if (i < sources.length) img.src = sources[i];
    else img.dispatchEvent(new Event("allfailed"));
  };
}

function buildCard(row, role) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  node.classList.add(role);

  const art = node.querySelector(".art");
  const img = art.querySelector("img");
  const sources = imageSources(row);
  if (sources.length) {
    img.alt = prettyName(row.pokemon);
    img.addEventListener("allfailed", () => showNoImage(art));
    attachImage(img, sources);
  } else {
    showNoImage(art);
  }

  node.querySelector(".card-name").textContent = prettyName(row.pokemon);
  node.querySelector(".card-meta").textContent = "#" + String(row.species_id).padStart(3, "0") +
    (row.generation_id !== "NA" ? ", generation " + row.generation_id : "") +
    (role === "current" ? " (current)" : "");

  const types = node.querySelector(".types");
  for (const key of ["type_1", "type_2"]) {
    if (row[key] === "NA") continue;
    const li = document.createElement("li");
    li.textContent = row[key];
    li.style.background = typeColor(row[key]);
    types.appendChild(li);
  }
  return node;
}

function showNoImage(art) {
  art.innerHTML = "";
  art.classList.add("no-image");
  art.textContent = "No image available";
}

function buildStatsPanel(cur, next) {
  const panel = document.createElement("div");
  panel.className = "panel";
  const h = document.createElement("h3");
  h.textContent = "Stats: " + prettyName(cur.pokemon) + " vs " + prettyName(next.pokemon);
  panel.appendChild(h);

  for (const [key, label] of STATS) {
    panel.appendChild(statRow(label, Number(cur[key]), Number(next[key]), 255));
  }
  const total = statRow("Total", statTotal(cur), statTotal(next), 800);
  total.classList.add("total-row");
  panel.appendChild(total);

  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = "<span><i class='l-cur'></i>" + prettyName(cur.pokemon) + "</span><span><i class='l-next'></i>" + prettyName(next.pokemon) + "</span>";
  panel.appendChild(legend);
  return panel;
}

function statRow(label, cur, next, max) {
  const row = document.createElement("div");
  row.className = "stat-row";
  const diff = next - cur;
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "same";
  row.innerHTML =
    "<div class='stat-name'>" + label + "</div>" +
    "<div class='bars'>" +
      "<div class='bar'><span style='width:" + pct(cur, max) + "%'></span></div>" +
      "<div class='bar next'><span style='width:" + pct(next, max) + "%'></span></div>" +
    "</div>" +
    "<div class='stat-values'>" + cur + " → " + next + " <span class='delta " + cls + "'>" + signed(diff) + "</span></div>";
  return row;
}

function pct(v, max) { return Math.min(100, Math.round((v / max) * 100)); }

function buildMovesPanel(row, a, userLevel) {
  const panel = document.createElement("div");
  panel.className = "panel";
  const curName = prettyName(row.pokemon);
  const nextName = prettyName(a.next.row.pokemon);

  const h = document.createElement("h3");
  h.textContent = "Moves you'd miss or delay by evolving into " + nextName;
  panel.appendChild(h);

  const p = document.createElement("p");
  p.textContent = (userLevel !== null ? "Moves " + curName + " learns after level " + userLevel : "Moves " + curName + " learns by levelling up") +
    " that " + nextName + " learns later or not at all" + (a.moves.version ? " (" + prettyName(a.moves.version) + ", via PokéAPI)" : "") + ".";
  panel.appendChild(p);

  const ul = document.createElement("ul");
  ul.className = "moves";
  for (const r of a.moves.atRisk) {
    const li = document.createElement("li");
    const right = r.nextLevel === null ? nextName + " never learns it" : nextName + " learns it at Lv " + r.nextLevel;
    li.innerHTML = "<span class='move-name'>" + prettyName(r.move) + "</span><span>" + curName + " Lv " + r.level + ". " + right + "</span>";
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function typeColor(type) {
  const colors = {
    normal: "#8f9bb0", fire: "#e2622a", water: "#3f7fd6", electric: "#d8a80f", grass: "#4c9a4a",
    ice: "#5fb3c6", fighting: "#b7402f", poison: "#8f4aa3", ground: "#b8853a", flying: "#7a86d6",
    psychic: "#e04f7a", bug: "#8fa02a", rock: "#a08e4a", ghost: "#5f4f8f", dragon: "#5b3fc9",
    dark: "#5a4a42", steel: "#7f8ea3", fairy: "#d97fb0"
  };
  return colors[type] || "#223047";
}

function setStatus(text, isError) {
  status.textContent = text;
  status.className = "hint" + (isError ? " error" : "");
}
