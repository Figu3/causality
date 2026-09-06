import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Game } from "../db/game.js";
import type { Choice, Response } from "../core/types.js";
import { MAX_START_AGE, MIN_START_AGE } from "../core/stats.js";

/**
 * Telegram adapter. Translates Telegram input into {verb, args} and renders {text, choices} as a
 * message with an inline keyboard. Nothing about the game lives here.
 */

type Creation = { stage: "name" } | { stage: "age"; name: string };
const creations = new Map<string, Creation>();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** *bold* on a line start becomes <b>, everything else is escaped */
function html(s: string): string {
  return esc(s).replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
}

function encode(c: Choice): string {
  const parts = [c.verb, ...Object.entries(c.args ?? {}).map(([k, v]) => `${k}=${v}`)];
  const data = parts.join("|");
  if (Buffer.byteLength(data) > 64) throw new Error(`callback too long: ${data}`);
  return data;
}
function decode(data: string): { verb: string; args: Record<string, string> } {
  const [verb = "look", ...rest] = data.split("|");
  const args: Record<string, string> = {};
  for (const kv of rest) {
    const i = kv.indexOf("=");
    if (i > 0) args[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return { verb, args };
}

function keyboard(choices: Choice[]): InlineKeyboard | undefined {
  if (!choices.length) return undefined;
  const kb = new InlineKeyboard();
  choices.forEach((c, i) => {
    kb.text(c.label, encode(c));
    const wide = c.label.length > 18;
    if (wide || i % 2 === 1) kb.row();
  });
  return kb;
}

async function render(ctx: Context, res: Response): Promise<void> {
  const kb = keyboard(res.choices);
  await ctx.reply(html(res.text), { parse_mode: "HTML", ...(kb ? { reply_markup: kb } : {}) });
  for (const e of res.events) {
    if (e.type === "death" || e.type === "retirement") {
      const card = [
        `<b>${esc(res.state.name)}</b>`,
        e.type === "death" ? `died aged ${e.data.age}, floor ${e.data.floor}, ${esc(String(e.data.cause))}.` : `retired aged ${e.data.age}.`,
        `<i>${esc(String(e.data.epitaph))}</i>`,
      ];
      const claim = res.events.find((x) => x.type === "heir_claim");
      if (claim && ctx.me.username) card.push(`\nA claim waits for ${esc(String(claim.data.label))}. Send them this link:\nhttps://t.me/${ctx.me.username}?start=heir_${claim.data.token}`);
      card.push("\n/new to begin again.");
      await ctx.reply(card.join("\n"), { parse_mode: "HTML" });
    }
  }
}

function pid(ctx: Context): string {
  return String(ctx.from?.id ?? "");
}

export function createBot(token: string, game: Game): Bot {
  const bot = new Bot(token);

  const startCreation = async (ctx: Context): Promise<void> => {
    creations.set(pid(ctx), { stage: "name" });
    await ctx.reply("You stand at the foot of the tower. What is your name?");
  };

  const act = async (ctx: Context, verb: string, args: Record<string, string> = {}): Promise<void> => {
    const res = await game.act(pid(ctx), { verb, args });
    if (!res) {
      await startCreation(ctx);
      return;
    }
    await render(ctx, res);
  };

  bot.command("start", async (ctx) => {
    const p = await game.getOrCreatePlayer(pid(ctx), ctx.from?.username ?? null);
    const payload = ctx.match?.trim() ?? "";
    if (payload.startsWith("heir_")) {
      const claim = await game.claimHeir(payload.slice(5), p.id);
      if (claim) await ctx.reply(`${claim.fromName} named you their heir. ${claim.shards} shards${claim.item ? ` and ${claim.item.name}` : ""} will be waiting for your next character.`);
      else await ctx.reply("That claim is gone, or was never real.");
    }
    const c = await game.currentCharacter(p.id);
    if (c && c.status === "alive") return act(ctx, "look");
    return startCreation(ctx);
  });

  bot.command("new", async (ctx) => {
    await game.getOrCreatePlayer(pid(ctx), ctx.from?.username ?? null);
    const c = await game.currentCharacter(pid(ctx));
    if (c && c.status === "alive") return ctx.reply(`${c.name} still lives. There is only ever one of you at a time.`);
    return startCreation(ctx);
  });

  bot.command("look", (ctx) => act(ctx, "look"));
  bot.command("back", (ctx) => act(ctx, "look"));
  bot.command("status", (ctx) => act(ctx, "status"));
  bot.command("heirloom", (ctx) => act(ctx, "heirloom"));
  bot.command("retire", (ctx) => act(ctx, "retire", ctx.match ? { epitaph: ctx.match } : {}));

  bot.command("hall", async (ctx) => {
    const rows = await game.hall(10);
    if (!rows.length) return ctx.reply("The hall is empty. Nobody has died yet. Give it time.");
    await ctx.reply(rows.map((r) => `<b>${esc(r.name)}</b>, ${r.ending === "retirement" ? "retired" : "died"} aged ${Math.floor(r.record.age)}, floor ${r.record.floor}.\n<i>${esc(r.record.epitaph)}</i>`).join("\n\n"), { parse_mode: "HTML" });
  });

  bot.command("heir", async (ctx) => {
    const arg = ctx.match?.trim() ?? "";
    if (!arg) return ctx.reply("Name your heir.\n/heir @username for someone not yet in the tower (a spiritual heir).\n/heir CharacterName for a living character (a blood heir; they must /accept).");
    if (arg.startsWith("@")) return act(ctx, "heir", { kind: "spiritual", label: arg });
    const target = await game.findLivingCharacterByName(arg);
    if (!target) return ctx.reply(`No living character is called ${arg}.`);
    if (target.playerId === pid(ctx)) return ctx.reply("You cannot be your own heir.");
    return act(ctx, "heir", { kind: "blood", characterId: target.id });
  });

  bot.command("accept", async (ctx) => {
    const me = await game.currentCharacter(pid(ctx));
    if (!me || me.status !== "alive") return ctx.reply("You have no living character to accept with.");
    const reqs = await game.pendingHeirRequests(me.id);
    if (!reqs.length) return ctx.reply("Nobody has named you their heir.");
    const ok = await Promise.all(reqs.map((r) => game.acceptHeir(r.id, me.id)));
    const names = reqs.filter((_, i) => ok[i]).map((r) => r.name);
    return ctx.reply(names.length ? `You accept. You are now heir to ${names.join(", ")}.` : "Nothing to accept.");
  });

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const { verb, args } = decode(ctx.callbackQuery.data);
    if (verb === "age") {
      const s = creations.get(pid(ctx));
      if (!s || s.stage !== "age") return;
      const age = Number(args.v);
      try {
        const c = await game.createCharacter(pid(ctx), s.name, age);
        creations.delete(pid(ctx));
        await ctx.reply(`${c.name}, ${age}, begins the climb. You have ${c.shards} shards and ${c.inventory.map((i) => i.name).join(", ")}.`);
        await act(ctx, "look");
      } catch (e) {
        await ctx.reply((e as Error).message);
      }
      return;
    }
    if (verb === "defy_prompt") {
      await ctx.reply("Take control of your destiny. What do you do?", { reply_markup: { force_reply: true, input_field_placeholder: "I try to..." } });
      return;
    }
    await act(ctx, verb, args);
  });

  bot.on("message:text", async (ctx) => {
    const s = creations.get(pid(ctx));
    if (s?.stage === "name") {
      const name = ctx.message.text.trim();
      if (name.length < 2 || name.length > 24) return ctx.reply("Two to twenty-four characters.");
      creations.set(pid(ctx), { stage: "age", name });
      const kb = new InlineKeyboard();
      for (let a = MIN_START_AGE; a <= MAX_START_AGE; a += 5) kb.text(String(a), `age|v=${a}`);
      return ctx.reply(`${name}. And how old are you when you begin? The young have time and quick hands. The old have cunning, and less of it.`, { reply_markup: kb });
    }
    const t = ctx.message.text.trim().toLowerCase();
    const map: Record<string, string> = { look: "look", l: "look", status: "status", attack: "attack", a: "attack", defend: "defend", flee: "flee", run: "flee", rest: "rest", take: "take", loot: "take", climb: "climb", up: "climb", examine: "examine", x: "examine" };
    const verb = map[t];
    if (verb) return act(ctx, verb);
    // anything else a living character types is an attempt to defy fate
    const text = ctx.message.text.trim();
    if (text.length < 3) return ctx.reply("Say what you do.");
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    const res = await game.defyFate(pid(ctx), text);
    if (!res) return ctx.reply("Nobody living to defy anything. /start");
    await render(ctx, res);
  });

  bot.catch((err) => {
    console.error("bot error", err.error);
  });
  return bot;
}
