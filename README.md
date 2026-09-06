# Causality

A hardcore text tower-climber played over Telegram. One shared world, one shared history, one
life at a time.

Most games reset. Causality does not. Rare, exceptional deeds become permanent, stacking,
attributed changes to the world: a shortcut that stays open, a storm that never lifts, a boss that
now trades instead of fights, a tax that outlives the lord who levied it. Every player who comes
after lives with what you did, and your name is on the monument.

## The five principles

1. **One world, one chronicle.** No servers, no shards, no wipes. The tower grows; it never resets.
2. **Async by default.** Other players are traces: monuments, epitaphs, corpses, market orders,
   the loadout a lord left to defend their floor. Nobody waits on anybody. Live moments happen in
   group chats.
3. **The model adds options, code adjudicates stakes.** A language model can open a door for you.
   It can never kill you, never grant you anything the engine has no verb for, and never change the
   world. Only the Chronicler changes the world, through a fixed set of primitives.
4. **No character is lost to something it could not act against.** Every harm arrives as an
   encounter or a disclosed hazard, never as a silent state change.
5. **Permanent, not reversible, but counteractable.** A causality project is never undone. A later
   deed can dampen it. Both monuments stand.

## How it plays

You open the bot, name a character, and choose a starting age between 15 and 45. Then you climb.

Every floor is a small graph of rooms regenerated daily from a seed: combat, traps, treasure,
places to rest, and a boss guarding the stair. You move with buttons. Combat is turn-based and
deterministic, three to six decisions, and the game writes one paragraph about it afterwards.
When the fight is over, it is over.

There is exactly one place in the game where you type a sentence: the **Defy fate** button.
*"Take control of your destiny. What do you do?"* Talk the guardian down. Jam the turbine with the
bone you are carrying. Offer the merchant your family name instead of shards. A model reads what
you tried and proposes an action class and the stats that govern it; the engine sets the
difficulty, rolls, and applies a bounded outcome; the model narrates what actually happened.
Cunning and guile make you better at it, and those improve with age.

Every `Defy fate` attempt is logged. That log is what the Chronicler reads.

## Life and death

**You age in real time.** One real day is 0.8 game years, so a character born at 15 is 80 in
about twelve weeks. Physical stats (might, agility, grit) decay past your prime; mental ones
(cunning, guile, presence) keep improving. An elder cannot out-fight a thirty-year-old, but can
out-talk one. Starting older trades runway for a sharper mind.

**Death is permanent.** From a blade, a trap, an ambush, or old age. Old age is never resolved
while you are offline; it waits for your next action. Elders who reach a held place can
**retire** instead, which is the intended ending.

**Prepare an heir, or die unprepared.** An heir is named while you live and must accept before you
die. A *blood heir* is a living character in your family. A *spiritual heir* is a real person who
is not in the game yet: when you die, a claim link appears on your death card, and their first
character is born into your family with what you left. Your estate passes at 10% on death and 25%
on retirement. Die with no accepted heir and it is burned.

**What you carry.** You choose one **heirloom**. Die or retire in a held place (a floor your group
holds, or the protected first floors) and it passes to your heir. Die in the wild and it drops
where you fell, on a corpse marker with your epitaph, for whoever comes next: your heir, your
group, or a stranger.

## Stats

Eight primary stats: might, agility, grit, cunning, focus, perception, guile, presence. Derived
values follow simple formulas (hp is `100 + grit*15 + might*5`, dodge is `agility*2 + perception`,
and so on). Three points per level to train where you like. Classes are not chosen; they are
discovered, with hidden achievement-based requirements, and you can hold more than one.

## The tower

The beta is ten floors. The floor 10 boss can be beaten; the stair beyond it is sealed, and the
tower visibly continues above. Opening that gate, when floors 11 to 20 ship, will itself be a
causality project.

Floors 1 and 2 are protected: the Chronicler cannot place taxes or hazards there, so the entry ramp
stays stable while the tower above it mutates.

## Groups

A group is one object with two rules, a join rule and a succession rule. You may hold one of each
category, so at most three affiliations:

| Category | Joined | Leaving |
|---|---|---|
| **Family** | by inheritance: your heir is born into it | impossible; you can be disowned |
| **Order** | by oath | oath-breaking, which carries a curse |
| **Company** | by invitation | free |

Every group has a charter (short text the model and the Chronicler read), a vault, holdings,
standing, relations with other groups, and buffs or curses. A curse on a family is hereditary. A
group's chat is a Telegram group with the bot in it: that chat is the guild hall, and the game's
only live layer.

## Floor lords

Beat a floor's boss and you become its lord. You set an entry tax (up to 10%: half to you, half to
the Tower), place traps, and appoint a champion whose personality you write as a short prompt. The
seat passes within your group when you die, unless you were slain in the floor challenge, in which
case the challenger takes the floor.

## Conflict

Economic warfare is always allowed. A held floor is a hazard you consent to by entering. Everything
else is gated by **war**: an order or company declares it, it takes effect after 24 hours, it costs
upkeep, and while it lasts members may lay ambushes that appear as fair, fleeable encounters. No
trap you never saw, no loss you could not act against.

## The Chronicler

Once a week, a strong model reads the `Defy fate` log and the achievement log, scores deeds for
novelty against everything that has ever happened, and drafts one to three **causality projects**,
each expressed only in effect primitives: a tax modifier on a floor range, an environmental
condition, a new passage, a change to a boss or NPC, a recipe, a shrine, a buff or curse on a
group, or a dampener on an earlier project. Code validates the bounds; a human ratifies during the
beta; then the project compiles into live rules, a monument is placed with your name on it, and
every group chat hears about it.

Rarity comes from ranking, not hidden thresholds. A deed that resembles a past deed scores low. The
only way to be chronicled is to do something nobody has done.

A daily digest ("Yesterday in the Tower") runs from day one and needs no model at all.

## Status

Design is settled; the code is early. Build step 1 is done: character creation, daily floors,
deterministic combat, death, heirs and heirlooms, corpses, the Telegram adapter, floors 1 to 10.
No model calls yet.

Build order: `Defy fate` and the Referee, then groups, floor lords, war, and finally the
Chronicler. See [design/spec-v2.md](design/spec-v2.md) for the full design and
[design/telegram-v0-architecture.md](design/telegram-v0-architecture.md) for the architecture.

## Running it

```bash
npm install
docker compose up -d          # Postgres on :5433
cp .env.example .env          # add TELEGRAM_BOT_TOKEN
npm run migrate
npm test
npm run dev
```

The game core (`src/core`) is a pure library with no I/O: `{verb, args}` in, `{text, choices,
events, state}` out. Telegram is the first adapter, not the only one.
