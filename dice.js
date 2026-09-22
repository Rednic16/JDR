// Logique pure du lanceur de dés (aucune dépendance au DOM).
// Utilisable depuis le navigateur (ES module) et depuis Node pour les tests.

export const MAX_DICE = 100;
export const MAX_FACES = 100;
export const MIN_FACES = 2;

/** Palette de couleurs disponibles pour marquer les dés. */
export const COLORS = [
  { id: "red",    label: "Rouge",  hex: "#e5484d" },
  { id: "orange", label: "Orange", hex: "#f76b15" },
  { id: "yellow", label: "Jaune",  hex: "#f5d90a" },
  { id: "green",  label: "Vert",   hex: "#30a46c" },
  { id: "teal",   label: "Cyan",   hex: "#12a594" },
  { id: "blue",   label: "Bleu",   hex: "#3e63dd" },
  { id: "purple", label: "Violet", hex: "#8e4ec6" },
  { id: "pink",   label: "Rose",   hex: "#d6409f" },
];

export function colorById(id) {
  return COLORS.find((c) => c.id === id) || null;
}

/** Borne un entier dans [min, max]; retourne `fallback` si la valeur n'est pas un nombre. */
export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Entier aléatoire uniforme dans [1, faces].
 * Utilise crypto.getRandomValues quand disponible (rejection sampling pour éviter le biais modulo).
 */
export function randomFace(faces, rng = defaultRng) {
  if (!Number.isInteger(faces) || faces < 1) throw new RangeError("faces must be >= 1");
  return 1 + rng(faces);
}

function defaultRng(n) {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    let x;
    do {
      cryptoObj.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % n;
  }
  return Math.floor(Math.random() * n);
}

/**
 * Crée un pool de `count` dés à `faces` faces, sans couleur.
 * Conserve les couleurs déjà attribuées si `previous` est fourni (même index).
 */
export function createPool(count, faces, previous = []) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    pool.push({ id: i, faces, color: previous[i]?.color ?? null, value: null });
  }
  return pool;
}

/** Lance tous les dés du pool et retourne un nouveau pool avec les valeurs. */
export function rollPool(pool, rng) {
  return pool.map((die) => ({ ...die, value: randomFace(die.faces, rng) }));
}

/** Somme des valeurs (0 si non lancé). */
export function total(pool) {
  return pool.reduce((sum, d) => sum + (d.value ?? 0), 0);
}

/**
 * Regroupe les dés par couleur.
 * Retourne un tableau ordonné selon COLORS, puis "sans couleur" en dernier.
 * Chaque groupe : { color: {id,label,hex} | null, dice: [...], total, count }
 */
export function groupByColor(pool) {
  const groups = new Map();
  for (const die of pool) {
    const key = die.color ?? "none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(die);
  }
  const ordered = [];
  for (const c of COLORS) {
    if (groups.has(c.id)) ordered.push(buildGroup(c, groups.get(c.id)));
  }
  if (groups.has("none")) ordered.push(buildGroup(null, groups.get("none")));
  return ordered;
}

function buildGroup(color, dice) {
  return { color, dice, count: dice.length, total: total(dice) };
}

/** Formate un pool en notation courte, ex. "3d6" ou "2d20". */
export function notation(count, faces) {
  return `${count}d${faces}`;
}
