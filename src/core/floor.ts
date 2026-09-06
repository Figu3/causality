import { hashString, seeded, type Rng } from "./rng.js";
import type { FloorGraph, FloorKind, Room, RoomType } from "./types.js";
import * as ruins from "./content/ruins.js";
import * as city from "./content/city.js";

export const TRIAL_FLOOR = 1;
export const CITY_FLOOR = 2;
export const FIRST_WILD_FLOOR = 3;

export function floorKind(floor: number): FloorKind {
  if (floor === TRIAL_FLOOR) return "trial";
  if (floor === CITY_FLOOR) return "city";
  return "wild";
}

/** Wild difficulty index: floor 3 is level 1. Trial and city are level 0. */
export function difficultyLevel(floor: number): number {
  return Math.max(0, floor - CITY_FLOOR);
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function floorSeed(floor: number, day: string): number {
  return hashString(`causality:floor:${floor}:${day}`);
}

/**
 * Generate the day's room graph for a floor.
 *
 * - Floor 1, the trial: a short spine of weak rooms ending at the stair, plus a hidden room
 *   holding the Warden, harder than anything on floor 10.
 * - Floor 2, the city: fixed rooms, no enemies above ground, a hidden boss beneath the well.
 * - Floors 3 and up, the wild: a spine to the boss, whose room holds the stair, plus branches.
 *
 * Every visible room is reachable from the entrance without passing a hidden room. Same floor
 * and day always give the same graph.
 */
export function generateFloor(floor: number, day: string): FloorGraph {
  const kind = floorKind(floor);
  const seed = floorSeed(floor, day);
  if (kind === "city") {
    const rooms: Record<string, Room> = {};
    for (const r of city.cityRooms()) rooms[r.id] = { ...r, exits: [...r.exits] };
    return { floor, kind, day, seed, biome: city.CITY_NAME, rooms, entrance: "gate", boss: "well" };
  }
  const rng = seeded(seed);
  const rooms: Record<string, Room> = {};
  const used = new Set<string>();
  const titleFor = (t: RoomType): string => {
    const key = t === "stair" || t === "city" ? "entrance" : t;
    const opts = ruins.ROOM_TITLES[key].filter((x) => !used.has(x));
    const pick = rng.pick(opts.length ? opts : ruins.ROOM_TITLES[key]);
    used.add(pick);
    return pick;
  };
  const make = (id: string, type: RoomType): Room => {
    const proseKey = type === "stair" || type === "city" ? "entrance" : type;
    const room: Room = { id, type, title: titleFor(type), prose: rng.pick(ruins.ROOM_PROSE[proseKey]), exits: [] };
    decorate(room, floor, kind, rng);
    rooms[id] = room;
    return room;
  };
  const link = (a: string, b: string): void => {
    rooms[a]!.exits.push(b);
    rooms[b]!.exits.push(a);
  };

  const entrance = make("r0", "entrance");
  let prev = entrance.id;
  const spineLen = kind === "trial" ? 3 : rng.int(3, 4);
  for (let i = 1; i <= spineLen; i++) {
    const type: RoomType = kind === "trial"
      ? (["combat", "treasure", "rest"] as const)[i - 1]!
      : rng.pick(["combat", "combat", "trap", "rest", "treasure"] as const);
    const r = make(`r${i}`, type);
    link(prev, r.id);
    prev = r.id;
  }

  let bossId: string;
  if (kind === "trial") {
    const stair = make(`r${spineLen + 1}`, "stair");
    stair.title = "The Stair to the Landing";
    stair.prose = "The trial ends at a stair, wide and worn, climbing toward lamplight. Whatever you are, you are allowed up.";
    stair.stair = true;
    link(prev, stair.id);
    const warden = make("h0", "boss");
    warden.title = "The Warden's Vault";
    warden.prose = "Behind the wall, a vault the builders sealed and never meant to be found. The thing they sealed it against is still here, and it has been waiting a long time for someone worth the trouble.";
    warden.hidden = true;
    warden.secretDc = 18;
    warden.enemy = { ...ruins.WARDEN };
    const spineIds = Object.keys(rooms).filter((id) => id !== warden.id && id !== stair.id);
    link(rng.pick(spineIds), warden.id);
    bossId = warden.id;
  } else {
    const boss = make(`r${spineLen + 1}`, "boss");
    boss.stair = true;
    link(prev, boss.id);
    bossId = boss.id;
    const spineIds = Object.keys(rooms).filter((id) => id !== boss.id);
    const branches = rng.int(1, 2);
    for (let b = 0; b < branches; b++) {
      const type: RoomType = rng.pick(["treasure", "combat", "trap", "rest"] as const);
      const r = make(`b${b}`, type);
      link(rng.pick(spineIds), r.id);
    }
  }
  return { floor, kind, day, seed, biome: ruins.BIOME, rooms, entrance: entrance.id, boss: bossId };
}

function decorate(room: Room, floor: number, kind: FloorKind, rng: Rng): void {
  const level = difficultyLevel(floor);
  switch (room.type) {
    case "combat":
      room.enemy = kind === "trial" ? rng.pick(ruins.trialPool()) : rng.pick(ruins.enemyPool(level));
      break;
    case "boss":
      room.enemy = ruins.bossOf(level);
      break;
    case "trap":
      room.trapDc = 12 + level * 2 + rng.int(0, 4);
      room.trapDamage = 12 + level * 6 + rng.int(0, 8);
      break;
    case "treasure":
      room.shards = 5 + level * 4 + rng.int(0, 10);
      if (rng.chance(0.6)) room.item = { ...rng.pick(ruins.TREASURE_ITEMS) };
      break;
    case "rest":
    case "entrance":
    case "stair":
    case "city":
      break;
  }
}

/** Rooms reachable from `from`. Hidden rooms are crossed only if listed in `revealed`. */
export function reachable(g: FloorGraph, from: string, revealed: ReadonlySet<string> = new Set()): Set<string> {
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of g.rooms[id]?.exits ?? []) {
      const r = g.rooms[e];
      if (!r || seen.has(e)) continue;
      if (r.hidden && !revealed.has(e)) continue;
      seen.add(e);
      stack.push(e);
    }
  }
  return seen;
}

export function stairRoom(g: FloorGraph): Room {
  return Object.values(g.rooms).find((r) => r.stair)!;
}
