import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import { Game } from "../src/db/game.js";
import { DAY_MS } from "../src/core/stats.js";
import type { Character } from "../src/core/types.js";

const url = process.env.DATABASE_URL ?? "postgres://causality:causality@localhost:5433/causality";
const T0 = Date.parse("2026-09-05T10:00:00Z");

describe("game service against postgres", async () => {
  const pool = new pg.Pool({ connectionString: url });
  let reachable = true;
  try { await pool.query("select 1"); } catch { reachable = false; }
  if (!reachable) {
    it.skip("postgres not reachable, skipping", () => undefined);
    return;
  }
  let now = T0;
  const game = new Game(pool, () => now);
  const P1 = `t1-${Date.now()}`, P2 = `t2-${Date.now()}`;

  beforeAll(async () => {
    await pool.query(readFileSync("src/db/schema.sql", "utf8"));
  });
  afterAll(async () => { await pool.end(); });

  const setPlace = async (id: string, floor: number): Promise<void> => {
    await pool.query(`update characters set data = data || $2 where id = $1`, [id, { floor, roomId: null, runDay: null, cleared: [] }]);
  };

  it("creates a player and a character, and the first action lands at the entrance", async () => {
    await game.getOrCreatePlayer(P1, "one");
    const c = await game.createCharacter(P1, "Aldric", 25);
    expect(c.status).toBe("alive");
    await expect(game.createCharacter(P1, "Twin", 25)).rejects.toThrow(/already/);
    const r = await game.act(P1, { verb: "look" });
    expect(r?.state.floor).toBe(1);
    expect(r?.choices.some((x) => x.verb === "move")).toBe(true);
  });

  it("blood heir: request, accept, and inherit on death in a held place", async () => {
    await game.getOrCreatePlayer(P2, "two");
    const heir = await game.createCharacter(P2, "Brenna", 30);
    const target = await game.findLivingCharacterByName("brenna");
    expect(target?.id).toBe(heir.id);
    await game.act(P1, { verb: "heir", args: { kind: "blood", characterId: heir.id } });
    expect(await game.pendingHeirRequests(heir.id)).toHaveLength(1);
    const me = (await game.currentCharacter(P1))!;
    expect(await game.acceptHeir(me.id, heir.id)).toBe(true);
    await pool.query(`update characters set data = data || '{"shards": 500, "heirloomId": "knife"}' where id = $1`, [me.id]);

    now = T0 + 200 * DAY_MS; // old age, on floor 1 (held)
    const r = await game.act(P1, { verb: "look" });
    expect(r?.state.status).toBe("dead");
    const h = (await game.currentCharacter(P2))!;
    expect(h.shards).toBe(30 + 50);
    expect(h.inventory.some((i) => i.id === "knife" && i.name.includes("knife"))).toBe(true);
    const hall = await game.hall(5);
    expect(hall[0]?.name).toBe("Aldric");
  });

  it("spiritual heir: claim link, pending inheritance, applied to the next character", async () => {
    now = T0 + 201 * DAY_MS;
    const c = await game.createCharacter(P1, "Cael", 45);
    await game.act(P1, { verb: "look" });
    const r = await game.act(P1, { verb: "heir", args: { kind: "spiritual", label: "@newcomer" } });
    expect(r?.text).toContain("spiritual heir");
    const cur = (await game.currentCharacter(P1))!;
    await pool.query(`update characters set data = data || '{"shards": 1000}' where id = $1`, [c.id]);
    now = T0 + 300 * DAY_MS;
    const dead = await game.act(P1, { verb: "look" });
    const claimEv = dead?.events.find((e) => e.type === "heir_claim");
    expect(claimEv).toBeDefined();
    const token = String(claimEv!.data.token);
    expect(cur.heir?.kind).toBe("spiritual");
    const P3 = `t3-${Date.now()}`;
    await game.getOrCreatePlayer(P3, "three");
    const claim = await game.claimHeir(token, P3);
    expect(claim?.shards).toBe(100);
    expect(await game.claimHeir(token, P3)).toBeNull();
    const nc = await game.createCharacter(P3, "Dara", 20);
    expect(nc.shards).toBe(30 + 100);
    expect((await game.player(P3))?.pendingInheritance).toBeNull();
  });

  it("wild death drops the heirloom on a corpse that another player can loot", async () => {
    now = T0 + 301 * DAY_MS;
    const c = await game.createCharacter(P1, "Edda", 45);
    await pool.query(`update characters set data = data || '{"heirloomId": "knife"}' where id = $1`, [c.id]);
    await setPlace(c.id, 3);
    now = T0 + 400 * DAY_MS;
    const dead = await game.act(P1, { verb: "look" });
    expect(dead?.events.some((e) => e.type === "corpse")).toBe(true);

    const looter = await game.createCharacter(P2, "Fenn", 20); // Brenna is long dead by now
    await setPlace(looter.id, 3);
    const seen = await game.act(P2, { verb: "look" });
    expect(seen?.text).toContain("corpse marker");
    const lootChoice = seen?.choices.find((x) => x.verb === "loot");
    expect(lootChoice).toBeDefined();
    const before = (await game.currentCharacter(P2))!.inventory.length;
    const looted = await game.act(P2, { verb: "loot", args: lootChoice!.args! });
    expect(looted?.text).toContain("You take");
    const after = (await game.currentCharacter(P2))! as Character;
    expect(after.inventory.length).toBe(before + 1);
    const again = await game.act(P2, { verb: "loot", args: lootChoice!.args! });
    expect(again?.text).toContain("Someone got here first");
  });
});
