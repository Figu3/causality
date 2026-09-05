import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeEstate, isHeldPlace } from "../src/core/estate.js";
import { baseStats } from "../src/core/stats.js";
import type { Character, Heir } from "../src/core/types.js";

function ch(shards: number, heir: Heir | null, heirloom: boolean): Character {
  return {
    id: "c", playerId: "p", name: "T", bornAt: 0, startingAge: 20, base: baseStats(), level: 1, xp: 0, unspent: 0,
    hp: 1, focus: 0, shards,
    inventory: [{ id: "h", name: "ring", kind: "trinket", value: 10 }, { id: "x", name: "rope", kind: "trinket", value: 1 }],
    heirloomId: heirloom ? "h" : null, heir, floor: 1, roomId: null, runDay: null, cleared: [], combat: null, kills: 0,
    ascents: [], status: "alive", death: null,
  };
}
const accepted: Heir = { kind: "blood", characterId: "h1", accepted: true };
const pending: Heir = { kind: "blood", characterId: "h1", accepted: false };
const spiritual: Heir = { kind: "spiritual", label: "@friend", claimToken: "t" };

describe("estate rule", () => {
  it("shards to heir plus burned always equals the estate", () => {
    fc.assert(fc.property(fc.nat(1e6), fc.constantFrom(accepted, pending, spiritual, null), fc.boolean(), fc.boolean(), (s, heir, held, ret) => {
      const e = computeEstate(ch(s, heir, true), ret ? "retirement" : "death", held);
      expect(e.shardsToHeir + e.shardsBurned).toBe(s);
      expect(e.shardsToHeir).toBeGreaterThanOrEqual(0);
    }));
  });
  it("10% on death, 25% on retirement, only with an accepted heir", () => {
    expect(computeEstate(ch(1000, accepted, false), "death", true).shardsToHeir).toBe(100);
    expect(computeEstate(ch(1000, accepted, false), "retirement", true).shardsToHeir).toBe(250);
    expect(computeEstate(ch(1000, spiritual, false), "death", true).shardsToHeir).toBe(100);
    expect(computeEstate(ch(1000, pending, false), "death", true).shardsToHeir).toBe(0);
    expect(computeEstate(ch(1000, null, false), "retirement", true).shardsToHeir).toBe(0);
  });
  it("the heirloom passes in a held place and drops in the wild, never both, never neither", () => {
    fc.assert(fc.property(fc.boolean(), fc.constantFrom(accepted, null), (held, heir) => {
      const e = computeEstate(ch(0, heir, true), "death", held);
      expect(e.itemToHeir !== null).toBe(held);
      expect(e.itemDropped !== null).toBe(!held);
      expect(e.itemsLost.map((i) => i.id)).toEqual(["x"]);
    }));
  });
  it("without a heirloom nothing passes or drops and everything is lost", () => {
    const e = computeEstate(ch(0, accepted, false), "death", false);
    expect(e.itemToHeir).toBeNull();
    expect(e.itemDropped).toBeNull();
    expect(e.itemsLost).toHaveLength(2);
  });
  it("floors 1 and 2 are held places, 3 is the wild", () => {
    expect(isHeldPlace(1)).toBe(true);
    expect(isHeldPlace(2)).toBe(true);
    expect(isHeldPlace(3)).toBe(false);
  });
});
