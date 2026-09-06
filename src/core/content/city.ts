import type { Enemy, Room } from "../types.js";

/** The Landing: the city on floor 2. A held place. No enemies above ground. */
export const CITY_NAME = "The Landing";

export function cityRooms(): Room[] {
  return [
    { id: "gate", type: "entrance", title: "The Landing Gate", prose: "The stair opens onto a terrace cut into the tower's flank, and beyond it a town has grown in the ruins: lamps, awnings, the smell of bread and rust. Climbers built this. Climbers keep it.", exits: ["square", "inn"] },
    { id: "square", type: "city", title: "The Market Square", prose: "Stalls under torn canvas. Traders here sell what climbers bring down and buy what they need to go back up. Nothing is cheap.", exits: ["gate", "inn", "shrine", "hall", "stair", "well"] },
    { id: "inn", type: "rest", title: "The Last Lamp", prose: "An inn with one long table and rooms above it. The keeper asks no questions, which is the whole of the hospitality.", exits: ["gate", "square"] },
    { id: "shrine", type: "city", title: "The Shrine of the Unnamed", prose: "A small temple to whatever it is that lets some climbers come back and not others. Offerings pile in the bowl. Nobody empties it.", exits: ["square"] },
    { id: "hall", type: "city", title: "The Hall of Heroes", prose: "A long room lined with names. The dead of the tower, cut into the stone in the order they fell. There is room for a great many more.", exits: ["square"] },
    { id: "stair", type: "stair", title: "The Upper Stair", prose: "A gate in the town wall and, beyond it, the stair up into the dark. Above this point the tower keeps what it takes.", exits: ["square"], stair: true },
    { id: "well", type: "boss", title: "Beneath the Well", prose: "A shaft under the square, older than the town, older than the stair. Something has been living at the bottom of it since before anyone climbed.", exits: ["square"], hidden: true, secretDc: 20, enemy: wellThing() },
  ];
}

/** The hidden boss under the city. Lethal, and about as hard as a mid-tower boss. */
export function wellThing(): Enemy {
  return { id: "wellthing", name: "the thing beneath the well", hp: 130, maxHp: 130, attack: 34, armor: 3, dodge: 6, pursuit: 12, xp: 220, shards: 120, boss: true };
}
