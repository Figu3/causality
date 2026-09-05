import { hashString, seeded, type Rng } from "./rng.js";
import type { FloorGraph, Room, RoomType } from "./types.js";
import * as ruins from "./content/ruins.js";

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function floorSeed(floor: number, day: string): number {
  return hashString(`causality:floor:${floor}:${day}`);
}

/**
 * Generate the day's room graph for a floor. A spine of rooms from the entrance to the boss,
 * with side rooms hanging off it. Every room is reachable from the entrance, and the boss is
 * reachable from every room. Same floor and day always give the same graph.
 */
export function generateFloor(floor: number, day: string): FloorGraph {
  const seed = floorSeed(floor, day);
  const rng = seeded(seed);
  const spineLen = rng.int(3, 4);
  const branches = rng.int(1, 2);
  const rooms: Record<string, Room> = {};
  const used = new Set<string>();
  const titleFor = (t: RoomType): string => {
    const opts = ruins.ROOM_TITLES[t].filter((x) => !used.has(x));
    const pick = rng.pick(opts.length ? opts : ruins.ROOM_TITLES[t]);
    used.add(pick);
    return pick;
  };
  const make = (id: string, type: RoomType): Room => {
    const room: Room = { id, type, title: titleFor(type), prose: rng.pick(ruins.ROOM_PROSE[type]), exits: [] };
    decorate(room, floor, rng);
    rooms[id] = room;
    return room;
  };
  const link = (a: string, b: string): void => {
    rooms[a]!.exits.push(b);
    rooms[b]!.exits.push(a);
  };

  const entrance = make("r0", "entrance");
  let prev = entrance.id;
  for (let i = 1; i <= spineLen; i++) {
    const type: RoomType = rng.pick(["combat", "combat", "trap", "rest", "treasure"] as const);
    const r = make(`r${i}`, type);
    link(prev, r.id);
    prev = r.id;
  }
  const boss = make(`r${spineLen + 1}`, "boss");
  link(prev, boss.id);

  const spineIds = Object.keys(rooms).filter((id) => id !== boss.id);
  for (let b = 0; b < branches; b++) {
    const type: RoomType = rng.pick(["treasure", "combat", "trap", "rest"] as const);
    const r = make(`b${b}`, type);
    link(rng.pick(spineIds), r.id);
  }
  return { floor, day, seed, biome: ruins.BIOME, rooms, entrance: entrance.id, boss: boss.id };
}

function decorate(room: Room, floor: number, rng: Rng): void {
  switch (room.type) {
    case "combat":
      room.enemy = rng.pick(ruins.enemyPool(floor));
      break;
    case "boss":
      room.enemy = ruins.bossOf(floor);
      break;
    case "trap":
      room.trapDc = 12 + floor * 2 + rng.int(0, 4);
      room.trapDamage = 12 + floor * 6 + rng.int(0, 8);
      break;
    case "treasure":
      room.shards = 5 + floor * 4 + rng.int(0, 10);
      if (rng.chance(0.6)) room.item = { ...rng.pick(ruins.TREASURE_ITEMS) };
      break;
    case "rest":
    case "entrance":
      break;
  }
}

export function reachable(g: FloorGraph, from: string): Set<string> {
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of g.rooms[id]?.exits ?? []) if (!seen.has(e)) { seen.add(e); stack.push(e); }
  }
  return seen;
}
