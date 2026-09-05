import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { resolveTurn, startCombat, hitChance, enemyHitChance, fleeChance } from "../src/core/combat.js";
import { seeded } from "../src/core/rng.js";
import { baseStats, derived } from "../src/core/stats.js";
import type { Character, Enemy } from "../src/core/types.js";

function makeChar(hp = 300): Character {
  return {
    id: "c", playerId: "p", name: "T", bornAt: 0, startingAge: 20, base: baseStats(10), level: 1, xp: 0, unspent: 0,
    hp, focus: 30, shards: 100, inventory: [{ id: "w", name: "stick", kind: "weapon", damage: 5, value: 1 }],
    heirloomId: null, heir: null, floor: 1, roomId: null, runDay: null, cleared: [], combat: null, kills: 0, ascents: [],
    status: "alive", death: null,
  };
}
function makeEnemy(hp = 20): Enemy {
  return { id: "e", name: "Rat", hp, maxHp: hp, attack: 12, armor: 0, dodge: 10, pursuit: 20, xp: 5, shards: 3, boss: false };
}

describe("combat", () => {
  it("probabilities are bounded away from 0 and 1", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 400 }), (a, b) => {
      for (const p of [hitChance(a, b), enemyHitChance(a, false), enemyHitChance(a, true), fleeChance(a, b)]) {
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
    }));
  });

  it("is deterministic for a given seed", () => {
    const c = makeChar();
    const s = baseStats(10), d = derived(s);
    const run = () => {
      const rng = seeded(42);
      let st = startCombat(makeEnemy());
      let ch = c;
      const out: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = resolveTurn(ch, s, d, st, { kind: "attack" }, rng);
        out.push(r.outcome, ...r.lines);
        st = r.combat; ch = r.character;
        if (r.outcome !== "ongoing") break;
      }
      return out.join("|");
    };
    expect(run()).toBe(run());
  });

  it("always terminates, hp never goes negative, damage never heals", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 5, max: 200 }), (seed, ehp) => {
      const rng = seeded(seed);
      const s = baseStats(10), d = derived(s);
      let st = startCombat(makeEnemy(ehp));
      let ch = makeChar(150);
      let turns = 0;
      let outcome = "ongoing";
      while (outcome === "ongoing" && turns < 500) {
        const prevHp = ch.hp;
        const r = resolveTurn(ch, s, d, st, { kind: "attack" }, rng);
        expect(r.character.hp).toBeGreaterThanOrEqual(0);
        expect(r.character.hp).toBeLessThanOrEqual(prevHp);
        expect(r.combat.enemy.hp).toBeLessThanOrEqual(st.enemy.hp);
        st = r.combat; ch = r.character; outcome = r.outcome; turns++;
      }
      expect(outcome).not.toBe("ongoing");
      if (outcome === "died") expect(ch.hp).toBe(0);
      if (outcome === "won") expect(st.enemy.hp).toBe(0);
    }), { numRuns: 200 });
  });

  it("a floor-1 enemy dies in 3 to 6 attacks on average", () => {
    const s = baseStats(10), d = derived(s);
    let total = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const rng = seeded(i + 1);
      let st = startCombat(makeEnemy(20));
      let ch = makeChar(1000);
      let turns = 0;
      for (;;) {
        const r = resolveTurn(ch, s, d, st, { kind: "attack" }, rng);
        turns++;
        st = r.combat; ch = r.character;
        if (r.outcome !== "ongoing") break;
      }
      total += turns;
    }
    const avg = total / N;
    expect(avg).toBeGreaterThanOrEqual(3);
    expect(avg).toBeLessThanOrEqual(6);
  });

  it("flee is always available and a failed flee costs an enemy turn", () => {
    const s = baseStats(10), d = derived(s);
    let fled = 0, hurtOnFail = 0, fails = 0;
    for (let i = 0; i < 300; i++) {
      const rng = seeded(i);
      const r = resolveTurn(makeChar(100), s, d, startCombat(makeEnemy()), { kind: "flee" }, rng);
      if (r.outcome === "fled") fled++;
      else { fails++; if (r.character.hp < 100) hurtOnFail++; }
    }
    expect(fled).toBeGreaterThan(0);
    expect(fails).toBeGreaterThan(0);
    expect(hurtOnFail).toBeGreaterThan(0);
  });

  it("using a consumable never exceeds max hp and removes the item", () => {
    const s = baseStats(10), d = derived(s);
    const c = { ...makeChar(d.maxHp - 5), inventory: [{ id: "p", name: "salve", kind: "consumable" as const, heal: 50, value: 5 }] };
    const r = resolveTurn(c, s, d, startCombat(makeEnemy()), { kind: "use", itemId: "p" }, seeded(1));
    expect(r.character.inventory.find((i) => i.id === "p")).toBeUndefined();
    expect(r.character.hp).toBeLessThanOrEqual(d.maxHp);
  });
});
