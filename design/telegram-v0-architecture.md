# Causality, Telegram v0 architecture

Companion to `spec-v2.md`. Goal: a playable beta on Telegram with no frontend work, built so
that Telegram is only the first of several clients.

## The boundary that makes the game multi-format

The game core is a pure library. It never knows what a Telegram keyboard is.

```
request:  { characterId, verb, args }
response: { text, choices: [{label, verb, args}], events: [...], state: {...} }
```

- `text` is what the player reads. `choices` is what they can do next. `events` are things that
  happened that an adapter may want to surface elsewhere (a group chat, a notification). `state`
  is a small snapshot (hp, focus, floor, room) for clients that want a status bar.
- An adapter (Telegram today; web, Discord, an app, an agent harness later) translates its input
  into `{verb, args}` and renders `text` plus `choices` however it likes. Adding a client is
  adapter work only.
- `Defy fate` is a verb whose single argument is the player's sentence. The adapter opens text
  input; the core calls the Referee.

## Components

```
telegram adapter (grammY)  ─┐
web adapter (later)        ─┼─▶  game core (TypeScript, pure)  ─▶  Postgres
agent adapter (later)      ─┘         │
                                      ├─▶ LLM gateway (routing: small / strong)
                                      └─▶ jobs: nightly prose, weekly chronicler,
                                            aging tick, war timers, snapshot refresh
```

- **Language:** TypeScript, strict. One Node process for the beta. No microservices.
- **Storage:** Postgres. Redis only if a queue becomes necessary; the beta does not need one.
- **LLM gateway:** one module that owns prompts, structured-output parsing and model routing.
  Small model for the Referee, post-fight paragraphs and nightly prose; strong model for
  Chronicler drafting. Every call and its parsed output is logged; the Referee's log is the
  Chronicler's input.
- **Jobs:** cron-style timers in-process for the beta (nightly floor batch, weekly Chronicler run
  that produces a draft for designer review, daily aging tick applied on next action, war delay
  and upkeep timers, champion snapshot refresh).
- **Hosting:** the NUC, as a systemd unit, alongside the existing Telegram bots. Backups follow
  the existing Mac-pull routine.

## Telegram mapping

| Game concept | Telegram surface |
|---|---|
| Playing a character | DM with the bot; inline keyboard for `choices`, `Defy fate` opens text input |
| Group (family, order, company) | a Telegram group with the bot added; the bot posts chronicle events, war declarations, vault actions, votes |
| Chronicle announcement | broadcast to every group chat and to a public channel |
| Monument, epitaph, corpse | text in the room description; monuments have a `Visit` choice |
| Market | per-floor board rendered as paginated messages with `Buy` / `Bid` choices |

Slash commands cover the fixed verbs for players who prefer typing; a fuzzy matcher maps typed
phrasings of known verbs to commands. Anything the matcher cannot resolve is offered as
`Defy fate`, so unknown input is never an error, it is an invitation.

## Data model (tables, first cut)

`characters`, `character_stats`, `character_skills`, `character_classes`, `inventory`, `items`,
`floors`, `floor_modifiers`, `floor_holdings`, `rooms_daily` (seeded graphs and cached prose),
`room_instances`, `encounters`, `snapshots`, `groups`, `group_members`, `group_vault`,
`group_relations`, `group_modifiers`, `wars`, `ambushes`, `corpses`, `monuments`,
`causality_projects`, `chronicle_entries`, `achievements`, `improvise_log`, `market_orders`,
`trades`, `missions`, `llm_calls`.

## Build order

1. Core loop on one floor: character creation (name, starting age), heir designation (blood or
   spiritual, by Telegram user id), rooms, movement, examine,
   deterministic combat, death, the estate rule, epitaph. Telegram adapter. No model calls.
2. `Defy fate`: Referee contract, outcome tables, bounds, improvise log. First model call.
3. Floors 1 to 10, biomes, nightly prose batch, missions, entry costs, market.
4. Groups: the object, the Telegram group binding, vault, standing, modifiers, succession.
5. Floor lords: challenge, champion prompt, tax, succession.
6. War and ambush.
7. Chronicler: scoring, drafting, validation, the designer review step, compilation, monuments,
   broadcast. Run it on the first week of real play, by hand, before automating.

Step 1 is playable and testable with friends. Step 7 is the first moment the game is Causality.
