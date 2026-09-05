export interface Rng {
  /** uniform in [0, 1) */
  next(): number;
  int(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32, deterministic for a given seed */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (xs) => {
      if (xs.length === 0) throw new Error("pick from empty list");
      return xs[Math.floor(next() * xs.length)] as (typeof xs)[number];
    },
    chance: (p) => next() < p,
  };
}

export function systemRng(): Rng {
  return seeded(hashString(`${Date.now()}:${Math.random()}`));
}
