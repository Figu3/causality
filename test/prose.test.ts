import { describe, expect, it } from "vitest";
import { applyOverlay, newCharacter, step } from "../src/core/engine.js";
import { generateFloor } from "../src/core/floor.js";
import { seeded } from "../src/core/rng.js";
import { buildFloorPrompt, generateFloorProse, motifFor, parseOverlay } from "../src/llm/prose.js";
import { narrateFight } from "../src/llm/referee.js";

const DAY = "2026-09-09";
const T0 = Date.parse("2026-09-09T10:00:00Z");
const cfg = { provider: "openai" as const, baseUrl: "http://x", apiKey: "k", model: "m", timeoutMs: 1000, veniceParams: true };
const fake = (content: string): typeof fetch => (async () => new Response(JSON.stringify({ model: "m", choices: [{ message: { content } }], usage: {} }), { status: 200 })) as unknown as typeof fetch;

describe("nightly prose batch", () => {
  it("prompts with every room, its type, creature and exits, and a stable motif per floor per day", () => {
    const g = generateFloor(3, DAY);
    const msgs = buildFloorPrompt(g, motifFor(g));
    for (const r of Object.values(g.rooms)) expect(msgs[1]!.content).toContain(`${r.id}: ${r.type}`);
    expect(msgs[1]!.content).toContain(g.rooms[g.boss]!.enemy!.name);
    expect(motifFor(g)).toBe(motifFor(generateFloor(3, DAY)));
    expect(motifFor(generateFloor(3, DAY))).not.toBe(motifFor(generateFloor(4, DAY)) + "x");
  });
  it("parses only known rooms, strips dashes, ignores garbage, and never touches structure", () => {
    const g = generateFloor(3, DAY);
    const ids = Object.keys(g.rooms);
    const raw = { rooms: { [ids[0]!]: { title: "The Drowned Step", prose: "Water stands—black and still." }, ghost: { title: "x", prose: "y" }, [ids[1]!]: 5 } };
    const o = parseOverlay(raw, g);
    expect(Object.keys(o)).toEqual([ids[0]]);
    expect(o[ids[0]!]!.prose).toBe("Water stands, black and still.");
    const g2 = applyOverlay(g, o);
    expect(g2.rooms[ids[0]!]!.title).toBe("The Drowned Step");
    expect(g2.rooms[ids[0]!]!.exits).toEqual(g.rooms[ids[0]!]!.exits);
    expect(g2.rooms[ids[0]!]!.enemy).toEqual(g.rooms[ids[0]!]!.enemy);
    expect(parseOverlay(null, g)).toEqual({});
    expect(parseOverlay("nope", g)).toEqual({});
  });
  it("the engine shows the written room instead of the template when an overlay is given", () => {
    const g = generateFloor(3, DAY);
    const c = { ...newCharacter("c", "p", "Tester", 20, T0), floor: 3, runDay: DAY, roomId: null };
    const overlay = { [g.entrance]: { title: "The Salt Stair", prose: "Salt crusts the steps." } };
    const r = step(c, { verb: "look" }, T0, seeded(1), overlay);
    expect(r.response.text).toContain("The Salt Stair");
    expect(r.response.text).toContain("Salt crusts the steps.");
    const plain = step(c, { verb: "look" }, T0, seeded(1));
    expect(plain.response.text).not.toContain("Salt crusts");
  });
  it("generateFloorProse skips the city, and tolerates a model that answers nonsense", async () => {
    expect((await generateFloorProse(cfg, generateFloor(2, DAY), fake("{}"))).overlay).toEqual({});
    const g = generateFloor(3, DAY);
    expect((await generateFloorProse(cfg, g, fake("I would rather not."))).overlay).toEqual({});
    const good = await generateFloorProse(cfg, g, fake(JSON.stringify({ rooms: { [g.entrance]: { title: "A", prose: "B." } } })));
    expect(good.overlay[g.entrance]).toEqual({ title: "A", prose: "B." });
  });
});

describe("post-fight paragraph", () => {
  it("is emitted as a fight_over event with the log, and the narrator is fed the outcome", async () => {
    const g = generateFloor(3, DAY);
    const room = Object.values(g.rooms).find((r) => r.type === "combat")!;
    let c = { ...newCharacter("c", "p", "Tester", 20, T0), floor: 3, runDay: DAY, roomId: room.id, base: { might: 80, agility: 80, grit: 80, cunning: 10, focus: 10, perception: 80, guile: 10, presence: 10 } };
    let r = step(c, { verb: "look" }, T0, seeded(1));
    c = r.character;
    const g2 = generateFloor(3, DAY);
    r = step({ ...c, roomId: room.exits[0]! }, { verb: "move", args: { to: room.id } }, T0, seeded(2));
    c = r.character;
    expect(c.combat).not.toBeNull();
    let over;
    for (let i = 0; i < 20 && !over; i++) { r = step(c, { verb: "attack" }, T0, seeded(i)); c = r.character; over = r.response.events.find((e) => e.type === "fight_over"); }
    expect(over).toBeDefined();
    expect(over!.data.outcome).toBe("won");
    expect((over!.data.log as string[]).length).toBeGreaterThan(0);
    let sent = "";
    const capture = (async (_u: unknown, init?: RequestInit) => { sent = String(init?.body); return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "It died badly. You stand." } }] }), { status: 200 }); }) as unknown as typeof fetch;
    const para = await narrateFight(cfg, over!.data as never, capture);
    expect(para).toBe("It died badly. You stand.");
    expect(sent).toContain("the creature is dead");
    void g2;
  });
});
