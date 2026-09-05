import { STATS, type Stat, type Stats } from "./types.js";

export const YEARS_PER_DAY = 0.8;
export const MAX_AGE = 80;
export const RETIREMENT_AGE = 63;
export const MIN_START_AGE = 15;
export const MAX_START_AGE = 45;
export const DAY_MS = 86_400_000;

export type Phase = "youth" | "young_adult" | "prime" | "middle_age" | "elder";

export function ageAt(startingAge: number, bornAt: number, now: number): number {
  const days = Math.max(0, now - bornAt) / DAY_MS;
  return startingAge + days * YEARS_PER_DAY;
}

export function phaseOf(age: number): Phase {
  if (age < 26) return "youth";
  if (age < 36) return "young_adult";
  if (age < 51) return "prime";
  if (age < 63) return "middle_age";
  return "elder";
}

const FIXED: Record<Exclude<Phase, "elder">, Stats> = {
  youth: { might: 0.9, agility: 1.1, grit: 0.95, cunning: 0.85, focus: 0.9, perception: 1.0, guile: 0.8, presence: 0.85 },
  young_adult: { might: 1, agility: 1, grit: 1, cunning: 1, focus: 1, perception: 1, guile: 1, presence: 1 },
  prime: { might: 1.0, agility: 0.98, grit: 1.0, cunning: 1.1, focus: 1.1, perception: 1.0, guile: 1.15, presence: 1.15 },
  middle_age: { might: 0.95, agility: 0.92, grit: 0.97, cunning: 1.15, focus: 1.1, perception: 0.98, guile: 1.2, presence: 1.2 },
};

export function growthRate(age: number): number {
  switch (phaseOf(age)) {
    case "youth": return 1.5;
    case "young_adult": return 1.2;
    case "prime": return 1.0;
    case "middle_age": return 0.8;
    case "elder": return 0.5;
  }
}

/** Age modifiers per primary stat, per the spec's phase table. */
export function ageModifiers(age: number): Stats {
  const phase = phaseOf(age);
  if (phase !== "elder") return { ...FIXED[phase] };
  const a = Math.min(age, MAX_AGE) - 62;
  return {
    might: 0.9 - a * 0.01,
    agility: 0.85 - a * 0.015,
    grit: 0.92 - a * 0.008,
    cunning: 1.2,
    focus: 1.05,
    perception: 0.95 - a * 0.005,
    guile: 1.25,
    presence: 1.25,
  };
}

export function effectiveStats(base: Stats, age: number): Stats {
  const mods = ageModifiers(age);
  const out = {} as Stats;
  for (const s of STATS) out[s] = Math.max(1, Math.round(base[s] * mods[s]));
  return out;
}

export interface Derived {
  maxHp: number;
  stamina: number;
  focusPool: number;
  initiative: number;
  carry: number;
  dodge: number;
  block: number;
  magicResistance: number;
  socialStanding: number;
  craftingSkill: number;
  tradeSkill: number;
}

export function derived(s: Stats): Derived {
  return {
    maxHp: 100 + s.grit * 15 + s.might * 5,
    stamina: 50 + s.grit * 10 + s.agility * 5,
    focusPool: 30 + s.focus * 5 + s.cunning * 2,
    initiative: s.agility * 2 + s.perception,
    carry: 20 + s.might * 3,
    dodge: s.agility * 2 + s.perception,
    block: s.might * 2 + s.grit,
    magicResistance: s.focus * 2 + s.grit,
    socialStanding: s.presence * 2 + s.guile,
    craftingSkill: s.focus * 2 + s.cunning,
    tradeSkill: s.guile * 2 + s.presence,
  };
}

export function baseStats(value = 10): Stats {
  const out = {} as Stats;
  for (const s of STATS) out[s] = value;
  return out;
}

export function isStat(x: string): x is Stat {
  return (STATS as readonly string[]).includes(x);
}
