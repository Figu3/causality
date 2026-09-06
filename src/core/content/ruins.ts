import type { Enemy, Item } from "../types.js";

/** Crumbling Ruins, floors 1 to 4. Prose is templated for step 1; the nightly model batch replaces it later. */
export const BIOME = "Crumbling Ruins";

export const ROOM_TITLES = {
  entrance: ["The Broken Stair", "The Threshold", "The Fallen Arch"],
  combat: ["A Collapsed Gallery", "The Sunken Court", "A Hall of Toppled Pillars", "The Cistern", "The Watch Room"],
  treasure: ["A Sealed Alcove", "The Reliquary", "A Collapsed Vault"],
  trap: ["A Corridor of Loose Flagstones", "The Tilted Hall", "A Passage of Dust and Wire"],
  rest: ["A Dry Chamber", "The Hermit's Nook", "An Old Shrine, Cold"],
  boss: ["The Guardian's Chamber", "The Throne of Rubble"],
} as const;

export const ROOM_PROSE = {
  entrance: [
    "Stone steps climb out of the dark into a hall whose ceiling has long since given way. Roots hang through the gap like hair. Daylight, or something like it, comes from above.",
    "The arch has fallen but the doorway holds. Beyond it the floor is tiled in a pattern nobody living could read, worn smooth by the feet of those who came before you.",
  ],
  combat: [
    "Pillars lie where they fell, and between them something has made a nest of bones and rag. It has heard you.",
    "Water drips into a basin cut from a single stone. Whatever lives here drinks from it, and it is not pleased to share.",
    "The gallery is long and narrow. Halfway down, the shadows move against the direction of the light.",
  ],
  treasure: [
    "A niche in the wall, mortared shut a very long time ago and opened, more recently, by someone in a hurry. They missed something.",
    "Shelves of rotted wood, and under the dust the dull glint of what the builders thought worth hiding.",
  ],
  trap: [
    "The flagstones here sit unevenly, some proud of the floor, some sunk. Whoever laid them was not careless.",
    "The hall tilts, and there is a wire at ankle height that catches the light only when you are almost on it.",
  ],
  rest: [
    "A chamber the damp has not reached. Someone slept here once and left a ring of stones for a fire. It is quiet.",
    "A small shrine to a god without a name. The offering bowl is empty but the air is still, and you can breathe.",
  ],
  boss: [
    "The chamber is vast and something vast waits in it, patient as the stone it was carved from. It rises.",
    "A throne of piled rubble, and on it the thing that has kept every climber before you from the stair beyond.",
  ],
} as const;

/** Weak things for the trial floor, where nothing can kill you. */
export function trialPool(): Enemy[] {
  return [
    { id: "rat", name: "a tomb rat", hp: 10, maxHp: 10, attack: 6, armor: 0, dodge: 10, pursuit: 20, xp: 4, shards: 1, boss: false },
    { id: "husk", name: "a dust husk", hp: 14, maxHp: 14, attack: 8, armor: 0, dodge: 4, pursuit: 6, xp: 6, shards: 2, boss: false },
  ];
}

/**
 * The Warden of the Threshold: the hidden boss of the trial floor. Harder than anything on
 * floor 10, in the one place that cannot kill you. Beating it is a deed.
 */
export const WARDEN: Enemy = { id: "warden", name: "the Warden of the Threshold", hp: 260, maxHp: 260, attack: 52, armor: 5, dodge: 16, pursuit: 40, xp: 400, shards: 200, boss: true };

/** `level` is the wild difficulty index: floor 3 is level 1. */
export function enemyPool(level: number): Enemy[] {
  const f = Math.max(0, level - 1);
  return [
    { id: "rat", name: "a tomb rat", hp: 14 + f * 4, maxHp: 14 + f * 4, attack: 9 + f * 2, armor: 0, dodge: 14, pursuit: 25, xp: 6, shards: 2, boss: false },
    { id: "husk", name: "a dust husk", hp: 20 + f * 5, maxHp: 20 + f * 5, attack: 12 + f * 2, armor: 1, dodge: 6, pursuit: 8, xp: 9, shards: 4, boss: false },
    { id: "spider", name: "a pale spider", hp: 16 + f * 4, maxHp: 16 + f * 4, attack: 11 + f * 2, armor: 0, dodge: 20, pursuit: 30, xp: 8, shards: 3, boss: false },
    { id: "golem", name: "a broken golem", hp: 26 + f * 6, maxHp: 26 + f * 6, attack: 14 + f * 3, armor: 2, dodge: 2, pursuit: 4, xp: 12, shards: 6, boss: false },
  ];
}

export function bossOf(level: number): Enemy {
  const f = Math.max(0, level - 1);
  return { id: "guardian", name: "the Guardian of the Stair", hp: 48 + f * 12, maxHp: 48 + f * 12, attack: 16 + f * 3, armor: 2, dodge: 8, pursuit: 15, xp: 40 + f * 10, shards: 25 + f * 10, boss: true };
}

export const TREASURE_ITEMS: Item[] = [
  { id: "salve", name: "a clay pot of salve", kind: "consumable", heal: 40, value: 8 },
  { id: "bread", name: "hard bread", kind: "consumable", heal: 20, value: 3 },
  { id: "shortsword", name: "a notched shortsword", kind: "weapon", damage: 7, value: 20 },
  { id: "leathers", name: "cracked leathers", kind: "armor", armor: 2, value: 15 },
  { id: "ring", name: "a ring of dull iron", kind: "trinket", value: 12 },
  { id: "idol", name: "a small stone idol", kind: "trinket", value: 30 },
];

export const STARTING_KIT: Item[] = [
  { id: "knife", name: "a climber's knife", kind: "weapon", damage: 4, value: 5 },
  { id: "bread", name: "hard bread", kind: "consumable", heal: 20, value: 3 },
];
