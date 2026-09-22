import {
  COLORS, MAX_DICE, MAX_FACES, MIN_FACES,
  clampInt, colorById, createPool, groupByColor, notation, randomFace, rollPool, total,
} from "./dice.js";

const STORAGE_KEY = "dice-roller:v1";
const HISTORY_LIMIT = 30;
const HISTORY_DICE_SHOWN = 20; // au-delà, un badge "+N" avec le détail au survol
const ROLL_DURATION = 900;      // ms : durée du tumble d'un dé
const ROLL_STAGGER = 28;        // ms : décalage entre deux dés successifs
const ROLL_STAGGER_MAX = 700;   // ms : décalage max (pour 100 dés)
const FLICKER_INTERVAL = 55;    // ms : cadence de défilement des chiffres pendant le roulement
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- État ----------
const state = {
  count: 2,
  faces: 6,
  activeColor: null,   // id de couleur sélectionnée dans la palette, ou null = "aucune"
  pool: [],            // dés avant lancer (avec couleurs)
  lastRoll: null,      // pool lancé
  history: [],         // [{ count, faces, dice: [{color,value}], total, at }]
  sortResults: false,
};

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const el = {
  count: $("#count"),
  faces: $("#faces"),
  notation: $("#notation"),
  presets: $(".presets"),
  palette: $("#palette"),
  paintAll: $("#paint-all"),
  clearColors: $("#clear-colors"),
  pool: $("#pool"),
  roll: $("#roll"),
  results: $("#results"),
  sort: $("#sort-results"),
  history: $("#history"),
  clearHistory: $("#clear-history"),
};

// ---------- Persistance ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.count = clampInt(saved.count, 1, MAX_DICE, 2);
    state.faces = clampInt(saved.faces, MIN_FACES, MAX_FACES, 6);
    state.sortResults = Boolean(saved.sortResults);
    if (Array.isArray(saved.history)) state.history = saved.history.slice(0, HISTORY_LIMIT);
    const colors = Array.isArray(saved.colors) ? saved.colors : [];
    state.pool = createPool(state.count, state.faces, colors.map((c) => ({ color: colorById(c) ? c : null })));
  } catch {
    /* stockage indisponible : on garde les valeurs par défaut */
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      count: state.count,
      faces: state.faces,
      sortResults: state.sortResults,
      colors: state.pool.map((d) => d.color),
      history: state.history,
    }));
  } catch {
    /* ignore */
  }
}

// ---------- Rendu ----------
let animationToken = 0; // identifiant du lancer animé en cours

function dieClass(die) {
  return die.color ? "die colored" : "die";
}

function applyColorStyle(node, colorId) {
  const c = colorById(colorId);
  if (c) {
    node.style.setProperty("--die-color", c.hex);
    node.dataset.color = c.id;
  } else {
    node.style.removeProperty("--die-color");
    delete node.dataset.color;
  }
}

function renderConfig() {
  el.count.value = state.count;
  el.faces.value = state.faces;
  el.notation.value = notation(state.count, state.faces);
  for (const chip of el.presets.querySelectorAll(".chip")) {
    chip.classList.toggle("active", Number(chip.dataset.faces) === state.faces);
  }
  el.sort.checked = state.sortResults;
}

function renderPalette() {
  el.palette.innerHTML = "";
  const none = document.createElement("button");
  none.type = "button";
  none.className = "swatch none";
  none.setAttribute("role", "radio");
  none.setAttribute("aria-label", "Aucune couleur (gomme)");
  none.title = "Aucune couleur (gomme)";
  none.setAttribute("aria-checked", String(state.activeColor === null));
  none.addEventListener("click", () => { state.activeColor = null; renderPalette(); });
  el.palette.appendChild(none);

  for (const c of COLORS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.background = c.hex;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", c.label);
    b.title = c.label;
    b.setAttribute("aria-checked", String(state.activeColor === c.id));
    b.addEventListener("click", () => { state.activeColor = c.id; renderPalette(); });
    el.palette.appendChild(b);
  }
}

function renderPool() {
  el.pool.innerHTML = "";
  state.pool.forEach((die, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = dieClass(die);
    applyColorStyle(b, die.color);
    const c = colorById(die.color);
    b.setAttribute("aria-label", `Dé ${i + 1}${c ? `, ${c.label}` : ""}`);
    b.title = "Cliquer pour appliquer la couleur sélectionnée";
    b.innerHTML = `<span class="idx">${i + 1}</span>d${die.faces}`;
    b.addEventListener("click", () => paintDie(i));
    el.pool.appendChild(b);
  });
}

function renderResults(animate = false) {
  animationToken++; // stoppe une éventuelle animation en cours sur l'ancien rendu
  el.results.innerHTML = "";
  if (!state.lastRoll) {
    el.results.innerHTML = `<p class="empty">Aucun lancer pour l'instant.</p>`;
    return;
  }

  const sum = total(state.lastRoll);
  const doAnimate = animate && !reduceMotion();
  const card = document.createElement("div");
  card.className = "total-card";
  card.innerHTML = `
    <span class="label">${notation(state.lastRoll.length, state.lastRoll[0].faces)} — total</span>
    <span class="value${doAnimate ? " pending" : ""}">${doAnimate ? "…" : sum}</span>`;
  el.results.appendChild(card);
  const totalEl = card.querySelector(".value");
  const rollingDice = []; // { el, die, landAt }

  const groups = groupByColor(state.lastRoll);
  const multiGroup = groups.length > 1;

  for (const g of groups) {
    const wrap = document.createElement("div");
    wrap.className = "group";

    const head = document.createElement("div");
    head.className = "group-head";
    const dot = document.createElement("span");
    dot.className = "dot" + (g.color ? "" : " none");
    if (g.color) dot.style.background = g.color.hex;
    const name = document.createElement("span");
    name.textContent = g.color ? g.color.label : (multiGroup ? "Sans couleur" : "Tous les dés");
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = `${g.count} dé${g.count > 1 ? "s" : ""}`;
    const s = document.createElement("span");
    s.className = "sum";
    s.textContent = multiGroup ? (doAnimate ? "…" : `= ${g.total}`) : "";
    if (multiGroup && doAnimate) s.classList.add("pending");
    head.append(dot, name, detail, s);
    wrap.appendChild(head);
    const groupSum = multiGroup ? { el: s, remaining: g.dice.length, total: g.total } : null;

    const grid = document.createElement("div");
    grid.className = "dice-grid";
    const dice = state.sortResults ? [...g.dice].sort((a, b) => b.value - a.value) : g.dice;
    for (const die of dice) {
      const d = document.createElement("div");
      d.className = dieClass(die) + " result";
      applyColorStyle(d, die.color);
      const c = colorById(die.color);
      d.setAttribute("aria-label", `Dé ${die.id + 1}${c ? ` ${c.label}` : ""} : ${die.value}`);
      if (doAnimate) {
        // Départ décalé selon l'index d'origine du dé (vague de gauche à droite), avec un léger aléa.
        const delay = Math.min(die.id * ROLL_STAGGER, ROLL_STAGGER_MAX) + Math.random() * 90;
        d.classList.add("rolling");
        d.style.setProperty("--roll-delay", `${Math.round(delay)}ms`);
        d.style.setProperty("--roll-duration", `${ROLL_DURATION}ms`);
        d.innerHTML = `<span class="idx">${die.id + 1}</span><span class="face">${randomFace(die.faces)}</span>`;
        rollingDice.push({ el: d, die, landAt: delay + ROLL_DURATION, groupSum });
      } else {
        markExtremes(d, die);
        d.innerHTML = `<span class="idx">${die.id + 1}</span><span class="face">${die.value}</span>`;
      }
      grid.appendChild(d);
    }
    wrap.appendChild(grid);
    el.results.appendChild(wrap);
  }

  if (doAnimate) runRollAnimation(rollingDice, totalEl, sum);
}

function markExtremes(node, die) {
  if (die.value === die.faces) node.classList.add("max");
  else if (die.value === 1) node.classList.add("min");
}

/**
 * Fait défiler des chiffres aléatoires sur chaque dé pendant son tumble,
 * puis fige la valeur finale au moment où il se pose. Le total s'affiche
 * en comptant jusqu'à la somme une fois le dernier dé posé.
 */
function runRollAnimation(rollingDice, totalEl, sum) {
  const token = ++animationToken;
  const start = performance.now();
  let lastFlicker = 0;
  let pending = rollingDice.slice();

  function frame(now) {
    if (token !== animationToken) return; // un nouveau lancer a pris le relais
    const elapsed = now - start;
    const flick = now - lastFlicker >= FLICKER_INTERVAL;
    if (flick) lastFlicker = now;
    const still = [];
    for (const r of pending) {
      if (elapsed >= r.landAt) {
        r.el.classList.remove("rolling");
        r.el.classList.add("landed");
        r.el.querySelector(".face").textContent = r.die.value;
        markExtremes(r.el, r.die);
        if (r.groupSum && --r.groupSum.remaining === 0) {
          r.groupSum.el.textContent = `= ${r.groupSum.total}`;
          r.groupSum.el.classList.remove("pending");
          r.groupSum.el.classList.add("pop");
        }
      } else {
        if (flick && elapsed >= r.landAt - ROLL_DURATION) {
          r.el.querySelector(".face").textContent = randomFace(r.die.faces);
        }
        still.push(r);
      }
    }
    pending = still;
    if (pending.length) {
      requestAnimationFrame(frame);
    } else {
      countUp(totalEl, sum, token);
    }
  }
  requestAnimationFrame(frame);
}

function countUp(node, target, token) {
  const duration = Math.min(600, 150 + target * 4);
  const start = performance.now();
  node.classList.remove("pending");
  node.classList.add("pop");
  function step(now) {
    if (token !== animationToken) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = Math.round(target * eased);
    if (t < 1) requestAnimationFrame(step);
    else node.textContent = target;
  }
  requestAnimationFrame(step);
}

function renderHistory() {
  el.history.innerHTML = "";
  for (const h of state.history) {
    const li = document.createElement("li");
    const n = document.createElement("span");
    n.className = "h-notation";
    n.textContent = notation(h.count, h.faces);
    const dice = document.createElement("span");
    dice.className = "h-dice";
    for (const d of h.dice.slice(0, HISTORY_DICE_SHOWN)) {
      const s = document.createElement("span");
      s.className = "h-die" + (d.color ? " colored" : "");
      applyColorStyle(s, d.color);
      s.textContent = d.value;
      dice.appendChild(s);
    }
    if (h.dice.length > HISTORY_DICE_SHOWN) {
      const more = document.createElement("span");
      more.className = "h-more";
      more.textContent = `+${h.dice.length - HISTORY_DICE_SHOWN}`;
      more.title = h.dice.map((d) => d.value).join(", ");
      dice.appendChild(more);
    }
    const t = document.createElement("span");
    t.className = "h-total";
    t.textContent = h.total;
    const time = document.createElement("span");
    time.className = "h-time";
    time.textContent = new Date(h.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    li.append(n, dice, t, time);
    el.history.appendChild(li);
  }
}

function renderAll() {
  renderConfig();
  renderPalette();
  renderPool();
  renderResults();
  renderHistory();
}

// ---------- Actions ----------
function setConfig(count, faces) {
  state.count = clampInt(count, 1, MAX_DICE, state.count);
  state.faces = clampInt(faces, MIN_FACES, MAX_FACES, state.faces);
  state.pool = createPool(state.count, state.faces, state.pool);
  renderConfig();
  renderPool();
  save();
}

function paintDie(index) {
  const die = state.pool[index];
  // Cliquer avec la couleur déjà appliquée la retire (toggle).
  die.color = die.color === state.activeColor ? null : state.activeColor;
  renderPool();
  save();
}

function paintAll(colorId) {
  for (const die of state.pool) die.color = colorId;
  renderPool();
  save();
}

function roll() {
  el.roll.classList.remove("pressed");
  void el.roll.offsetWidth; // relance l'animation CSS
  el.roll.classList.add("pressed");
  state.lastRoll = rollPool(state.pool);
  state.history.unshift({
    count: state.count,
    faces: state.faces,
    dice: state.lastRoll.map((d) => ({ color: d.color, value: d.value })),
    total: total(state.lastRoll),
    at: Date.now(),
  });
  state.history = state.history.slice(0, HISTORY_LIMIT);
  renderResults(true);
  renderHistory();
  save();
}

// ---------- Événements ----------
el.count.addEventListener("change", () => setConfig(el.count.value, state.faces));
el.faces.addEventListener("change", () => setConfig(state.count, el.faces.value));
el.count.addEventListener("input", () => {
  el.notation.value = notation(clampInt(el.count.value, 1, MAX_DICE, state.count), state.faces);
});
el.faces.addEventListener("input", () => {
  el.notation.value = notation(state.count, clampInt(el.faces.value, MIN_FACES, MAX_FACES, state.faces));
});
el.presets.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) setConfig(state.count, chip.dataset.faces);
});
el.paintAll.addEventListener("click", () => paintAll(state.activeColor));
el.clearColors.addEventListener("click", () => paintAll(null));
el.roll.addEventListener("click", roll);
el.sort.addEventListener("change", () => {
  state.sortResults = el.sort.checked;
  renderResults();
  save();
});
el.clearHistory.addEventListener("click", () => {
  state.history = [];
  renderHistory();
  save();
});
document.addEventListener("keydown", (e) => {
  // Entrée ou Espace hors d'un champ = lancer
  if ((e.key === "Enter" || e.key === " ") && !["INPUT", "BUTTON", "TEXTAREA"].includes(e.target.tagName)) {
    e.preventDefault();
    roll();
  }
});

// ---------- Init ----------
load();
if (state.pool.length === 0) state.pool = createPool(state.count, state.faces);
renderAll();
