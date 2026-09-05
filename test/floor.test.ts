import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { generateFloor, reachable } from "../src/core/floor.js";

describe("floor generation", () => {
  const dayArb = fc.date({ min: new Date("2026-01-01"), max: new Date("2030-01-01") }).map((d) => d.toISOString().slice(0, 10));

  it("is deterministic per floor and day", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), dayArb, (f, day) => {
      expect(JSON.stringify(generateFloor(f, day))).toBe(JSON.stringify(generateFloor(f, day)));
    }));
  });
  it("changes with the day", () => {
    expect(JSON.stringify(generateFloor(1, "2026-09-05"))).not.toBe(JSON.stringify(generateFloor(1, "2026-09-06")));
  });
  it("every room is reachable from the entrance, the boss from every room, exits are symmetric, and size is 6 to 8", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), dayArb, (f, day) => {
      const g = generateFloor(f, day);
      const ids = Object.keys(g.rooms);
      expect(ids.length).toBeGreaterThanOrEqual(6);
      expect(ids.length).toBeLessThanOrEqual(8);
      expect(reachable(g, g.entrance).size).toBe(ids.length);
      for (const id of ids) {
        expect(reachable(g, id).has(g.boss)).toBe(true);
        for (const e of g.rooms[id]!.exits) expect(g.rooms[e]!.exits).toContain(id);
      }
      expect(g.rooms[g.entrance]!.type).toBe("entrance");
      expect(g.rooms[g.boss]!.type).toBe("boss");
      expect(g.rooms[g.boss]!.enemy?.boss).toBe(true);
      expect(ids.filter((id) => g.rooms[id]!.type === "boss")).toHaveLength(1);
    }));
  });
  it("combat rooms carry an enemy, traps carry a dc and damage, treasure carries shards", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), dayArb, (f, day) => {
      for (const r of Object.values(generateFloor(f, day).rooms)) {
        if (r.type === "combat") expect(r.enemy).toBeDefined();
        if (r.type === "trap") { expect(r.trapDc).toBeGreaterThan(0); expect(r.trapDamage).toBeGreaterThan(0); }
        if (r.type === "treasure") expect(r.shards).toBeGreaterThan(0);
      }
    }));
  });
});
