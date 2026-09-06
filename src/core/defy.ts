import type { Stat } from "./types.js";

/**
 * The Referee contract. A model reads the player's sentence and returns a proposal in this
 * shape. Code does everything after that: the difficulty, the roll, the bounded outcome. The
 * model never touches state.
 */
export const ACTION_CLASSES = [
  "negotiate",
  "deceive",
  "intimidate",
  "sneak",
  "tinker",
  "inspire",
  "investigate",
  "evade",
  "other",
] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

export interface Proposal {
  action_class: ActionClass;
  governing_stats: Stat[];
  /** 0 = cautious, 3 = reckless. Raises both the difficulty and the payoff. */
  audacity: 0 | 1 | 2 | 3;
  intent: string;
}

export const FOCUS_COST = 10;

/** Base difficulty per class. Social classes are harder than physical improvisation. */
export const BASE_DC: Record<ActionClass, number> = {
  negotiate: 11,
  deceive: 10,
  intimidate: 10,
  sneak: 9,
  tinker: 9,
  inspire: 8,
  investigate: 7,
  evade: 8,
  other: 10,
};

/** Default governing stats when the model gives none or nonsense. */
export const DEFAULT_STATS: Record<ActionClass, [Stat, Stat]> = {
  negotiate: ["presence", "guile"],
  deceive: ["guile", "cunning"],
  intimidate: ["presence", "might"],
  sneak: ["agility", "guile"],
  tinker: ["cunning", "focus"],
  inspire: ["presence", "focus"],
  investigate: ["perception", "cunning"],
  evade: ["agility", "perception"],
  other: ["cunning", "guile"],
};

/**
 * A cautious attempt by a fresh character on floor 3 lands about half the time; audacity 3 on
 * the same floor about a quarter. Bosses add five. Base stats give +3 on a d20.
 */
export function difficulty(cls: ActionClass, audacity: number, level: number, boss: boolean, inCombat: boolean): number {
  return BASE_DC[cls] + audacity * 3 + level + (boss ? 5 : 0) + (inCombat ? 1 : 0);
}

/** Stat bonus: average of the two governing stats over 6, plus a cunning edge. Base 10s give +3. */
export function bonus(stats: Record<Stat, number>, governing: Stat[]): number {
  const g: Stat[] = governing.length ? governing : ["cunning", "guile"];
  const avg = g.reduce((a, s) => a + stats[s], 0) / g.length;
  return Math.floor(avg / 6) + Math.floor(stats.cunning / 20);
}

/** Parse anything model-shaped into a valid proposal. Never throws. */
export function sanitize(raw: unknown, isStat: (x: string) => x is Stat): Proposal {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cls = typeof o.action_class === "string" && (ACTION_CLASSES as readonly string[]).includes(o.action_class) ? (o.action_class as ActionClass) : "other";
  const statsIn = Array.isArray(o.governing_stats) ? o.governing_stats.filter((x): x is string => typeof x === "string").filter(isStat).slice(0, 2) : [];
  const stats: Stat[] = statsIn.length ? statsIn : [...DEFAULT_STATS[cls]];
  const a = typeof o.audacity === "number" && Number.isFinite(o.audacity) ? Math.min(3, Math.max(0, Math.round(o.audacity))) : 1;
  const intent = typeof o.intent === "string" ? o.intent.slice(0, 140) : "";
  return { action_class: cls, governing_stats: stats, audacity: a as 0 | 1 | 2 | 3, intent };
}
