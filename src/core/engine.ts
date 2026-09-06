import { resolveTurn, startCombat, weaponOf, type CombatAction } from "./combat.js";
import { computeEstate, isHeldPlace, type Estate } from "./estate.js";
import { dayKey, generateFloor, CITY_FLOOR } from "./floor.js";
import { seeded, type Rng } from "./rng.js";
import {
  ageAt, derived, effectiveStats, growthRate, isStat, baseStats,
  MAX_AGE, MIN_START_AGE, MAX_START_AGE, RETIREMENT_AGE,
} from "./stats.js";
import { STARTING_KIT } from "./content/ruins.js";
import type {
  Character, Choice, DeathRecord, ErrandKind, FloorGraph, GameEvent, Item, Request, Response, Room, StateSnapshot,
} from "./types.js";
import { TREASURE_ITEMS } from "./content/ruins.js";
import { FOCUS_COST, bonus, difficulty, sanitize, type Proposal } from "./defy.js";
import { difficultyLevel } from "./floor.js";

export const ERRANDS: Record<ErrandKind, { label: string; hours: number; cost: number; where: "rest" | "inn" | "any_safe" }> = {
  forage: { label: "Forage", hours: 2, cost: 0, where: "any_safe" },
  scout: { label: "Scout the halls", hours: 4, cost: 0, where: "any_safe" },
  vigil: { label: "Keep vigil", hours: 8, cost: 0, where: "any_safe" },
  lodge: { label: "Lodge for the night", hours: 6, cost: 5, where: "inn" },
};
const HOUR_MS = 3_600_000;

export const BETA_TOP_FLOOR = 10;
export const STARTING_SHARDS = 30;

export type SideEffect =
  | { type: "corpse"; floor: number; roomId: string; item: Item; characterId: string; characterName: string; epitaph: string }
  | { type: "hall"; characterId: string; record: DeathRecord; name: string; ending: "death" | "retirement" }
  | { type: "heir_claim"; token: string; label: string; shards: number; item: Item | null; fromName: string; fromCharacterId: string }
  | { type: "heir_transfer"; toCharacterId: string; shards: number; item: Item | null; fromName: string }
  | { type: "achievement"; key: string; characterId: string; data: Record<string, unknown> };

export interface StepResult {
  character: Character;
  response: Response;
  effects: SideEffect[];
}

export function newCharacter(id: string, playerId: string, name: string, startingAge: number, now: number): Character {
  if (!Number.isInteger(startingAge) || startingAge < MIN_START_AGE || startingAge > MAX_START_AGE) {
    throw new Error(`starting age must be an integer between ${MIN_START_AGE} and ${MAX_START_AGE}`);
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 24) throw new Error("name must be 2 to 24 characters");
  const base = baseStats(10);
  const d = derived(effectiveStats(base, startingAge));
  return {
    id, playerId, name: trimmed, bornAt: now, startingAge, base, level: 1, xp: 0, unspent: 0,
    hp: d.maxHp, focus: d.focusPool, shards: STARTING_SHARDS,
    inventory: STARTING_KIT.map((i) => ({ ...i })), heirloomId: null, heir: null,
    floor: 1, roomId: null, runDay: null, cleared: [], combat: null, kills: 0, ascents: [], revealed: [], errand: null,
    status: "alive", death: null,
  };
}

export function xpToLevel(level: number): number {
  return level * 20;
}

export function snapshot(c: Character, now: number): StateSnapshot {
  const age = ageAt(c.startingAge, c.bornAt, now);
  const d = derived(effectiveStats(c.base, age));
  return { name: c.name, age: Math.floor(age), floor: c.floor, hp: c.hp, maxHp: d.maxHp, focus: c.focus, shards: c.shards, status: c.status };
}

/* ------------------------------------------------------------------ helpers */

class Ctx {
  readonly graph: FloorGraph;
  readonly age: number;
  readonly stats;
  readonly d;
  text: string[] = [];
  choices: Choice[] = [];
  events: GameEvent[] = [];
  effects: SideEffect[] = [];
  constructor(public c: Character, public now: number, public rng: Rng) {
    this.age = ageAt(c.startingAge, c.bornAt, now);
    this.stats = effectiveStats(c.base, this.age);
    this.d = derived(this.stats);
    this.graph = generateFloor(c.floor, dayKey(now));
  }
  room(): Room {
    return this.graph.rooms[this.c.roomId ?? this.graph.entrance]!;
  }
  cleared(id: string): boolean {
    return this.c.cleared.includes(id);
  }
  get kind() {
    return this.graph.kind;
  }
  revealed(id: string): boolean {
    return this.c.revealed.includes(id);
  }
  /** exits the character can see from a room */
  visibleExits(r: Room): string[] {
    return r.exits.filter((e) => !this.graph.rooms[e]?.hidden || this.revealed(e));
  }
  markCleared(id: string): void {
    if (!this.cleared(id)) this.c = { ...this.c, cleared: [...this.c.cleared, id] };
  }
  say(s: string): void {
    this.text.push(s);
  }
  done(): StepResult {
    return {
      character: this.c,
      response: { text: this.text.join("\n\n"), choices: this.choices, events: this.events, state: snapshot(this.c, this.now) },
      effects: this.effects,
    };
  }
}

function epitaphFor(c: Character, cause: string, age: number): string {
  return `Here lies ${c.name}, aged ${Math.floor(age)}, ${cause} on floor ${c.floor}.`;
}

function applyEstate(x: Ctx, estate: Estate, ending: "death" | "retirement", record: DeathRecord): void {
  const c = x.c;
  if (estate.itemDropped) {
    x.effects.push({ type: "corpse", floor: c.floor, roomId: c.roomId ?? x.graph.entrance, item: estate.itemDropped, characterId: c.id, characterName: c.name, epitaph: record.epitaph });
    x.events.push({ type: "corpse", data: { floor: c.floor, item: estate.itemDropped.name } });
  }
  if (c.heir && estate.hasHeir) {
    if (c.heir.kind === "blood") {
      x.effects.push({ type: "heir_transfer", toCharacterId: c.heir.characterId, shards: estate.shardsToHeir, item: estate.itemToHeir, fromName: c.name });
    } else {
      x.effects.push({ type: "heir_claim", token: c.heir.claimToken, label: c.heir.label, shards: estate.shardsToHeir, item: estate.itemToHeir, fromName: c.name, fromCharacterId: c.id });
      x.events.push({ type: "heir_claim", data: { token: c.heir.claimToken, label: c.heir.label } });
    }
  }
  x.events.push({ type: "estate", data: { shardsToHeir: estate.shardsToHeir, shardsBurned: estate.shardsBurned, hasHeir: estate.hasHeir, itemPassed: estate.itemToHeir?.name ?? null, itemDropped: estate.itemDropped?.name ?? null } });
  x.effects.push({ type: "hall", characterId: c.id, record, name: c.name, ending });
}

function die(x: Ctx, cause: string): StepResult {
  if (x.kind === "trial" && cause !== "of old age") return trialRescue(x, cause);
  const record: DeathRecord = { at: x.now, cause, floor: x.c.floor, age: x.age, epitaph: epitaphFor(x.c, cause, x.age) };
  const estate = computeEstate(x.c, "death", isHeldPlace(x.c.floor));
  x.c = { ...x.c, hp: 0, status: "dead", death: record, combat: null, shards: 0, inventory: [] };
  applyEstate(x, estate, "death", record);
  x.events.push({ type: "death", data: { cause, floor: record.floor, age: Math.floor(x.age), epitaph: record.epitaph } });
  x.say(record.epitaph);
  if (estate.hasHeir) x.say(`Your heir receives ${estate.shardsToHeir} shards${estate.itemToHeir ? ` and ${estate.itemToHeir.name}` : ""}.`);
  else x.say("You died unprepared. Your estate is lost.");
  if (estate.itemDropped) x.say(`${estate.itemDropped.name} lies where you fell, for whoever comes next.`);
  x.choices = [];
  return x.done();
}

/** The trial floor cannot kill you. You are dragged back to the stair, bruised and intact. */
function trialRescue(x: Ctx, cause: string): StepResult {
  x.c = { ...x.c, hp: Math.max(1, Math.floor(x.d.maxHp / 2)), combat: null, roomId: x.graph.entrance };
  x.say(`You would have been ${cause}. But this is the trial, and the tower is not done with you yet. You wake at the stair, aching, whole.`);
  x.choices = roomChoices(x);
  return x.done();
}

function retire(x: Ctx, epitaph: string | undefined): StepResult {
  if (x.age < RETIREMENT_AGE) {
    x.say(`You are ${Math.floor(x.age)}. Retirement is for those of ${RETIREMENT_AGE} and more.`);
    return look(x);
  }
  if (!isHeldPlace(x.c.floor)) {
    x.say("You cannot retire in the wild. Return to a held place.");
    return look(x);
  }
  const text = epitaph?.trim() || `${x.c.name} retired at ${Math.floor(x.age)}, having climbed to floor ${Math.max(x.c.floor, ...x.c.ascents, 0)}.`;
  const record: DeathRecord = { at: x.now, cause: "retired", floor: x.c.floor, age: x.age, epitaph: text.slice(0, 200) };
  const estate = computeEstate(x.c, "retirement", true);
  x.c = { ...x.c, status: "retired", death: record, combat: null, shards: 0, inventory: [] };
  applyEstate(x, estate, "retirement", record);
  x.events.push({ type: "retirement", data: { age: Math.floor(x.age), epitaph: record.epitaph } });
  x.say(record.epitaph);
  x.say(estate.hasHeir ? `Your heir receives ${estate.shardsToHeir} shards${estate.itemToHeir ? ` and ${estate.itemToHeir.name}` : ""}.` : "You retired with no heir. Your estate is lost.");
  x.choices = [];
  return x.done();
}

function grantXp(x: Ctx, xp: number): void {
  let c = { ...x.c, xp: x.c.xp + Math.round(xp * growthRate(x.age)) };
  while (c.xp >= xpToLevel(c.level)) {
    c = { ...c, xp: c.xp - xpToLevel(c.level), level: c.level + 1, unspent: c.unspent + 3 };
    x.events.push({ type: "levelup", data: { level: c.level } });
    x.say(`You are stronger for it. Level ${c.level}. You have ${c.unspent} points to train.`);
  }
  x.c = c;
}

/* ------------------------------------------------------------------ verbs */

function describeRoom(x: Ctx): void {
  const r = x.room();
  x.say(`*${r.title}* (floor ${x.c.floor}, ${x.graph.biome})`);
  x.say(r.prose);
  if (r.type === "treasure" && !x.cleared(r.id)) x.say("There is something here worth taking.");
  if (r.type === "rest" && !x.cleared(r.id)) x.say("You could rest here.");
  if (r.stair) {
    if (x.c.floor >= BETA_TOP_FLOOR) x.say("The stair beyond is sealed. The tower continues above, and the stars are further than you thought.");
    else if (r.type !== "boss" || x.cleared(r.id)) x.say("The stair up is open.");
    if (x.c.floor === CITY_FLOOR && !x.c.heir) x.say("Climbers name an heir before this gate. Above it, what you carry passes to them or to no one: /heir <name>, or /heir @someone not yet in the tower. Choose what outlives you with /heirloom.");
  }
}

function roomChoices(x: Ctx): Choice[] {
  const r = x.room();
  const out: Choice[] = [];
  for (const e of x.visibleExits(r)) out.push({ label: `Go: ${x.graph.rooms[e]!.title}`, verb: "move", args: { to: e } });
  if (r.type === "treasure" && !x.cleared(r.id)) out.push({ label: "Take", verb: "take" });
  if (r.type === "rest" && !x.cleared(r.id)) out.push({ label: "Rest", verb: "rest" });
  if (r.stair && x.c.floor < BETA_TOP_FLOOR && (r.type !== "boss" || x.cleared(r.id))) out.push({ label: "Climb", verb: "climb" });
  out.push(...errandChoices(x));
  out.push({ label: "Defy fate", verb: "defy_prompt" }, { label: "Examine", verb: "examine" }, { label: "Status", verb: "status" });
  return out;
}

function look(x: Ctx): StepResult {
  if (x.c.combat) return combatPrompt(x);
  describeRoom(x);
  x.choices = roomChoices(x);
  return x.done();
}

function combatPrompt(x: Ctx): StepResult {
  const s = x.c.combat!;
  x.say(`${s.enemy.name} (${s.enemy.hp}/${s.enemy.maxHp}). You: ${x.c.hp}/${x.d.maxHp}.`);
  x.choices = [{ label: "Attack", verb: "attack" }, { label: "Defend", verb: "defend" }];
  for (const it of x.c.inventory) if (it.kind === "consumable") x.choices.push({ label: `Use ${it.name}`, verb: "use", args: { item: it.id } });
  x.choices.push({ label: "Defy fate", verb: "defy_prompt" }, { label: "Flee", verb: "flee" });
  return x.done();
}

function enter(x: Ctx, id: string, from: string | null): StepResult {
  x.c = { ...x.c, roomId: id };
  const r = x.room();
  describeRoom(x);
  if (r.type === "trap" && !x.cleared(r.id)) {
    const roll = x.rng.int(1, 20) + Math.floor(x.stats.perception / 2);
    if (roll >= (r.trapDc ?? 99)) {
      x.say("You see it before it sees you, and step around it.");
    } else {
      const dmg = r.trapDamage ?? 0;
      x.c = { ...x.c, hp: Math.max(0, x.c.hp - dmg) };
      x.say(`The floor gives. You take ${dmg}.`);
      if (x.c.hp <= 0) return die(x, "killed by a trap");
    }
    x.markCleared(r.id);
  }
  if ((r.type === "combat" || r.type === "boss") && !x.cleared(r.id) && r.enemy) {
    x.c = { ...x.c, combat: startCombat(r.enemy) };
    x.say(x.c.combat!.log[0]!);
    (x as Ctx & { fleeTo?: string | null }).fleeTo = from;
    return combatPrompt(x);
  }
  x.choices = roomChoices(x);
  return x.done();
}

function move(x: Ctx, to: string | undefined): StepResult {
  const r = x.room();
  if (!to || !x.visibleExits(r).includes(to)) {
    x.say("There is no way there from here.");
    return look(x);
  }
  return enter(x, to, r.id);
}

function combat(x: Ctx, action: CombatAction): StepResult {
  const s = x.c.combat!;
  const r = x.room();
  const res = resolveTurn(x.c, x.stats, x.d, s, action, x.rng);
  x.c = { ...res.character, combat: res.combat };
  for (const l of res.lines) x.say(l);
  switch (res.outcome) {
    case "ongoing":
      return combatPrompt(x);
    case "died":
      return die(x, `slain by ${s.enemy.name}`);
    case "fled": {
      const back = r.exits[0] ?? x.graph.entrance;
      x.c = { ...x.c, combat: null, roomId: back };
      x.say(`You fall back to ${x.graph.rooms[back]!.title}.`);
      x.choices = roomChoices(x);
      return x.done();
    }
    case "won": {
      const e = s.enemy;
      x.c = { ...x.c, combat: null, kills: x.c.kills + 1, shards: x.c.shards + e.shards };
      x.markCleared(r.id);
      x.say(`You take ${e.shards} shards from the remains.`);
      grantXp(x, e.xp);
      if (e.boss && x.kind === "wild" && !x.c.ascents.includes(x.c.floor)) {
        x.c = { ...x.c, ascents: [...x.c.ascents, x.c.floor] };
        x.events.push({ type: "ascent", data: { floor: x.c.floor } });
        x.effects.push({ type: "achievement", key: `ascent:${x.c.floor}`, characterId: x.c.id, data: { floor: x.c.floor, at: x.now } });
        x.say(x.c.floor >= BETA_TOP_FLOOR ? "The Guardian is down. Beyond it, the stair is sealed. The tower continues above, and the stars are further than you thought." : "The Guardian is down. The stair beyond is open.");
      } else if (e.boss && x.kind !== "wild") {
        x.events.push({ type: "ascent", data: { floor: x.c.floor, secret: true } });
        x.effects.push({ type: "achievement", key: `secret_boss:${x.c.floor}`, characterId: x.c.id, data: { floor: x.c.floor, boss: e.id, at: x.now } });
        x.say(x.kind === "trial" ? "The Warden is down. Nothing on the tower's first floor was meant to fall, and it has. This will be remembered." : "The thing beneath the well is dead. The town above will sleep differently tonight. This will be remembered.");
      }
      x.choices = roomChoices(x);
      return x.done();
    }
  }
}

function examine(x: Ctx): StepResult {
  const r = x.room();
  describeRoom(x);
  const hidden = r.exits.map((e) => x.graph.rooms[e]!).filter((n) => n.hidden && !x.revealed(n.id));
  for (const n of hidden) {
    const roll = x.rng.int(1, 20) + Math.floor(x.stats.perception / 2);
    if (roll >= (n.secretDc ?? 99)) {
      x.c = { ...x.c, revealed: [...x.c.revealed, n.id] };
      x.say(`A draught where there should be none. You find a way through, to ${n.title}.`);
    } else {
      x.say("Something about this place is not as it seems. You cannot say what. Yet.");
    }
  }
  x.choices = roomChoices(x);
  return x.done();
}

function take(x: Ctx): StepResult {
  const r = x.room();
  if (r.type !== "treasure" || x.cleared(r.id)) {
    x.say("There is nothing here to take.");
    return look(x);
  }
  const gained = r.shards ?? 0;
  const inv = r.item ? [...x.c.inventory, { ...r.item }] : x.c.inventory;
  x.c = { ...x.c, shards: x.c.shards + gained, inventory: inv };
  x.markCleared(r.id);
  x.say(`You find ${gained} shards${r.item ? ` and ${r.item.name}` : ""}.`);
  x.choices = roomChoices(x);
  return x.done();
}

function rest(x: Ctx): StepResult {
  const r = x.room();
  if (r.type !== "rest" || x.cleared(r.id)) {
    x.say("This is no place to rest.");
    return look(x);
  }
  const heal = Math.min(Math.floor(x.d.maxHp * 0.3), x.d.maxHp - x.c.hp);
  x.c = { ...x.c, hp: x.c.hp + heal, focus: x.d.focusPool };
  x.markCleared(r.id);
  x.say(`You rest. You recover ${heal} and your focus returns.`);
  x.choices = roomChoices(x);
  return x.done();
}

function climb(x: Ctx): StepResult {
  const r = x.room();
  if (!r.stair || (r.type === "boss" && !x.cleared(r.id))) {
    x.say("The stair is not here, or not yet open.");
    return look(x);
  }
  if (x.c.floor >= BETA_TOP_FLOOR) {
    x.say("The stair is sealed. The tower continues above. More is coming.");
    return look(x);
  }
  x.c = { ...x.c, floor: x.c.floor + 1, roomId: null, cleared: [], combat: null };
  const y = new Ctx(x.c, x.now, x.rng);
  y.events = x.events; y.effects = x.effects; y.text = x.text;
  if (y.c.floor === CITY_FLOOR) y.say("You climb out of the trial and into lamplight. The Landing. A held place: here, what you carry passes to your heir.");
  else if (y.c.floor === CITY_FLOOR + 1) y.say(`You climb past the town wall. Floor ${y.c.floor}. This is the wild: from here on, the tower keeps what it takes.${y.c.heir ? "" : " You have named no heir. If you die up here, everything you are is lost."}`);
  else y.say(`You climb. Floor ${y.c.floor}.`);
  return enter(y, y.graph.entrance, null);
}

function status(x: Ctx): StepResult {
  const s = x.stats;
  const heir = x.c.heir ? (x.c.heir.kind === "blood" ? `blood heir ${x.c.heir.accepted ? "(accepted)" : "(not yet accepted)"}` : `spiritual heir ${x.c.heir.label}`) : "no heir named";
  x.say(`*${x.c.name}*, aged ${Math.floor(x.age)}, level ${x.c.level}. Floor ${x.c.floor} (${x.kind === "trial" ? "trial, nothing here can kill you" : x.kind === "city" ? "the Landing, held" : "wild"}).`);
  x.say(`HP ${x.c.hp}/${x.d.maxHp}. Focus ${x.c.focus}/${x.d.focusPool}. Shards ${x.c.shards}. Kills ${x.c.kills}.`);
  x.say(`Might ${s.might}, Agility ${s.agility}, Grit ${s.grit}, Cunning ${s.cunning}, Focus ${s.focus}, Perception ${s.perception}, Guile ${s.guile}, Presence ${s.presence}.`);
  x.say(`Carrying: ${x.c.inventory.map((i) => i.name + (i.id === x.c.heirloomId ? " (heirloom)" : "")).join(", ") || "nothing"}.`);
  x.say(`Heir: ${heir}.${x.c.unspent ? ` ${x.c.unspent} points to train.` : ""}`);
  x.choices = [];
  if (x.c.unspent > 0) for (const st of ["might", "agility", "grit", "cunning", "focus", "perception", "guile", "presence"] as const) x.choices.push({ label: `Train ${st}`, verb: "train", args: { stat: st } });
  if (x.age >= RETIREMENT_AGE && isHeldPlace(x.c.floor)) x.choices.push({ label: "Retire", verb: "retire" });
  x.choices.push({ label: "Back", verb: "look" });
  return x.done();
}

function train(x: Ctx, stat: string | undefined): StepResult {
  if (!stat || !isStat(stat)) { x.say("Train what?"); return status(x); }
  if (x.c.unspent <= 0) { x.say("You have nothing to train with yet."); return status(x); }
  x.c = { ...x.c, unspent: x.c.unspent - 1, base: { ...x.c.base, [stat]: Math.min(150, x.c.base[stat] + 1) } };
  x.say(`You train your ${stat}.`);
  return status(x);
}

function heirloom(x: Ctx, itemId: string | undefined): StepResult {
  if (!itemId) {
    x.say("Choose the one thing that will outlive you.");
    x.choices = x.c.inventory.filter((i) => i.kind !== "consumable").map((i) => ({ label: i.name, verb: "heirloom", args: { item: i.id } }));
    x.choices.push({ label: "Back", verb: "look" });
    return x.done();
  }
  const it = x.c.inventory.find((i) => i.id === itemId);
  if (!it) { x.say("You do not carry that."); return look(x); }
  x.c = { ...x.c, heirloomId: it.id };
  x.say(`${it.name} is now your heirloom.`);
  return look(x);
}

function setHeir(x: Ctx, args: Record<string, string>): StepResult {
  if (args.kind === "blood" && args.characterId) {
    x.c = { ...x.c, heir: { kind: "blood", characterId: args.characterId, accepted: false } };
    x.events.push({ type: "heir_request", data: { characterId: args.characterId } });
    x.say("You have named your heir. They must accept before your death, or it counts for nothing.");
  } else if (args.kind === "spiritual" && args.label) {
    const token = `${x.rng.int(0, 0xffffff).toString(36)}${x.rng.int(0, 0xffffff).toString(36)}`;
    x.c = { ...x.c, heir: { kind: "spiritual", label: args.label.slice(0, 32), claimToken: token } };
    x.say(`You have named ${args.label} as your spiritual heir. When you die, a claim will be waiting for them.`);
  } else {
    x.say("Name an heir: a character in the tower, or someone not yet in it.");
  }
  return look(x);
}

/* ------------------------------------------------------------------ errands */

function fmtWait(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Where errands can be started: rest rooms anywhere, and any city room. Lodging only at an inn. */
function errandChoices(x: Ctx): Choice[] {
  const r = x.room();
  const safe = r.type === "rest" || x.kind === "city";
  if (!safe) return [];
  const out: Choice[] = [];
  for (const [kind, def] of Object.entries(ERRANDS) as [ErrandKind, (typeof ERRANDS)[ErrandKind]][]) {
    if (def.where === "inn" && !(x.kind === "city" && r.type === "rest")) continue;
    out.push({ label: `${def.label} (${def.hours}h)`, verb: "errand", args: { kind } });
  }
  return out;
}

function startErrand(x: Ctx, kind: string | undefined): StepResult {
  const def = kind && (kind in ERRANDS) ? ERRANDS[kind as ErrandKind] : null;
  if (!def || !errandChoices(x).some((c) => c.args?.kind === kind)) {
    x.say("Not here, or not that.");
    return look(x);
  }
  if (x.c.shards < def.cost) {
    x.say(`That costs ${def.cost} shards. You have ${x.c.shards}.`);
    return look(x);
  }
  const resolvesAt = x.now + def.hours * HOUR_MS;
  x.c = {
    ...x.c,
    shards: x.c.shards - def.cost,
    errand: { kind: kind as ErrandKind, startedAt: x.now, resolvesAt, seed: x.rng.int(1, 0x7fffffff), floor: x.c.floor, roomId: x.c.roomId ?? x.graph.entrance },
  };
  x.events.push({ type: "errand_started", data: { kind, resolvesAt } });
  x.say(`${def.label}. Come back in ${fmtWait(def.hours * HOUR_MS)}. The tower will still be here.`);
  x.choices = [{ label: "Look", verb: "look" }];
  return x.done();
}

function busy(x: Ctx): StepResult {
  const e = x.c.errand!;
  x.say(`You are away: ${ERRANDS[e.kind].label.toLowerCase()}. Back in ${fmtWait(e.resolvesAt - x.now)}.`);
  x.choices = [{ label: "Check", verb: "look" }, { label: "Abandon", verb: "abandon" }];
  return x.done();
}

/** What cutting an errand short pays: foraging in proportion to time spent, everything else nothing. */
export function abandonYield(kind: ErrandKind, elapsedMs: number, totalMs: number, level: number, seed: number): number {
  if (kind !== "forage") return 0;
  const full = 3 + level * 3 + seeded(seed).int(0, 6);
  return Math.floor(full * Math.min(1, Math.max(0, elapsedMs / totalMs)));
}

function abandon(x: Ctx, confirmed: boolean): StepResult {
  const e = x.c.errand!;
  const total = e.resolvesAt - e.startedAt;
  const pay = abandonYield(e.kind, x.now - e.startedAt, total, difficultyLevel(e.floor), e.seed);
  if (!confirmed) {
    x.say(e.kind === "forage"
      ? `Come back now and you keep what you have gathered so far: ${pay} shards' worth. The rest stays out there.`
      : `${ERRANDS[e.kind].label} only counts if you see it through. Come back now and it counts for nothing.`);
    x.choices = [{ label: "Come back now", verb: "abandon", args: { confirm: "1" } }, { label: "Stay", verb: "look" }];
    return x.done();
  }
  x.c = { ...x.c, errand: null, shards: x.c.shards + pay };
  x.events.push({ type: "errand_resolved", data: { kind: e.kind, lines: [], abandoned: true } });
  x.say(pay > 0 ? `You come back early with ${pay} shards' worth of salvage.` : "You come back early, with nothing to show for it.");
  return look(x);
}

/**
 * Settle a finished errand. Deterministic from the errand's seed. Errands can wound in the wild
 * but can never kill: principle 4.
 */
function resolveErrand(x: Ctx): void {
  const e = x.c.errand!;
  const rng = seeded(e.seed);
  const level = difficultyLevel(e.floor);
  const lines: string[] = [];
  let c: Character = { ...x.c, errand: null };
  switch (e.kind) {
    case "forage": {
      const shards = 3 + level * 3 + rng.int(0, 6);
      c = { ...c, shards: c.shards + shards };
      lines.push(`You foraged. ${shards} shards' worth of salvage.`);
      if (rng.chance(0.4)) {
        const it = { ...rng.pick(TREASURE_ITEMS.filter((i) => i.kind === "consumable")) };
        c = { ...c, inventory: [...c.inventory, it] };
        lines.push(`You also found ${it.name}.`);
      }
      if (level > 0 && rng.chance(0.25)) {
        const dmg = Math.min(c.hp - 1, Math.floor(x.d.maxHp * (0.1 + rng.next() * 0.15)));
        if (dmg > 0) { c = { ...c, hp: c.hp - dmg }; lines.push(`Something found you first. You took ${dmg} and got away.`); }
      }
      break;
    }
    case "scout": {
      const g = e.floor === x.c.floor ? x.graph : generateFloor(e.floor, x.graph.day);
      const hidden = Object.values(g.rooms).find((r) => r.hidden && !c.revealed.includes(r.id));
      if (hidden) {
        c = { ...c, revealed: [...c.revealed, hidden.id] };
        lines.push(`You scouted the halls and found what the builders hid: ${hidden.title}.`);
      } else {
        const xp = 8 + level * 4;
        c = { ...c, xp: c.xp + xp };
        lines.push("You scouted the halls. Nothing hidden here that you have not already found, but you know the floor better.");
      }
      break;
    }
    case "vigil": {
      const xp = Math.round((10 + level * 3) * growthRate(x.age));
      c = { ...c, focus: x.d.focusPool, xp: c.xp + xp };
      lines.push("You kept vigil through the dark. Your focus is whole again.");
      if (rng.chance(0.15)) lines.push("Near the end of it you saw something in the stone: a shape climbing, far above, that was not there when you looked again.");
      break;
    }
    case "lodge": {
      c = { ...c, hp: x.d.maxHp, focus: x.d.focusPool };
      lines.push("You slept at the Last Lamp. You wake whole.");
      break;
    }
  }
  x.c = c;
  x.events.push({ type: "errand_resolved", data: { kind: e.kind, lines } });
  x.say(`*While you were away.* ${lines.join(" ")}`);
  grantXp(x, 0);
}

/* ------------------------------------------------------------------ defy fate */

export interface DefyOutcome {
  proposal: Proposal;
  roll: number;
  dc: number;
  success: boolean;
  /** what actually happened, in the engine's words; the model narrates from this */
  result: string;
  focusSpent: number;
}

/**
 * Resolve a Referee proposal. Bounded outcome table per action class. The model proposed;
 * this decides. It can open doors and end fights without killing; it can never kill the
 * character, grant unbounded shards, or change the floor. In combat it is a turn: the enemy
 * still answers unless the outcome removed it.
 */
function defy(x: Ctx, args: Record<string, string>): StepResult {
  if (x.c.focus < FOCUS_COST) {
    x.say(`You reach for something more and find nothing left. Rest, or keep vigil. (Focus ${x.c.focus}/${x.d.focusPool}.)`);
    return x.c.combat ? combatPrompt(x) : look(x);
  }
  let parsed: unknown = null;
  try { parsed = args.proposal ? JSON.parse(args.proposal) : null; } catch { parsed = null; }
  const p = sanitize(parsed, isStat);
  const r = x.room();
  const s = x.c.combat;
  const enemy = s?.enemy ?? null;
  const level = difficultyLevel(x.c.floor);
  const dc = difficulty(p.action_class, p.audacity, level, enemy?.boss ?? false, !!s);
  const roll = x.rng.int(1, 20) + bonus(x.stats, p.governing_stats);
  const success = roll >= dc;
  x.c = { ...x.c, focus: x.c.focus - FOCUS_COST };
  let result = "";
  let enemyGone = false;

  if (success) {
    switch (p.action_class) {
      case "negotiate":
        if (enemy && !enemy.boss) { enemyGone = true; result = `${enemy.name} hears you out and lets you pass. No blood, no spoils.`; }
        else if (enemy) result = `${enemy.name} listens, and for a moment does not strike.`;
        else result = "There is nobody here to bargain with, but you rehearse the words, and they will come easier next time.";
        break;
      case "intimidate":
        if (enemy && !enemy.boss) { enemyGone = true; x.c = { ...x.c, shards: x.c.shards + Math.floor(enemy.shards / 2) }; result = `${enemy.name} breaks and runs, leaving ${Math.floor(enemy.shards / 2)} shards in its haste.`; }
        else if (enemy) result = `${enemy.name} hesitates. You gain a breath.`;
        else result = "You square your shoulders at the empty room. It does not argue.";
        break;
      case "deceive":
        if (enemy) { const dmg = Math.max(2, (weaponOf(x.c)?.damage ?? 2) * 2 + Math.floor(x.stats.might / 4)); s!.enemy.hp = Math.max(0, s!.enemy.hp - dmg); result = `${enemy.name} takes the bait. You strike it for ${dmg} while it looks the wrong way.`; }
        else result = "A good lie needs a listener. You file it away.";
        break;
      case "sneak":
      case "evade":
        if (enemy) { enemyGone = true; result = `You slip past ${enemy.name} and it loses you in the dark. It is still here, for whoever comes next.`; }
        else result = "You move without a sound, and nothing notices.";
        break;
      case "tinker":
        if (enemy) { const dmg = Math.floor(enemy.maxHp * 0.25); s!.enemy.hp = Math.max(0, s!.enemy.hp - dmg); result = `Whatever you rigged, it works. ${enemy.name} takes ${dmg}.`; }
        else result = revealAdjacent(x) ?? "You take the place apart in your head and put it back together. Nothing to use, this time.";
        break;
      case "investigate":
        result = revealAdjacent(x) ?? "You read the room like a page. Nothing hidden here that you have not already found.";
        if (!result.includes("way through")) x.c = { ...x.c, xp: x.c.xp + 5 };
        break;
      case "inspire": {
        const heal = Math.min(Math.floor(x.d.maxHp * 0.15), x.d.maxHp - x.c.hp);
        x.c = { ...x.c, hp: x.c.hp + heal };
        result = heal > 0 ? `You find something in yourself you had not spent. You recover ${heal}.` : "You steady yourself. You were already steady.";
        break;
      }
      case "other":
        x.c = { ...x.c, xp: x.c.xp + 5 + p.audacity * 3 };
        result = "It does not work the way you meant, but it works: you learn something the tower did not intend to teach.";
        break;
    }
  } else {
    result = enemy ? `It does not land. ${enemy.name} is not impressed.` : "Nothing comes of it. The tower keeps its counsel.";
  }

  x.events.push({ type: "defy", data: { proposal: p, roll, dc, success, result, focusSpent: FOCUS_COST } });

  if (s && enemyGone) {
    const back = r.exits[0] ?? x.graph.entrance;
    x.c = { ...x.c, combat: null };
    if (p.action_class === "sneak" || p.action_class === "evade") x.c = { ...x.c, roomId: back };
    else x.markCleared(r.id);
    x.say(result);
    x.choices = roomChoices(x);
    return x.done();
  }
  if (s) {
    x.say(result);
    // the attempt was the turn; the enemy answers (or falls, if the attempt finished it)
    return combat(x, { kind: "pass" });
  }
  x.say(result);
  x.choices = roomChoices(x);
  return x.done();
}

function revealAdjacent(x: Ctx): string | null {
  const r = x.room();
  const hidden = r.exits.map((e) => x.graph.rooms[e]!).find((n) => n.hidden && !x.revealed(n.id));
  if (!hidden) return null;
  x.c = { ...x.c, revealed: [...x.c.revealed, hidden.id] };
  return `A draught where there should be none. You find a way through, to ${hidden.title}.`;
}

/* ------------------------------------------------------------------ step */

export function step(character: Character, req: Request, now: number, rng: Rng): StepResult {
  const x = new Ctx(character, now, rng);
  const args = req.args ?? {};

  if (x.c.status !== "alive") {
    x.say(x.c.death?.epitaph ?? "This life is over.");
    return x.done();
  }
  if (x.age >= MAX_AGE) return die(x, "of old age");

  if (x.c.errand) {
    if (req.verb === "abandon" && x.now < x.c.errand.resolvesAt) {
      return abandon(x, args.confirm === "1");
    } else if (x.now < x.c.errand.resolvesAt) {
      return busy(x);
    } else {
      resolveErrand(x);
    }
  }

  // a new day, or a fresh character: start at the entrance of today's graph
  if (x.c.runDay !== x.graph.day || x.c.roomId === null || !x.graph.rooms[x.c.roomId]) {
    x.c = { ...x.c, runDay: x.graph.day, roomId: x.graph.entrance, cleared: [], combat: null };
    if (character.runDay !== null) x.say("A new day in the tower. The halls have shifted overnight.");
    if (req.verb === "move") return look(x);
  }

  if (x.c.combat) {
    switch (req.verb) {
      case "attack": return combat(x, { kind: "attack" });
      case "defend": return combat(x, { kind: "defend" });
      case "flee": return combat(x, { kind: "flee" });
      case "use": return combat(x, { kind: "use", itemId: args.item ?? "" });
      case "defy": return defy(x, args);
      default:
        x.say("Not now. Something is trying to kill you.");
        return combatPrompt(x);
    }
  }

  switch (req.verb) {
    case "look": return look(x);
    case "move": return move(x, args.to);
    case "examine": return examine(x);
    case "take": return take(x);
    case "rest": return rest(x);
    case "climb": return climb(x);
    case "status": return status(x);
    case "train": return train(x, args.stat);
    case "heirloom": return heirloom(x, args.item);
    case "heir": return setHeir(x, args);
    case "retire": return retire(x, args.epitaph);
    case "errand": return startErrand(x, args.kind);
    case "defy": return defy(x, args);
    default:
      x.say("You consider it, and think better of it.");
      return look(x);
  }
}
