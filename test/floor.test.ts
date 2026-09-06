import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { generateFloor, reachable, stairRoom, difficultyLevel, floorKind } from "../src/core/floor.js";
import { WARDEN, bossOf } from "../src/core/content/ruins.js";

const dayArb = fc.date({ min: new Date("2026-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString().slice(0, 10));
const floorArb = fc.integer({ min: 1, max: 10 });

describe("floor generation", () => {
  it("is deterministic per floor and day", () => {
    fc.assert(fc.property(floorArb, dayArb, (f, day) => {
      expect(JSON.stringify(generateFloor(f, day))).toBe(JSON.stringify(generateFloor(f, day)));
    }));
  });
  it("wild floors change with the day", () => {
    expect(JSON.stringify(generateFloor(3, "2026-09-05"))).not.toBe(JSON.stringify(generateFloor(3, "2026-09-06")));
  });
  it("kinds: 1 is the trial, 2 the city, 3 and up the wild; difficulty starts at floor 3", () => {
    expect(floorKind(1)).toBe("trial");
    expect(floorKind(2)).toBe("city");
    expect(floorKind(3)).toBe("wild");
    expect(difficultyLevel(1)).toBe(0);
    expect(difficultyLevel(3)).toBe(1);
    expect(difficultyLevel(10)).toBe(8);
  });
  it("every visible room is reachable without crossing a hidden one; with hidden rooms revealed, everything is; exits are symmetric; exactly one stair", () => {
    fc.assert(fc.property(floorArb, dayArb, (f, day) => {
      const g = generateFloor(f, day);
      const ids = Object.keys(g.rooms);
      const hidden = ids.filter((id) => g.rooms[id]!.hidden);
      const visible = reachable(g, g.entrance);
      for (const id of ids) {
        if (g.rooms[id]!.hidden) expect(visible.has(id)).toBe(false);
        else expect(visible.has(id)).toBe(true);
        for (const e of g.rooms[id]!.exits) expect(g.rooms[e]!.exits).toContain(id);
      }
      expect(reachable(g, g.entrance, new Set(hidden)).size).toBe(ids.length);
      expect(ids.filter((id) => g.rooms[id]!.stair)).toHaveLength(1);
      expect(g.rooms[g.entrance]!.type).toBe("entrance");
      expect(g.rooms[g.boss]!.type).toBe("boss");
      expect(g.rooms[g.boss]!.enemy?.boss).toBe(true);
    }));
  });
  it("the trial floor: weak rooms, the stair is not behind the boss, and the hidden Warden is harder than the floor 10 boss", () => {
    fc.assert(fc.property(dayArb, (day) => {
      const g = generateFloor(1, day);
      const stair = stairRoom(g);
      expect(stair.type).toBe("stair");
      expect(reachable(g, g.entrance).has(stair.id)).toBe(true);
      const warden = g.rooms[g.boss]!;
      expect(warden.hidden).toBe(true);
      expect(warden.secretDc).toBeGreaterThan(0);
      expect(warden.enemy!.id).toBe("warden");
      for (const r of Object.values(g.rooms)) if (r.type === "combat") expect(r.enemy!.maxHp).toBeLessThan(20);
    }));
    const top = bossOf(difficultyLevel(10));
    expect(WARDEN.maxHp).toBeGreaterThan(top.maxHp);
    expect(WARDEN.attack).toBeGreaterThan(top.attack);
    expect(WARDEN.armor).toBeGreaterThanOrEqual(top.armor);
  });
  it("the city: no enemies or traps above ground, an inn to rest in, the stair open, one hidden boss beneath the well", () => {
    const g = generateFloor(2, "2026-09-06");
    for (const r of Object.values(g.rooms)) {
      if (!r.hidden) { expect(r.enemy).toBeUndefined(); expect(r.trapDc).toBeUndefined(); }
    }
    expect(Object.values(g.rooms).some((r) => r.type === "rest")).toBe(true);
    expect(stairRoom(g).type).toBe("stair");
    expect(g.rooms[g.boss]!.hidden).toBe(true);
    expect(g.rooms[g.boss]!.enemy!.boss).toBe(true);
  });
  it("wild floors: the stair is in the boss room, size 6 to 8, traps and treasure decorated", () => {
    fc.assert(fc.property(fc.integer({ min: 3, max: 10 }), dayArb, (f, day) => {
      const g = generateFloor(f, day);
      expect(stairRoom(g).id).toBe(g.boss);
      const n = Object.keys(g.rooms).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(8);
      for (const r of Object.values(g.rooms)) {
        if (r.type === "combat") expect(r.enemy).toBeDefined();
        if (r.type === "trap") { expect(r.trapDc).toBeGreaterThan(0); expect(r.trapDamage).toBeGreaterThan(0); }
        if (r.type === "treasure") expect(r.shards).toBeGreaterThan(0);
      }
    }));
  });
});
