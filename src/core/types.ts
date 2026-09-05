export const STATS = [
  "might",
  "agility",
  "grit",
  "cunning",
  "focus",
  "perception",
  "guile",
  "presence",
] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;

export type ItemKind = "weapon" | "armor" | "consumable" | "trinket";
export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** flat damage for weapons */
  damage?: number;
  /** flat reduction for armour */
  armor?: number;
  /** hp restored for consumables */
  heal?: number;
  value: number;
}

export type Heir =
  | { kind: "blood"; characterId: string; accepted: boolean }
  | { kind: "spiritual"; label: string; claimToken: string };

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  armor: number;
  dodge: number;
  pursuit: number;
  xp: number;
  shards: number;
  boss: boolean;
}

export interface CombatState {
  enemy: Enemy;
  turn: number;
  defending: boolean;
  log: string[];
}

export type CharacterStatus = "alive" | "dead" | "retired";

export interface DeathRecord {
  at: number;
  cause: string;
  floor: number;
  age: number;
  epitaph: string;
}

export interface Character {
  id: string;
  playerId: string;
  name: string;
  bornAt: number;
  startingAge: number;
  base: Stats;
  level: number;
  xp: number;
  unspent: number;
  hp: number;
  focus: number;
  shards: number;
  inventory: Item[];
  heirloomId: string | null;
  heir: Heir | null;
  floor: number;
  roomId: string | null;
  runDay: string | null;
  cleared: string[];
  combat: CombatState | null;
  kills: number;
  ascents: number[];
  status: CharacterStatus;
  death: DeathRecord | null;
}

export type RoomType = "entrance" | "combat" | "treasure" | "trap" | "rest" | "boss";
export interface Room {
  id: string;
  type: RoomType;
  title: string;
  prose: string;
  exits: string[];
  enemy?: Enemy;
  trapDc?: number;
  trapDamage?: number;
  shards?: number;
  item?: Item;
}
export interface FloorGraph {
  floor: number;
  day: string;
  seed: number;
  biome: string;
  rooms: Record<string, Room>;
  entrance: string;
  boss: string;
}

export interface Choice {
  label: string;
  verb: string;
  args?: Record<string, string>;
}
export interface GameEvent {
  type:
    | "death"
    | "retirement"
    | "ascent"
    | "levelup"
    | "corpse"
    | "heir_claim"
    | "estate"
    | "heir_request";
  data: Record<string, unknown>;
}
export interface StateSnapshot {
  name: string;
  age: number;
  floor: number;
  hp: number;
  maxHp: number;
  focus: number;
  shards: number;
  status: CharacterStatus;
}
export interface Request {
  verb: string;
  args?: Record<string, string>;
}
export interface Response {
  text: string;
  choices: Choice[];
  events: GameEvent[];
  state: StateSnapshot;
}
