import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ERRANDS, newCharacter, step } from "../src/core/engine.js";
import { generateFloor } from "../src/core/floor.js";
import { seeded } from "../src/core/rng.js";
import type { Character } from "../src/core/types.js";

const T0 = Date.parse("2026-09-06T10:00:00Z");
const H = 3_600_000;

function atInn(): Character {
  return { ...newCharacter("c1", "p1", "Tester", 20, T0), floor: 2, roomId: "inn", runDay: "2026-09-06", hp: 20 };
}

describe("errands (while you were away)", () => {
  it("are offered at the inn, including lodging, and start when chosen", () => {
    const rng = seeded(1);
    let r = step(atInn(), { verb: "look" }, T0, rng);
    const kinds = r.response.choices.filter((c) => c.verb === "errand").map((c) => c.args!.kind);
    expect(kinds).toEqual(expect.arrayContaining(["forage", "scout", "vigil", "lodge"]));
    r = step(r.character, { verb: "errand", args: { kind: "lodge" } }, T0, rng);
    expect(r.character.errand?.kind).toBe("lodge");
    expect(r.character.errand?.resolvesAt).toBe(T0 + ERRANDS.lodge.hours * H);
    expect(r.character.shards).toBe(newCharacter("x", "p", "Tester", 20, T0).shards - ERRANDS.lodge.cost);
    expect(r.response.events.some((e) => e.type === "errand_started")).toBe(true);
  });

  it("lodging is not offered outside the inn; nothing is offered in a wild combat room", () => {
    const rng = seeded(2);
    const sq = step({ ...atInn(), roomId: "square" }, { verb: "look" }, T0, rng);
    const kinds = sq.response.choices.filter((c) => c.verb === "errand").map((c) => c.args!.kind);
    expect(kinds).toContain("forage");
    expect(kinds).not.toContain("lodge");
    const g = generateFloor(3, "2026-09-06");
    const combatRoom = Object.values(g.rooms).find((x) => x.type === "combat")!;
    const w = step({ ...atInn(), floor: 3, roomId: combatRoom.id, cleared: [combatRoom.id] }, { verb: "look" }, T0, rng);
    expect(w.response.choices.some((c) => c.verb === "errand")).toBe(false);
  });

  it("while away, every verb reports the wait; abandoning returns you with nothing", () => {
    const rng = seeded(3);
    let r = step(atInn(), { verb: "errand", args: { kind: "vigil" } }, T0, rng);
    r = step(r.character, { verb: "move", args: { to: "square" } }, T0 + H, rng);
    expect(r.character.roomId).toBe("inn");
    expect(r.response.text).toMatch(/away.*Back in 7h/);
    r = step(r.character, { verb: "abandon" }, T0 + H, rng);
    expect(r.character.errand).toBeNull();
    expect(r.character.focus).toBeLessThan(200);
  });

  it("resolves lazily on the first action after the time, and lodging heals fully", () => {
    const rng = seeded(4);
    let r = step(atInn(), { verb: "errand", args: { kind: "lodge" } }, T0, rng);
    r = step(r.character, { verb: "look" }, T0 + 6 * H + 1, rng);
    expect(r.character.errand).toBeNull();
    expect(r.response.text).toContain("While you were away");
    expect(r.character.hp).toBe(r.response.state.maxHp);
    expect(r.response.events.some((e) => e.type === "errand_resolved")).toBe(true);
  });

  it("scouting from the city reveals the well; scouting the trial reveals the Warden's vault", () => {
    const rng = seeded(5);
    let r = step(atInn(), { verb: "errand", args: { kind: "scout" } }, T0, rng);
    r = step(r.character, { verb: "look" }, T0 + 5 * H, rng);
    expect(r.character.revealed).toContain("well");
    const trial = { ...newCharacter("c2", "p2", "Scout", 20, T0), runDay: "2026-09-06" };
    let t = step(trial, { verb: "look" }, T0, rng);
    const rest = Object.values(generateFloor(1, "2026-09-06").rooms).find((x) => x.type === "rest")!;
    t = { ...t, character: { ...t.character, roomId: rest.id } };
    t = step(t.character, { verb: "errand", args: { kind: "scout" } }, T0, rng);
    expect(t.character.errand?.kind).toBe("scout");
    t = step(t.character, { verb: "look" }, T0 + 5 * H, rng);
    expect(t.character.revealed).toContain("h0");
  });

  it("outcomes are deterministic from the seed, and foraging can wound but never kill", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 2, max: 20 }), (seed, hp) => {
      const g = generateFloor(5, "2026-09-06");
      const rest = Object.values(g.rooms).find((x) => x.type === "rest");
      if (!rest) return; // this day's floor 5 has no rest room; nothing to test
      const base: Character = { ...newCharacter("c", "p", "Fen", 20, T0), floor: 5, roomId: rest.id, runDay: "2026-09-06", hp };
      const started = step(base, { verb: "errand", args: { kind: "forage" } }, T0, seeded(seed)).character;
      const a = step(started, { verb: "look" }, T0 + 3 * H, seeded(1));
      const b = step(started, { verb: "look" }, T0 + 3 * H, seeded(999));
      expect(a.character.shards).toBe(b.character.shards);
      expect(a.character.hp).toBe(b.character.hp);
      expect(a.character.hp).toBeGreaterThanOrEqual(1);
      expect(a.character.status).toBe("alive");
      expect(a.character.shards).toBeGreaterThan(base.shards);
    }), { numRuns: 100 });
  });
});
