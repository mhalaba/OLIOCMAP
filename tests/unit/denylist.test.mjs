import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDenylist, foldPl } from "../../shared/denylist.mjs";

test("denylist: wielkość liter i polskie znaki", () => {
  const a = checkDenylist("ELEKTROWNIA węgiel", "", "odpornosc", "osp");
  assert.equal(a.blocked, true);
  const b = checkDenylist("Elektrociepłownia miejska", "", "odpornosc", "osp");
  assert.equal(b.blocked, true);
});

test("denylist: granica słowa EC / GPZ", () => {
  assert.equal(checkDenylist("EC Bytom", "", "prad", "gmina").blocked, true);
  assert.equal(checkDenylist("leczenie", "", "odpornosc", "osp").blocked, false);
  assert.equal(checkDenylist("GPZ centrum", "", "prad", "osp").blocked, true);
});

test("denylist: ujęcie wody wyjątek dla woda+gmina", () => {
  assert.equal(checkDenylist("Ujęcie wody", "", "odpornosc", "osp").blocked, true);
  assert.equal(checkDenylist("Ujęcie wody", "", "woda", "gmina").blocked, false);
});

test("foldPl", () => {
  assert.equal(foldPl("Łódź"), "lodz");
});
