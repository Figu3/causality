import type { Rng } from "./rng.js";
import type { Character, CombatState, Enemy, Item, Stats } from "./types.js";
import type { Derived } from "./stats.js";

export type CombatAction =
  | { kind: "attack" }
  | { kind: "defend" }
  | { kind: "use"; itemId: string }
  | { kind: "flee" }
  /** the player's turn was spent elsewhere (a Defy fate attempt); the enemy still answers */
  | { kind: "pass" };

export type CombatOutcome = "ongoing" | "won" | "fled" | "died";

export interface CombatResult {
  character: Character;
  combat: CombatState;
  outcome: CombatOutcome;
  lines: string[];
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function weaponOf(c: Character): Item | null {
  let best: Item | null = null;
  for (const it of c.inventory) if (it.kind === "weapon" && (best === null || (it.damage ?? 0) > (best.damage ?? 0))) best = it;
  return best;
}
export function armorOf(c: Character): number {
  let total = 0;
  for (const it of c.inventory) if (it.kind === "armor") total += it.armor ?? 0;
  return total;
}

export function startCombat(enemy: Enemy): CombatState {
  return { enemy: { ...enemy }, turn: 0, defending: false, log: [`${enemy.name} bars the way.`] };
}

export function hitChance(perception: number, enemyDodge: number): number {
  return clamp(0.55 + (perception - enemyDodge) / 100, 0.2, 0.95);
}
export function enemyHitChance(dodge: number, defending: boolean): number {
  return clamp(0.6 - dodge / 200 - (defending ? 0.15 : 0), 0.1, 0.9);
}
export function fleeChance(initiative: number, pursuit: number): number {
  return clamp(0.4 + (initiative - pursuit) / 100, 0.1, 0.9);
}

function playerDamage(stats: Stats, weapon: Item | null, crit: boolean, armor: number): number {
  const base = (weapon?.damage ?? 2) + Math.floor(stats.might / 4);
  const raw = crit ? base * 2 : base;
  return Math.max(1, raw - armor);
}

function enemyStrike(c: Character, s: CombatState, d: Derived, rng: Rng, lines: string[]): Character {
  const e = s.enemy;
  if (!rng.chance(enemyHitChance(d.dodge, s.defending))) {
    lines.push(`${e.name} strikes and misses.`);
    return c;
  }
  let dmg = Math.max(1, e.attack - armorOf(c));
  if (s.defending) dmg = Math.max(1, Math.floor(dmg / 2));
  lines.push(`${e.name} hits you for ${dmg}.`);
  return { ...c, hp: Math.max(0, c.hp - dmg) };
}

/**
 * Resolve one player decision plus the enemy's reply. Pure: same inputs and rng give the same
 * result. The character's hp is the only character field that changes here; xp, shards and
 * kills are awarded by the caller on "won".
 */
export function resolveTurn(
  character: Character,
  stats: Stats,
  d: Derived,
  state: CombatState,
  action: CombatAction,
  rng: Rng,
): CombatResult {
  let c = character;
  const s: CombatState = { ...state, enemy: { ...state.enemy }, defending: false, turn: state.turn + 1, log: [...state.log] };
  const lines: string[] = [];

  switch (action.kind) {
    case "attack": {
      if (rng.chance(hitChance(stats.perception, s.enemy.dodge))) {
        const crit = rng.chance(clamp(stats.cunning / 200, 0, 0.5));
        const dmg = playerDamage(stats, weaponOf(c), crit, s.enemy.armor);
        s.enemy.hp = Math.max(0, s.enemy.hp - dmg);
        lines.push(crit ? `A clean opening. You strike ${s.enemy.name} for ${dmg}.` : `You strike ${s.enemy.name} for ${dmg}.`);
      } else lines.push(`You swing at ${s.enemy.name} and miss.`);
      break;
    }
    case "defend":
      s.defending = true;
      lines.push("You raise your guard.");
      break;
    case "use": {
      const idx = c.inventory.findIndex((i) => i.id === action.itemId && i.kind === "consumable");
      const it = idx >= 0 ? c.inventory[idx] : undefined;
      if (!it) {
        lines.push("You fumble for something that isn't there.");
        break;
      }
      const heal = Math.min(it.heal ?? 0, d.maxHp - c.hp);
      c = { ...c, hp: c.hp + heal, inventory: c.inventory.filter((_, i) => i !== idx) };
      lines.push(`You use ${it.name} and recover ${heal}.`);
      break;
    }
    case "pass":
      break;
    case "flee": {
      if (rng.chance(fleeChance(d.initiative, s.enemy.pursuit))) {
        lines.push(`You break away from ${s.enemy.name}.`);
        s.log.push(...lines);
        return { character: c, combat: s, outcome: "fled", lines };
      }
      lines.push(`${s.enemy.name} cuts off your escape.`);
      break;
    }
  }

  if (s.enemy.hp <= 0) {
    lines.push(`${s.enemy.name} falls.`);
    s.log.push(...lines);
    return { character: c, combat: s, outcome: "won", lines };
  }

  c = enemyStrike(c, s, d, rng, lines);
  s.log.push(...lines);
  if (c.hp <= 0) return { character: c, combat: s, outcome: "died", lines };
  return { character: c, combat: s, outcome: "ongoing", lines };
}
