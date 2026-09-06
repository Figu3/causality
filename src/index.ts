import "dotenv/config";
import pg from "pg";
import { createBot } from "./adapters/telegram.js";
import { Game, dueErrands } from "./db/game.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const dbUrl = process.env.DATABASE_URL;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
if (!dbUrl) throw new Error("DATABASE_URL is not set");

const pool = new pg.Pool({ connectionString: dbUrl });
const game = new Game(pool);
const bot = createBot(token, game);

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

// away-time: tell players when what they left running has finished
const notifier = setInterval(async () => {
  try {
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
