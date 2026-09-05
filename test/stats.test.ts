import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ageAt, ageModifiers, baseStats, derived, effectiveStats, growthRate, phaseOf,
  DAY_MS, MAX_AGE, YEARS_PER_DAY,
} from "../src/core/stats.js";
import { STATS } from "../src/core/types.js";

describe("aging", () => {
  it("15 to 80 takes about 81 days", () => {
    const born = 0;
    const days = (MAX_AGE - 15) / YEARS_PER_DAY;
    expect(days).toBeCloseTo(81.25, 2);
    expect(ageAt(15, born, days * DAY_MS)).toBeCloseTo(80, 6);
  });
  it("age is monotonic in time and never below starting age", () => {
    fc.assert(fc.property(fc.integer({ min: 15, max: 45 }), fc.nat(200 * DAY_MS), fc.nat(200 * DAY_MS), (s, t1, t2) => {
      const [a, b] = t1 < t2 ? [t1, t2] : [t2, t1];
      expect(ageAt(s, 0, a)).toBeGreaterThanOrEqual(s);
      expect(ageAt(s, 0, b)).toBeGreaterThanOrEqual(ageAt(s, 0, a));
    }));
  });
  it("phases cover every age without gaps", () => {
    expect(phaseOf(15)).toBe("youth");
    expect(phaseOf(25.9)).toBe("youth");
    expect(phaseOf(26)).toBe("young_adult");
    expect(phaseOf(36)).toBe("prime");
    expect(phaseOf(50.9)).toBe("prime");
    expect(phaseOf(51)).toBe("middle_age");
    expect(phaseOf(63)).toBe("elder");
    expect(phaseOf(80)).toBe("elder");
  });
  it("physical stats decline with age past prime, mental stats never decline", () => {
    fc.assert(fc.property(fc.double({ min: 36, max: 79, noNaN: true }), fc.double({ min: 0.1, max: 44, noNaN: true }), (a, d) => {
      const older = Math.min(a + d, 80);
      const m1 = ageModifiers(a), m2 = ageModifiers(older);
      expect(m2.might).toBeLessThanOrEqual(m1.might);
      expect(m2.agility).toBeLessThanOrEqual(m1.agility);
      expect(m2.cunning).toBeGreaterThanOrEqual(m1.cunning);
      expect(m2.guile).toBeGreaterThanOrEqual(m1.guile);
      expect(m2.presence).toBeGreaterThanOrEqual(m1.presence);
    }));
  });
  it("elder modifiers stay positive up to max age", () => {
    const m = ageModifiers(MAX_AGE);
    for (const s of STATS) expect(m[s]).toBeGreaterThan(0);
  });
  it("growth rate is highest in youth and lowest in elder", () => {
    expect(growthRate(16)).toBeGreaterThan(growthRate(30));
    expect(growthRate(30)).toBeGreaterThan(growthRate(70));
  });
});

describe("derived stats", () => {
  it("match the spec formulas at base 10", () => {
    const d = derived(baseStats(10));
    expect(d.maxHp).toBe(100 + 150 + 50);
    expect(d.stamina).toBe(50 + 100 + 50);
    expect(d.initiative).toBe(30);
    expect(d.dodge).toBe(30);
    expect(d.block).toBe(30);
  });
  it("effective stats are at least 1 and integers", () => {
    fc.assert(fc.property(fc.double({ min: 15, max: 80, noNaN: true }), fc.integer({ min: 1, max: 150 }), (age, v) => {
      const e = effectiveStats(baseStats(v), age);
      for (const s of STATS) {
        expect(e[s]).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(e[s])).toBe(true);
      }
    }));
  });
});
