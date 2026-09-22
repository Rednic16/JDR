// Tests de la logique pure : `node --test dice.test.js`
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DICE, MAX_FACES, clampInt, createPool, groupByColor, notation, randomFace, rollPool, total,
} from "./dice.js";

test("clampInt borne et gère les valeurs invalides", () => {
  assert.equal(clampInt("5", 1, 10, 3), 5);
  assert.equal(clampInt("0", 1, 10, 3), 1);
  assert.equal(clampInt("999", 1, 10, 3), 10);
  assert.equal(clampInt("abc", 1, 10, 3), 3);
  assert.equal(clampInt("", 1, 10, 3), 3);
});

test("randomFace reste dans [1, faces] pour d2..d100", () => {
  for (const faces of [2, 6, 20, MAX_FACES]) {
    for (let i = 0; i < 2000; i++) {
      const v = randomFace(faces);
      assert.ok(v >= 1 && v <= faces && Number.isInteger(v), `${v} hors de [1,${faces}]`);
    }
  }
});

test("randomFace atteint toutes les faces d'un d6", () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(randomFace(6));
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test("randomFace accepte un générateur injecté", () => {
  assert.equal(randomFace(20, () => 19), 20);
  assert.equal(randomFace(20, () => 0), 1);
});

test("randomFace refuse un nombre de faces invalide", () => {
  assert.throws(() => randomFace(0), RangeError);
  assert.throws(() => randomFace(2.5), RangeError);
});

test("createPool crée N dés sans couleur et conserve les couleurs précédentes", () => {
  const pool = createPool(3, 6);
  assert.equal(pool.length, 3);
  assert.ok(pool.every((d) => d.faces === 6 && d.color === null && d.value === null));

  pool[1].color = "red";
  const bigger = createPool(5, 20, pool);
  assert.equal(bigger[1].color, "red");
  assert.equal(bigger[4].color, null);
  assert.ok(bigger.every((d) => d.faces === 20));

  const smaller = createPool(1, 20, pool);
  assert.equal(smaller.length, 1);
});

test("createPool supporte le maximum de dés", () => {
  assert.equal(createPool(MAX_DICE, MAX_FACES).length, MAX_DICE);
});

test("rollPool ne mute pas le pool d'origine et remplit les valeurs", () => {
  const pool = createPool(4, 8);
  const rolled = rollPool(pool, () => 3);
  assert.ok(pool.every((d) => d.value === null));
  assert.ok(rolled.every((d) => d.value === 4));
  assert.equal(total(rolled), 16);
  assert.equal(total(pool), 0);
});

test("groupByColor ordonne selon la palette, sans couleur en dernier, avec sous-totaux", () => {
  const pool = createPool(5, 6);
  pool[0].color = "blue";
  pool[1].color = null;
  pool[2].color = "red";
  pool[3].color = "blue";
  pool[4].color = null;
  const rolled = pool.map((d, i) => ({ ...d, value: i + 1 })); // 1..5

  const groups = groupByColor(rolled);
  assert.deepEqual(groups.map((g) => g.color?.id ?? null), ["red", "blue", null]);
  assert.deepEqual(groups.map((g) => g.count), [1, 2, 2]);
  assert.deepEqual(groups.map((g) => g.total), [3, 1 + 4, 2 + 5]);
});

test("notation", () => {
  assert.equal(notation(3, 6), "3d6");
  assert.equal(notation(1, 100), "1d100");
});
