import { randomUUID } from "node:crypto";
import type pg from "pg";
import { newCharacter, snapshot, step, type SideEffect } from "../core/engine.js";
import { systemRng } from "../core/rng.js";
import { ageAt, effectiveStats } from "../core/stats.js";
import { dayKey, generateFloor } from "../core/floor.js";
import type { Character, Choice, DeathRecord, Item, Request, Response } from "../core/types.js";
import type { Fetch, LlmConfig } from "../llm/gateway.js";
import { narrate, propose } from "../llm/referee.js";

export interface Player {
  id: string;
  username: string | null;
  currentCharacterId: string | null;
  pendingInheritance: { shards: number; item: Item | null; fromName: string } | null;
}
export interface HallEntry { name: string; ending: string; record: DeathRecord }
export interface Corpse { id: number; characterName: string; epitaph: string; item: Item }
export interface Claim { token: string; fromName: string; label: string; shards: number; item: Item | null; claimedBy: string | null }

type Q = pg.PoolClient | pg.Pool;

/**
 * The service layer: loads a character, runs one pure engine step inside a transaction, persists
 * the result and applies the engine's side effects. Nothing here knows about Telegram.
 */
export class Game {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number = Date.now,
    private readonly llm: LlmConfig | null = null,
    private readonly fetchImpl?: Fetch,
  ) {}

  /**
   * Defy fate. The model classifies the player's sentence (outside any transaction), the pure
   * engine resolves it, then the model narrates what actually happened. Every attempt is logged.
   */
  async defyFate(playerId: string, text: string): Promise<Response | null> {
    const before = await this.currentCharacter(playerId);
    if (!before || before.status !== "alive") return null;
    const now = this.now();
    const graph = generateFloor(before.floor, dayKey(now));
    const room = graph.rooms[before.roomId ?? graph.entrance] ?? graph.rooms[graph.entrance]!;
    const age = ageAt(before.startingAge, before.bornAt, now);
    const enemy = before.combat ? { name: before.combat.enemy.name, hp: before.combat.enemy.hp, maxHp: before.combat.enemy.maxHp, boss: before.combat.enemy.boss } : null;
    const call = await propose(this.llm, { character: before, stats: effectiveStats(before.base, age), age, floor: before.floor, floorKind: graph.kind, room, enemy, text }, this.fetchImpl);

    const res = await this.act(playerId, { verb: "defy", args: { proposal: JSON.stringify(call.proposal) } });
    if (!res) return null;
    const ev = res.events.find((e) => e.type === "defy");
    if (!ev) return res; // refused (no focus, etc.): nothing to log or narrate

    const d = ev.data as { roll: number; dc: number; success: boolean; result: string };
    const narration = await narrate(this.llm, { intent: call.proposal.intent, attempt: text, result: d.result, success: d.success, room: room.title, enemy: enemy?.name ?? null }, this.fetchImpl);
    await this.pool.query(
      `insert into improvise_log (character_id, player_id, floor, room_id, in_combat, text, proposal, roll, dc, success, result, narration, model, fallback, latency_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [before.id, playerId, before.floor, room.id, !!before.combat, text.slice(0, 500), call.proposal, d.roll, d.dc, d.success, d.result, narration, call.model, call.fallback, call.latencyMs],
    ).catch((err) => console.error("improvise_log", err));
    if (narration) return { ...res, text: res.text.replace(d.result, narration) };
    return res;
  }

  async getOrCreatePlayer(id: string, username: string | null): Promise<Player> {
    const r = await this.pool.query(
      `insert into players (id, username) values ($1, $2)
       on conflict (id) do update set username = coalesce(excluded.username, players.username)
       returning id, username, current_character_id, pending_inheritance`,
      [id, username],
    );
    return rowToPlayer(r.rows[0]);
  }

  async player(id: string): Promise<Player | null> {
    const r = await this.pool.query(`select id, username, current_character_id, pending_inheritance from players where id = $1`, [id]);
    return r.rows[0] ? rowToPlayer(r.rows[0]) : null;
  }

  async currentCharacter(playerId: string): Promise<Character | null> {
    const r = await this.pool.query(
      `select c.data from players p join characters c on c.id = p.current_character_id where p.id = $1`,
      [playerId],
    );
    return r.rows[0] ? normalize(r.rows[0].data as Character) : null;
  }

  async createCharacter(playerId: string, name: string, startingAge: number): Promise<Character> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const p = await client.query(`select current_character_id, pending_inheritance from players where id = $1 for update`, [playerId]);
      const cur = p.rows[0]?.current_character_id as string | null | undefined;
      if (cur) {
        const alive = await client.query(`select status from characters where id = $1`, [cur]);
        if (alive.rows[0]?.status === "alive") throw new Error("you already have a living character");
      }
      let c = newCharacter(randomUUID(), playerId, name, startingAge, this.now());
      const inh = p.rows[0]?.pending_inheritance as Player["pendingInheritance"];
      if (inh) {
        c = { ...c, shards: c.shards + inh.shards, inventory: inh.item ? [...c.inventory, inh.item] : c.inventory };
      }
      await client.query(`insert into characters (id, player_id, name, status, data) values ($1, $2, $3, $4, $5)`, [c.id, playerId, c.name, c.status, c]);
      await client.query(`update players set current_character_id = $2, pending_inheritance = null where id = $1`, [playerId, c.id]);
      await client.query("commit");
      return c;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  /** One player action. Returns the engine response, decorated with anything the world adds (corpses). */
  async act(playerId: string, req: Request): Promise<Response | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const r = await client.query(
        `select c.data from players p join characters c on c.id = p.current_character_id where p.id = $1 for update of c`,
        [playerId],
      );
      if (!r.rows[0]) { await client.query("rollback"); return null; }
      const before = normalize(r.rows[0].data as Character);
      const now = this.now();

      if (req.verb === "loot") {
        const res = await this.loot(client, before, req.args?.corpse ?? "", now);
        await client.query("commit");
        return res;
      }

      const out = step(before, req, now, systemRng());
      const awayUntil = out.character.errand ? new Date(out.character.errand.resolvesAt) : null;
      await client.query(
        `update characters set data = $2, status = $3, updated_at = now(),
           away_notified = case when away_until is distinct from $4 then false else away_notified end,
           away_until = $4
         where id = $1`,
        [out.character.id, out.character, out.character.status, awayUntil],
      );
      for (const e of out.effects) await this.apply(client, e, now);
      const response = await this.decorate(client, out.character, out.response);
      await client.query("commit");
      return response;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  private async apply(q: Q, e: SideEffect, now: number): Promise<void> {
    switch (e.type) {
      case "hall":
        await q.query(`insert into hall_of_heroes (character_id, name, ending, record, at) values ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`, [e.characterId, e.name, e.ending, e.record, now]);
        break;
      case "corpse":
        await q.query(`insert into corpses (floor, room_id, item, character_id, character_name, epitaph) values ($1, $2, $3, $4, $5, $6)`, [e.floor, e.roomId, e.item, e.characterId, e.characterName, e.epitaph]);
        break;
      case "heir_claim":
        await q.query(`insert into heir_claims (token, from_character_id, from_name, label, shards, item) values ($1, $2, $3, $4, $5, $6)`, [e.token, e.fromCharacterId, e.fromName, e.label, e.shards, e.item]);
        break;
      case "heir_transfer": {
        const r = await q.query(`select data from characters where id = $1 for update`, [e.toCharacterId]);
        const heir = r.rows[0] ? normalize(r.rows[0].data as Character) : undefined;
        if (heir && heir.status === "alive") {
          const upd = { ...heir, shards: heir.shards + e.shards, inventory: e.item ? [...heir.inventory, e.item] : heir.inventory };
          await q.query(`update characters set data = $2, updated_at = now() where id = $1`, [heir.id, upd]);
        } else {
          // the heir is gone: the estate goes to the heir's player as a pending inheritance for their next character
          const pr = await q.query(`select player_id from characters where id = $1`, [e.toCharacterId]);
          const pid = pr.rows[0]?.player_id as string | undefined;
          if (pid) await q.query(`update players set pending_inheritance = $2 where id = $1`, [pid, { shards: e.shards, item: e.item, fromName: e.fromName }]);
        }
        break;
      }
      case "achievement": {
        await q.query(`insert into achievements (key, character_id, data) values ($1, $2, $3)`, [e.key, e.characterId, e.data]);
        const first = await q.query(`insert into achievements (key, character_id, data) values ($1, $2, $3) on conflict do nothing returning id`, [`first:${e.key}`, e.characterId, e.data]);
        if (first.rows[0]) await q.query(`update characters set data = data || jsonb_build_object('firsts', coalesce(data->'firsts', '[]'::jsonb) || to_jsonb($2::text)) where id = $1`, [e.characterId, e.key]);
        break;
      }
    }
  }

  private async decorate(q: Q, c: Character, res: Response): Promise<Response> {
    if (c.status !== "alive" || !c.roomId || c.combat) return res;
    const corpses = await this.corpsesAt(q, c.floor, c.roomId, c.id);
    if (!corpses.length) return res;
    const lines = corpses.map((k) => `A corpse marker. "${k.epitaph}" Beside it, ${k.item.name}.`);
    const choices: Choice[] = corpses.map((k) => ({ label: `Loot ${k.characterName}'s remains`, verb: "loot", args: { corpse: String(k.id) } }));
    return { ...res, text: `${res.text}\n\n${lines.join("\n")}`, choices: [...choices, ...res.choices] };
  }

  private async corpsesAt(q: Q, floor: number, roomId: string, exceptCharacter: string): Promise<Corpse[]> {
    const r = await q.query(`select id, character_name, epitaph, item from corpses where floor = $1 and room_id = $2 and looted_by is null and character_id <> $3 order by id`, [floor, roomId, exceptCharacter]);
    return r.rows.map((x) => ({ id: Number(x.id), characterName: x.character_name, epitaph: x.epitaph, item: x.item as Item }));
  }

  private async loot(q: Q, c: Character, corpseId: string, now: number): Promise<Response> {
    const r = await q.query(`update corpses set looted_by = $1, looted_at = now() where id = $2 and floor = $3 and room_id = $4 and looted_by is null returning item, character_name`, [c.id, Number(corpseId) || 0, c.floor, c.roomId]);
    const base = step(c, { verb: "look" }, now, systemRng());
    if (!r.rows[0]) return { ...base.response, text: `Someone got here first.\n\n${base.response.text}` };
    const item = r.rows[0].item as Item;
    const upd = { ...base.character, inventory: [...base.character.inventory, item] };
    await q.query(`update characters set data = $2, updated_at = now() where id = $1`, [upd.id, upd]);
    const res = await this.decorate(q, upd, { ...base.response, state: snapshot(upd, now) });
    return { ...res, text: `You take ${item.name} from what is left of ${r.rows[0].character_name}.\n\n${res.text}` };
  }

  async hall(limit = 10): Promise<HallEntry[]> {
    const r = await this.pool.query(`select name, ending, record from hall_of_heroes order by at desc limit $1`, [limit]);
    return r.rows.map((x) => ({ name: x.name, ending: x.ending, record: x.record as DeathRecord }));
  }

  async findLivingCharacterByName(name: string): Promise<{ id: string; playerId: string; name: string } | null> {
    const r = await this.pool.query(`select id, player_id, name from characters where lower(name) = lower($1) and status = 'alive' limit 1`, [name.trim()]);
    return r.rows[0] ? { id: r.rows[0].id, playerId: r.rows[0].player_id, name: r.rows[0].name } : null;
  }

  /** Characters that have named the given character as blood heir and are still waiting for acceptance. */
  async pendingHeirRequests(characterId: string): Promise<{ id: string; name: string }[]> {
    const r = await this.pool.query(
      `select id, name from characters where status = 'alive' and data->'heir'->>'kind' = 'blood' and data->'heir'->>'characterId' = $1 and (data->'heir'->>'accepted')::boolean = false`,
      [characterId],
    );
    return r.rows.map((x) => ({ id: x.id, name: x.name }));
  }

  async acceptHeir(designatorId: string, heirCharacterId: string): Promise<boolean> {
    const r = await this.pool.query(
      `update characters set data = jsonb_set(data, '{heir,accepted}', 'true'::jsonb), updated_at = now()
       where id = $1 and status = 'alive' and data->'heir'->>'characterId' = $2 returning id`,
      [designatorId, heirCharacterId],
    );
    return r.rows.length > 0;
  }

  async claim(token: string): Promise<Claim | null> {
    const r = await this.pool.query(`select token, from_name, label, shards, item, claimed_by from heir_claims where token = $1`, [token]);
    const x = r.rows[0];
    return x ? { token: x.token, fromName: x.from_name, label: x.label, shards: x.shards, item: x.item as Item | null, claimedBy: x.claimed_by } : null;
  }

  /** Claim a spiritual inheritance for a player; it is applied to their next character. */
  async claimHeir(token: string, playerId: string): Promise<Claim | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const r = await client.query(`update heir_claims set claimed_by = $2, claimed_at = now() where token = $1 and claimed_by is null returning token, from_name, label, shards, item`, [token, playerId]);
      const x = r.rows[0];
      if (!x) { await client.query("rollback"); return null; }
      await client.query(`update players set pending_inheritance = $2 where id = $1`, [playerId, { shards: x.shards, item: x.item, fromName: x.from_name }]);
      await client.query("commit");
      return { token: x.token, fromName: x.from_name, label: x.label, shards: x.shards, item: x.item as Item | null, claimedBy: playerId };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
}

function rowToPlayer(x: Record<string, unknown>): Player {
  return {
    id: x.id as string,
    username: (x.username as string | null) ?? null,
    currentCharacterId: (x.current_character_id as string | null) ?? null,
    pendingInheritance: (x.pending_inheritance as Player["pendingInheritance"]) ?? null,
  };
}

/** Fill fields added after a character was first stored. */
function normalize(c: Character): Character {
  return { ...c, revealed: c.revealed ?? [], errand: c.errand ?? null };
}

export interface AwayNotice { playerId: string; characterId: string; name: string; kind: string }

/** Characters whose errand has resolved and who have not been told yet. Marks them told. */
export async function dueErrands(pool: pg.Pool): Promise<AwayNotice[]> {
  const r = await pool.query(
    `update characters set away_notified = true
     where status = 'alive' and away_until is not null and away_until <= now() and not away_notified
     returning player_id, id, name, data->'errand'->>'kind' as kind`,
  );
  return r.rows.map((x) => ({ playerId: x.player_id, characterId: x.id, name: x.name, kind: x.kind ?? "errand" }));
}
