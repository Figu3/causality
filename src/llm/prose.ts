import { seeded } from "../core/rng.js";
import type { FloorGraph, ProseOverlay } from "../core/types.js";
import { chat, extractJson, type Fetch, type LlmConfig } from "./gateway.js";

/** A motif per floor per day so days read differently even when the graph is similar. */
const MOTIFS = [
  "standing water", "wind through cracks", "old fire", "roots and rot", "bone dust", "cold iron", "broken glass",
  "silence that feels listened to", "a smell of tallow", "chalk marks left by earlier climbers", "dripping", "salt",
  "moths", "rust", "ash underfoot", "a distant bell", "fungus light", "ropes and pulleys", "flood lines on the walls",
];

export function motifFor(g: FloorGraph): string {
  return seeded(g.seed ^ 0x9e3779b9).pick(MOTIFS);
}

const SYSTEM = `You write the rooms of one floor of Causality, a grim text tower-climber. Second person, present tense, plain words, two or three short sentences per room, no headings, no lists, no dashes of any kind. Terse and physical. Each room gets a short evocative title (two to five words) and its prose.

Rules that code depends on:
- Say only what the room IS. Never say what the player does, finds, fights or decides. Never name loot, numbers, or outcomes.
- A "combat" room contains the named creature; make its presence felt without describing a fight.
- A "trap" room hints that the floor or walls are wrong, without naming a mechanism outright.
- A "treasure" room suggests something hidden or left behind.
- A "rest" room is safe and still.
- The "entrance" and "stair" rooms mention the stair.
- The "boss" room holds the named guardian; make it feel like the end of the floor.
- A "hidden" room is sealed and was never meant to be found.
Reply with ONE JSON object: {"rooms": {"<id>": {"title": "...", "prose": "..."}, ...}} with every id given, nothing else.`;

export function buildFloorPrompt(g: FloorGraph, motif: string): { role: "system" | "user"; content: string }[] {
  const lines = Object.values(g.rooms).map((r) => {
    const bits = [`${r.id}: ${r.type}${r.hidden ? " (hidden)" : ""}${r.stair ? " (stair up)" : ""}`];
    if (r.enemy) bits.push(`creature: ${r.enemy.name}`);
    bits.push(`exits: ${r.exits.map((e) => g.rooms[e]?.type ?? e).join(", ")}`);
    return bits.join("; ");
  });
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Floor ${g.floor} of the tower, ${g.kind === "trial" ? "the trial floor, where nothing can kill a climber" : "the wild"}. Biome: ${g.biome}. Today's motif: ${motif}.\n\nRooms:\n${lines.join("\n")}` },
  ];
}

/** Parse the model's answer into an overlay. Drops rooms it does not know and empty text. */
export function parseOverlay(raw: unknown, g: FloorGraph): ProseOverlay {
  const out: ProseOverlay = {};
  const rooms = (raw && typeof raw === "object" && (raw as { rooms?: unknown }).rooms) as Record<string, unknown> | undefined;
  if (!rooms || typeof rooms !== "object") return out;
  for (const [id, v] of Object.entries(rooms)) {
    if (!g.rooms[id] || !v || typeof v !== "object") continue;
    const o = v as { title?: unknown; prose?: unknown };
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 40) : "";
    const prose = typeof o.prose === "string" ? o.prose.trim().replace(/\s*[—–]\s*|\s+--\s+/g, ", ").slice(0, 600) : "";
    if (title || prose) out[id] = { title, prose };
  }
  return out;
}

export async function generateFloorProse(cfg: LlmConfig | null, g: FloorGraph, fetchImpl?: Fetch): Promise<{ overlay: ProseOverlay; model: string | null }> {
  if (!cfg || g.kind === "city") return { overlay: {}, model: null };
  const res = await chat(cfg, buildFloorPrompt(g, motifFor(g)), { maxTokens: 1800, temperature: 0.9, json: true }, fetchImpl);
  const overlay = res ? parseOverlay(extractJson(res.text), g) : {};
  return { overlay, model: res?.model ?? null };
}
