import type { Character, Item } from "./types.js";

export const INHERITANCE_ON_DEATH = 0.1;
export const INHERITANCE_ON_RETIREMENT = 0.25;
/** Floors that are always a held place (the protected band). Groups extend this later. */
export const PROTECTED_FLOORS = 2;

export type Ending = "death" | "retirement";

export interface Estate {
  /** shards that reach the heir; zero when there is no accepted heir */
  shardsToHeir: number;
  shardsBurned: number;
  /** the heirloom, if it passes to the heir */
  itemToHeir: Item | null;
  /** the heirloom, if it drops where the character fell */
  itemDropped: Item | null;
  /** everything else in the inventory is lost */
  itemsLost: Item[];
  hasHeir: boolean;
}

export function isHeldPlace(floor: number): boolean {
  return floor >= 1 && floor <= PROTECTED_FLOORS;
}

export function heirAccepted(c: Character): boolean {
  if (!c.heir) return false;
  return c.heir.kind === "spiritual" ? true : c.heir.accepted;
}

/**
 * The estate rule. Death or retirement in a held place passes the heirloom to the heir; in the
 * wild the heirloom drops on a corpse marker. Shards pass at 10% (death) or 25% (retirement) to
 * an accepted heir, and are burned otherwise. Everything else is burned.
 */
export function computeEstate(c: Character, ending: Ending, held: boolean): Estate {
  const hasHeir = heirAccepted(c);
  const rate = ending === "retirement" ? INHERITANCE_ON_RETIREMENT : INHERITANCE_ON_DEATH;
  const shardsToHeir = hasHeir ? Math.floor(c.shards * rate) : 0;
  const heirloom = c.inventory.find((i) => i.id === c.heirloomId) ?? null;
  const itemToHeir = heirloom && held ? heirloom : null;
  const itemDropped = heirloom && !held ? heirloom : null;
  return {
    shardsToHeir,
    shardsBurned: c.shards - shardsToHeir,
    itemToHeir,
    itemDropped,
    itemsLost: c.inventory.filter((i) => i !== heirloom),
    hasHeir,
  };
}
