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

export type ErrandKind = "forage" | "scout" | "vigil" | "lodge";
/** Something the character is doing while the player is away. Resolved lazily on the next action. */
export interface Errand {
  kind: ErrandKind;
  startedAt: number;
  resolvesAt: number;
  seed: number;
  floor: number;
  roomId: string;
  /** the adapter's live countdown message, if it posted one */
  countdown?: { chatId: string; messageId: number; lastEditAt: number };
}

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
  /** hidden rooms this character has found, by room id */
  revealed: string[];
  errand: Errand | null;
  status: CharacterStatus;
  death: DeathRecord | null;
}

export type RoomType = "entrance" | "combat" | "treasure" | "trap" | "rest" | "boss" | "stair" | "city";
export type FloorKind = "trial" | "city" | "wild";
export interface Room {
  id: string;
  type: RoomType;
  title: string;
  prose: string;
  exits: string[];
  /** not offered as an exit until the character has revealed it */
  hidden?: boolean;
  /** perception check to reveal, rolled from an adjacent room */
  secretDc?: number;
  /** the stair up is in this room */
  stair?: boolean;
  enemy?: Enemy;
  trapDc?: number;
  trapDamage?: number;
  shards?: number;
  item?: Item;
}
export interface FloorGraph {
  floor: number;
  kind: FloorKind;
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
    | "heir_request"
    | "errand_started"
    | "errand_resolved"
    | "defy"
    | "fight_over";
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

/** Per-room text written by the nightly prose batch, keyed by room id. Replaces the templates. */
export type ProseOverlay = Record<string, { title: string; prose: string }>;
