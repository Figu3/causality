import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { BETA_TOP_FLOOR, newCharacter, step, type SideEffect } from "../src/core/engine.js";
import { seeded, type Rng } from "../src/core/rng.js";
import { DAY_MS, MAX_AGE } from "../src/core/stats.js";
import type { Character, Response } from "../src/core/types.js";

const T0 = Date.parse("2026-09-05T10:00:00Z");

function fresh(age = 20, now = T0): Character {
  return newCharacter("c1", "p1", "Tester", age, now);
}

/** Drive a character with a simple policy: attack in combat, take treasure, rest, otherwise walk to an unvisited exit. */
function autoplay(c: Character, rng: Rng, now: number, maxSteps: number): { c: Character; last: Response; effects: SideEffect[]; steps: number } {
  let cur = c;
  let last = step(cur, { verb: "look" }, now, rng);
  cur = last.character;
  const effects: SideEffect[] = [...last.effects];
  const visited = new Set<string>();
  let steps = 1;
  while (cur.status === "alive" && steps < maxSteps) {
    const ch = last.response.choices;
    const pick =
      ch.find((x) => x.verb === "attack") ??
      ch.find((x) => x.verb === "take") ??
      ch.find((x) => x.verb === "rest") ??
      ch.find((x) => x.verb === "climb") ??
      ch.filter((x) => x.verb === "move").find((x) => !visited.has(`${cur.floor}:${x.args!.to}`)) ??
      ch.find((x) => x.verb === "move");
    if (!pick) break;
    if (pick.verb === "move") visited.add(`${cur.floor}:${pick.args!.to}`);
    last = step(cur, { verb: pick.verb, args: pick.args ?? {} }, now, rng);
    cur = last.character;
    effects.push(...last.effects);
    steps++;
  }
  return { c: cur, last: last.response, effects, steps };
}

describe("character creation", () => {
  it("rejects bad ages and names", () => {
    expect(() => newCharacter("x", "p", "Ok", 14, T0)).toThrow();
    expect(() => newCharacter("x", "p", "Ok", 46, T0)).toThrow();
    expect(() => newCharacter("x", "p", "Ok", 20.5, T0)).toThrow();
    expect(() => newCharacter("x", "p", "A", 20, T0)).toThrow();
  });
  it("starts at full hp on floor 1 with the kit", () => {
    const c = fresh();
    expect(c.hp).toBeGreaterThan(100);
    expect(c.floor).toBe(1);
    expect(c.inventory.some((i) => i.kind === "weapon")).toBe(true);
  });
});

describe("engine", () => {
  it("the first action puts you at the entrance and offers exits", () => {
    const r = step(fresh(), { verb: "look" }, T0, seeded(1));
    expect(r.character.roomId).toBe("r0");
    expect(r.response.choices.some((c) => c.verb === "move")).toBe(true);
    expect(r.response.state.floor).toBe(1);
  });

  it("refuses moves to non-adjacent rooms", () => {
    const r0 = step(fresh(), { verb: "look" }, T0, seeded(1));
    const r = step(r0.character, { verb: "move", args: { to: "zzz" } }, T0, seeded(1));
    expect(r.character.roomId).toBe("r0");
  });

  it("a run always ends in death, an ascent, or exhaustion of the map, and hp never exceeds max", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 15, max: 45 }), (seed, age) => {
      const { c, last, steps } = autoplay(fresh(age), seeded(seed), T0, 200);
      expect(steps).toBeLessThan(200);
      expect(c.hp).toBeLessThanOrEqual(last.state.maxHp);
      expect(c.hp).toBeGreaterThanOrEqual(0);
      if (c.status === "dead") {
        expect(c.hp).toBe(0);
        expect(c.death).not.toBeNull();
        expect(c.shards).toBe(0);
        expect(c.inventory).toHaveLength(0);
      }
    }), { numRuns: 150 });
  });

  it("some runs ascend and climbing stops at the beta cap", () => {
    let ascended = 0, capped = false;
    for (let seed = 1; seed < 400 && !capped; seed++) {
      const { c } = autoplay(fresh(30), seeded(seed), T0, 2000);
      if (c.ascents.length) ascended++;
      if (c.floor === BETA_TOP_FLOOR && c.ascents.includes(BETA_TOP_FLOOR)) capped = true;
      expect(c.floor).toBeLessThanOrEqual(BETA_TOP_FLOOR);
    }
    expect(ascended).toBeGreaterThan(0);
  });

  it("dies of old age on the next action, in place", () => {
    const c = fresh(45);
    const later = T0 + ((MAX_AGE - 45) / 0.8 + 1) * DAY_MS;
    const r = step(c, { verb: "look" }, later, seeded(1));
    expect(r.character.status).toBe("dead");
    expect(r.character.death?.cause).toBe("of old age");
    expect(r.response.events.some((e) => e.type === "death")).toBe(true);
    expect(r.effects.some((e) => e.type === "hall")).toBe(true);
  });

  it("death in a held place passes the heirloom to an accepted heir; in the wild it drops", () => {
    const base = { ...fresh(), heirloomId: "knife", heir: { kind: "blood" as const, characterId: "h", accepted: true }, shards: 100 };
    const later = T0 + 200 * DAY_MS; // old age
    const held = step({ ...base, floor: 1 }, { verb: "look" }, later, seeded(1));
    const transfer = held.effects.find((e) => e.type === "heir_transfer");
    expect(transfer && transfer.type === "heir_transfer" && transfer.item?.id).toBe("knife");
    expect(transfer && transfer.type === "heir_transfer" && transfer.shards).toBe(10);
    expect(held.effects.some((e) => e.type === "corpse")).toBe(false);

    const wild = step({ ...base, floor: 3 }, { verb: "look" }, later, seeded(1));
    const corpse = wild.effects.find((e) => e.type === "corpse");
    expect(corpse && corpse.type === "corpse" && corpse.item.id).toBe("knife");
    const t2 = wild.effects.find((e) => e.type === "heir_transfer");
    expect(t2 && t2.type === "heir_transfer" && t2.item).toBeNull();
  });

  it("an unaccepted heir gets nothing; a spiritual heir produces a claim", () => {
    const later = T0 + 200 * DAY_MS;
    const pending = step({ ...fresh(), heir: { kind: "blood", characterId: "h", accepted: false }, shards: 100 }, { verb: "look" }, later, seeded(1));
    expect(pending.effects.some((e) => e.type === "heir_transfer" || e.type === "heir_claim")).toBe(false);

    const named = step(fresh(), { verb: "look" }, T0, seeded(1));
    const withHeir = step(named.character, { verb: "heir", args: { kind: "spiritual", label: "@friend" } }, T0, seeded(2));
    expect(withHeir.character.heir?.kind).toBe("spiritual");
    const dead = step({ ...withHeir.character, shards: 100 }, { verb: "look" }, later, seeded(1));
    const claim = dead.effects.find((e) => e.type === "heir_claim");
    expect(claim && claim.type === "heir_claim" && claim.shards).toBe(10);
    expect(claim && claim.type === "heir_claim" && claim.label).toBe("@friend");
  });

  it("retirement needs age and a held place, and pays 25%", () => {
    const c = { ...fresh(45), shards: 400, heir: { kind: "spiritual" as const, label: "@x", claimToken: "t" } };
    const tooYoung = step(c, { verb: "retire" }, T0, seeded(1));
    expect(tooYoung.character.status).toBe("alive");
    const elder = T0 + ((63 - 45) / 0.8 + 1) * DAY_MS;
    const wild = step({ ...c, floor: 5 }, { verb: "retire" }, elder, seeded(1));
    expect(wild.character.status).toBe("alive");
    const ok = step(c, { verb: "retire", args: { epitaph: "Went home." } }, elder, seeded(1));
    expect(ok.character.status).toBe("retired");
    const claim = ok.effects.find((e) => e.type === "heir_claim");
    expect(claim && claim.type === "heir_claim" && claim.shards).toBe(100);
    expect(ok.character.death?.epitaph).toBe("Went home.");
  });

  it("a new day resets the run to the entrance of the new graph", () => {
    const r0 = step(fresh(), { verb: "look" }, T0, seeded(1));
    const moved = step(r0.character, { verb: "move", args: { to: r0.response.choices.find((c) => c.verb === "move")!.args!.to! } }, T0, seeded(1));
    const next = step(moved.character, { verb: "look" }, T0 + DAY_MS, seeded(1));
    expect(next.character.roomId).toBe("r0");
    expect(next.character.cleared).toHaveLength(0);
    expect(next.response.text).toContain("new day");
  });

  it("training spends points and raises the stat", () => {
    const c = { ...fresh(), unspent: 2 };
    const r = step(step(c, { verb: "look" }, T0, seeded(1)).character, { verb: "train", args: { stat: "guile" } }, T0, seeded(1));
    expect(r.character.base.guile).toBe(11);
    expect(r.character.unspent).toBe(1);
  });

  it("dead characters only get their epitaph", () => {
    const later = T0 + 200 * DAY_MS;
    const dead = step(fresh(), { verb: "look" }, later, seeded(1)).character;
    const again = step(dead, { verb: "attack" }, later, seeded(1));
    expect(again.character).toEqual(dead);
    expect(again.response.choices).toHaveLength(0);
  });
});
