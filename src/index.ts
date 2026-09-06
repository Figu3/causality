import "dotenv/config";
import pg from "pg";
import { createBot } from "./adapters/telegram.js";
import { Game, dueErrands, runningCountdowns, touchCountdown } from "./db/game.js";
import { countdownText } from "./adapters/telegram.js";
import { roleConfigsFromEnv } from "./llm/gateway.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const dbUrl = process.env.DATABASE_URL;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
if (!dbUrl) throw new Error("DATABASE_URL is not set");

const pool = new pg.Pool({ connectionString: dbUrl });
const llm = roleConfigsFromEnv();
if (!llm.referee) console.warn("causality: LLM_BASE_URL not set, Defy fate runs on templates only");
else console.log(`causality: referee=${llm.referee.model} narrator=${llm.narrator?.model ?? "none"} chronicler=${llm.chronicler?.model ?? "none"}`);
const game = new Game(pool, Date.now, llm);
const bot = createBot(token, game, pool);

await bot.api.setMyCommands([
  { command: "look", description: "Where you are" },
  { command: "status", description: "Who you are" },
  { command: "heir", description: "Name your heir" },
  { command: "accept", description: "Accept being an heir" },
  { command: "heirloom", description: "Choose what outlives you" },
  { command: "hall", description: "The Hall of Heroes" },
  { command: "back", description: "Return from an errand" },
  { command: "retire", description: "Retire, if you are old enough" },
  { command: "new", description: "Begin again after death" },
]);

const shutdown = async (): Promise<void> => {
  await bot.stop();
  await pool.end();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

// away-time: keep countdown messages fresh, and tell players when what they left running has finished
const notifier = setInterval(async () => {
  const now = Date.now();
  try {
    for (const c of await runningCountdowns(pool)) {
      const remaining = c.resolvesAt - now;
      const since = now - c.lastEditAt;
      const due = remaining <= 0 ? c.lastEditAt < c.resolvesAt : remaining > 30 * 60_000 ? since >= 5 * 60_000 : since >= 60_000;
      if (!due) continue;
      const text = countdownText(c.kind, c.resolvesAt, now);
      const markup = remaining <= 0 ? { inline_keyboard: [[{ text: "Open the tower", callback_data: "look|" }]] } : { inline_keyboard: [[{ text: "Check", callback_data: "look|" }]] };
      await bot.api.editMessageText(c.chatId, c.messageId, text, { reply_markup: markup }).catch(() => undefined);
      await touchCountdown(pool, c.characterId, remaining <= 0 ? c.resolvesAt + 1 : now);
    }
    for (const n of await dueErrands(pool)) {
      await bot.api.sendMessage(n.playerId, `${n.name} is back. Open the tower to see what came of it.`).catch(() => undefined);
    }
  } catch (err) {
    console.error("notifier", err);
  }
}, 60_000);
notifier.unref();

console.log("causality: starting bot");
await bot.start();
