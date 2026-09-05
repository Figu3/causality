# Causality, Design Spec v2

Date: 2026-09-05. Supersedes `causality-spec-v1.0.0.json` (kept for reference).
Scope of this document: the game as it will ship in beta (10 floors, Telegram), plus the rules
that must be true from day one so the world can grow without a reset.

## 1. Premise and principles

Causality is a hardcore text tower-climber. Players live one character at a time, for about
twelve real weeks, in a single shared world with a single shared history. Rare exceptional deeds
become permanent, stacking, attributed changes to that world. Everyone who comes after lives
with them.

Five principles. Every rule below should be traceable to one of these.

1. **One world, one chronicle.** No shards, no servers, no wipes. Scale on floors, not on copies.
2. **Async by default.** Other players are traces: monuments, epitaphs, corpses, market orders,
   boss snapshots, charters. Nobody waits on anybody. Live moments happen in group chats.
3. **The LLM adds options, code adjudicates stakes.** A model can open a door. It cannot kill
   you, cannot grant you anything the engine has no verb for, and cannot change world state.
   Only the Chronicler changes the world, and it does so through a fixed set of primitives.
4. **No character is lost to something it could not act against.** Every harm arrives as an
   encounter or a disclosed hazard, never as a silent state change.
5. **Permanent, not reversible, but counteractable.** A causality project is never undone. A
   later deed can dampen it. Both monuments stand.

## 2. Time and life

- **Wall-clock aging.** One real day is 0.8 game years. A character born at 15 reaches 80 in
  about 81 days (11.6 weeks). Everyone born in the same month ages together, which is what makes
  generations, families and the chronicle's "ages" legible.
- **Starting age is a choice, 15 to 45.** Younger means more runway and weaker mind; older means
  strong cunning, guile and presence and a third of the clock left. Inheritors may get a bonus at
  either end (later).
- **Natural death resolves on the character's next action**, never while logged out.
- **Retirement** is available from the elder phase (63+) in any held place (see 4). Retiring
  locks the better inheritance rate and writes a chronicle entry. Retirement is the intended
  ending; death of old age is the failure case for players who pushed too far.

Phases (modifiers multiply base stats; growth rate multiplies XP-to-stat conversion):

| Phase | Age | Days | Might | Agi | Grit | Cun | Foc | Per | Guile | Pres | Growth |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Youth | 15-25 | ~12 | 0.90 | 1.10 | 0.95 | 0.85 | 0.90 | 1.00 | 0.80 | 0.85 | 1.5 |
| Young adult | 26-35 | ~12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.2 |
| Prime | 36-50 | ~19 | 1.00 | 0.98 | 1.00 | 1.10 | 1.10 | 1.00 | 1.15 | 1.15 | 1.0 |
| Middle age | 51-62 | ~15 | 0.95 | 0.92 | 0.97 | 1.15 | 1.10 | 0.98 | 1.20 | 1.20 | 0.8 |
| Elder | 63-80 | ~22 | 0.9-(a-62)*0.01 | 0.85-(a-62)*0.015 | 0.92-(a-62)*0.008 | 1.20 | 1.05 | 0.95-(a-62)*0.005 | 1.25 | 1.25 | 0.5 |

Youth is deliberately short (it is the tutorial phase). Prime is stretched because it is where
surviving characters should spend most of their time. All numbers are placeholders to tune.

## 3. Character

**Primary stats (8):** might, agility, grit, cunning, focus, perception, guile, presence. Physical
stats decay with age; cunning, guile and presence improve. The split matters because `Defy fate`
(section 8) is gated by the mental stats: elders improvise better than they fight.

**Derived stats:**

```
hp               = 100 + grit*15 + might*5
stamina          = 50 + grit*10 + agility*5
focus_pool       = 30 + focus*5 + cunning*2        (spent by Defy fate)
initiative       = agility*2 + perception
carry_capacity   = 20 + might*3
dodge            = agility*2 + perception
block            = might*2 + grit
magic_resistance = focus*2 + grit
social_standing  = presence*2 + guile
crafting_skill   = focus*2 + cunning
trade_skill      = guile*2 + presence
```

**Growth:** 3 stat points per level, level cap 100, soft cap 100 per stat, hard cap 150.
Skills are action-based (melee, ranged, magic, smithing, alchemy, leadership, negotiation) and
unlock techniques as they grow; details as in v1, unchanged.

**Emergent classes:** hidden achievement-based requirements, multi-classing allowed. Beta ships
four (blade master, shadow walker, merchant prince, artificer) with the v1 thresholds. A class is
mostly a bonus table plus a flavour tag the Referee can read.

## 4. Death, inheritance, loot

**Permadeath** on: hp at zero, failed death save, execution by a floor lord's champion,
environmental hazard, old age, disease, ambush (section 10). Death prevention items (phoenix
feather, divine intervention, group rescue) are deferred.

**Heir target.** Every character names one heir: their own next character, or a group vault.
Default is the family vault if the character has a family, else next character.

**Estate on death or retirement:**

| | Died | Retired |
|---|---|---|
| Shards | 10% | 25% |
| Items | one chosen item (see below) | one chosen item |
| Knowledge | discovered recipes and locations | same |
| Reputation | 25% | 25% |

The rest of the estate is burned. This is the economy's largest sink and replaces v1's separate
"50% death penalty".

**Held place vs the wild.** A held place is a floor held by one of the character's groups, or a
city (later), or floors 1 and 2. Die or retire in a held place and the chosen item passes to the
heir. Die in the wild and the chosen item **drops where you died**, on a corpse marker with your
epitaph, retrievable by anyone: heir, group, or stranger. Corpse markers persist until looted.

**Memorial:** every death writes an epitaph (player-written if retired, Chronicler-written if
not) to the Hall of Heroes. Achievements are preserved on the character record.

## 5. The tower (beta: floors 1 to 10)

**Floor state is global; rooms are instanced.** A floor has: holder (lord and their group), tax,
active modifiers from causality projects, structures (v0: shrines only), monuments, and a boss
slot. Each day a seed generates the floor's room graph (5 to 20 rooms; types: combat, puzzle,
treasure, trap, rest, shop, event; graph-based connections with secret paths, shortcuts and
one-way passages). Each player walks their own instance of that day's graph. Backtracking is
allowed.

**Nightly prose batch.** A small model writes the day's room descriptions, riddles and event
choices once per floor, cached for every player. It never touches state.

**Entry cost:** `10 + floor*5` shards, plus the lord's tax.

**Protected floors:** 1 and 2 accept no economic or hazard primitives from the Chronicler.
Monuments and shrines are allowed. This keeps the newcomer ramp stable while the tower above it
mutates. When the tower grows, the protected band grows with it (target: the bottom 5%).

**Biomes in beta:** three, drawn from the v1 list: Crumbling Ruins (1 to 4), Verdant Canopy
(5 to 7), Crimson Forge (8 to 10). Biome is mostly prose in a text game, so this list is cheap to
extend.

**Floor 10 and the gate.** The floor 10 boss is beatable; first ascent is a chronicle deed and the
winner becomes the most contested lord in the beta. The gate to floor 11 is visible and sealed,
with the tower obviously continuing above it. Opening it, when floors 11 to 20 ship, is itself a
causality project and does not have to be a boss kill (a collective offering is one option).

**Difficulty:** exponential curve; missions scale on player level, floor, equipment quality,
recent performance.

## 6. Floor lords

- **Acquire** by defeating the floor's current boss: the NPC boss, or the lord's champion.
  Instant claim, tower-wide notification.
- **Powers:** entry tax up to 10%, trap placement within limits, minion placement, arena and
  aesthetic changes, passive income scaled on floor traffic. The lord appoints a **champion**:
  an NPC whose personality and tactics the lord writes as a short prompt (bounded by the Referee's
  rules), or a player who accepts and negotiates reward sharing. Without a champion the lord's own
  loadout snapshot defends.
- **Challenges:** queue, one hour cooldown per challenger, resolved by deterministic combat against
  the champion. Spectating and betting are deferred.
- **Holding a floor is member-only.** The lord must belong to the group that holds the floor.
  There is no key item in v0 (a stealable key is deferred with theft).
- **Succession:** on the lord's death, by any cause, the seat passes within the group by the
  group's succession rule. The single exception: a lord **slain in the floor challenge** loses the
  floor to the challenger (and the challenger's group). A lord killed elsewhere, by a monster or a
  player, still passes the seat to their group. Otherwise every lord is a target everywhere and
  holding a floor is a liability.
- **Abdication** is voluntary, keeps rewards, and the lord continues climbing.

## 7. Combat

Deterministic, turn-based, no model in the loop. A fight should resolve in 3 to 6 decisions.

- Verbs: attack, defend, use item, flee; advanced: combo, counter, feint, all-out; class verbs.
- Damage: `weapon + stat modifier`; crit = base*2; resistance is percentage, armour is flat.
- Status effects: bleed (DoT, halves healing), burn (DoT, spreads), freeze (0.7 movement,
  shatter), poison (DoT, stat reduction), stun (1 to 3 turns).
- Flee is always available; success is a check against initiative and the encounter's pursuit
  value, and a failed flee costs a free enemy turn.
- **Snapshots.** Player bosses and ambushers are loadout snapshots driven by a behaviour tree
  seeded from their class and, for champions, the lord's prompt.
- **Narration:** one paragraph after the fight, written by a small model from the combat log.
  Nothing per turn.

## 8. The Referee and `Defy fate`

**The main loop has no model.** Move, examine, attack, defend, buy, sell, craft, rest, talk to a
known NPC option: all are buttons or slash commands with template text. A fuzzy matcher maps typed
phrasings of known verbs ("hit the goblin") to commands; that is string matching, not a model.

**`Defy fate` is the single freeform entry point.** The button label is `Defy fate`. Tapping it
shows *"Take control of your destiny. What do you do?"* and opens text input. This is the only
place in the game a player types a sentence, and it is where the player attempts something the
game did not anticipate.

**Cost and gating.** Each attempt spends focus pool. The check is improved by cunning and guile
(and presence for social attempts), so the aging curve makes elders the best improvisers.

**The contract.** The Referee (small model) receives: the room and its prose, the character's
stats, class tags and inventory, the floor's modifiers, the character's groups (charter, standing,
relations), the last few events, and the player's text. It returns strictly structured JSON:

```
{
  "action_class": one of [negotiate, deceive, intimidate, sneak, tinker, inspire,
                          investigate, evade, other],
  "governing_stats": [up to 2 primary stats],
  "audacity": 0..3,
  "target": room entity id or null,
  "intent": one sentence, for the log
}
```

Code then: computes the DC from the action class, the entity, the floor modifiers and audacity;
rolls against the governing stats; and applies an outcome from the **bounded outcome table** for
that action class (e.g. negotiate: discount, safe passage, information, a new dialogue option;
tinker: disable a trap, open a shortcut for this instance, improvised weapon with fixed stats).
The model then writes the narration from the actual result.

**Hard bounds.** The Referee cannot: kill or damage the character directly, grant shards beyond
the outcome table's cap, create items outside the table, change floor state, touch any other
character. The narration text never carries state. Prompt injection therefore yields a paragraph,
not a result.

**Every attempt is logged** with the text, the structured proposal, the roll and the outcome. This
improvise log is the Chronicler's primary input.

## 9. Groups

Groups are one object with two rules: a **join rule** and a **succession rule**. A character holds
at most one group per category, so at most three affiliations, and they never compete for a slot.

| Category | Join rule | Leaving | Later skins |
|---|---|---|---|
| Family | by inheritance (your heir is born into it) | impossible; you can be disowned | clans, bloodlines |
| Order | by oath | oath-breaking: personal curse candidate, standing hit on the next group joined | schools, religions |
| Company | by invitation | free | guilds, trading houses |

**Minimal group object:**

1. Identity: name, founder, founding date (a chronicle entry), and a **charter**: short text the
   Referee and Chronicler read. Doctrine and curriculum live here later.
2. Members and roles: leader, officer, member.
3. Vault: shared shards and items, role-based permissions.
4. Holdings: floors held, monuments attributed to the group.
5. Standing: group-level reputation. Feeds NPC reactions and lets the Chronicler attribute group
   deeds.
6. Relations: one value per pair of groups: neutral, allied, at war.
7. Modifiers: buffs and curses (below).
8. Chat: a Telegram group with the bot. The group's chronicle events, votes and vault actions
   happen there. This is the guild hall and the game's only live layer in v0.

**Succession rules** (per category defaults, overridable in the charter for orders and
companies): family to the eldest living member; order to the highest-ranked officer; company by
member vote within 48 hours, else highest-ranked officer.

**Modifiers (buffs and curses).** A modifier has a source, an effect on primary or derived stats,
and either a permanent flag or an expiry. Applied to every member. Sources in v0: standing
thresholds (high standing earns a blessing, collapsed standing earns a curse), oath-breaking, and
Chronicler projects targeting a group. Because a family is a group, a family curse is hereditary
and lifting it is a natural deed. Shrines (structures) become a source later.

**Creation costs and minimums** (placeholders): family, free at first inheritance; order, 3
members and 7,500 shards; company, 5 members and 10,000 shards. Weekly upkeep scaled on size.

## 10. Conflict

Principle 4 governs everything here.

**Always allowed:** economic warfare. Cornering, dumping, undercutting, exclusive contracts.

**Consent by entry:** a held floor's traps and champion are hazards on a floor you chose to enter,
and the entry screen shows who holds it and the tax.

**War gates the rest.** An order or company may declare war on another. Declaration is unilateral
with a **24-hour delay** before it takes effect, announced to both group chats. War has upkeep
and ends when it goes unpaid or when both leaders agree to peace. While at war:

- **Ambush.** A member may lay an ambush against a member of the enemy group. The attacker's
  snapshot appears as an encounter the next time the target enters a wild room. Deterministic
  combat; the target can fight or flee; a loss is a fair loss. If the target dies, the chosen
  item drops where they fell (section 4), available to whoever passes next, including the
  attacker on their next visit.
- Ambushes are capped per attacker per day (placeholder: 1) and cost shards to lay.

Families cannot declare war. They can be cursed, and their standing can be attacked, which is how
a feud plays out.

**Deferred:** theft from vaults, assassination contracts, sabotage. All are trap-and-trace
mechanics under async and each needs its own bounded-loss rule.

## 11. Economy

Single currency, **Shards**, deliberately scarce. Regulation is deterministic; no model touches it.

**Faucets:** mission completion (`10 + floor*2`, times difficulty multiplier easy 1, medium 2,
hard 4, nightmare 10); loot; crafting margins (10 to 30%, quality by skill); trading; lord
passive income.

**Sinks:** estate burn on death (90%) or retirement (75%); floor entry; lord tax (up to 10%);
repair (10% of item value); crafting failure (materials and fee); group upkeep; war upkeep; ambush
cost; auction listing fee (1) and sale tax (5%).

**Markets:** per-floor boards, global access for a fee; auction with bid and buyout; escrowed
direct trade. Prices are floor-specific, so arbitrage between floors is a real playstyle.

## 12. Missions

Procedural, generated nightly with the floor prose. Types: combat (elimination, survival, boss
hunt, arena), exploration, stealth, puzzle, social, crafting, escort. Rewards: guaranteed XP and
shards; chance-based equipment, materials, recipes, lore; rare class-unlock progress, standing,
unique items. Difficulty scales on player level, floor, equipment, recent performance.

## 13. The Chronicler

The Chronicler is the game. It runs **weekly**.

**Inputs.** The improvise log (every `Defy fate` attempt, section 8) and the achievement log
(deterministic milestones: tower firsts, records, unusual state such as a group holding three
floors, a market cornered for seven days, a family curse lifted, a lord beaten on the first
attempt).

**Procedure.**

1. **Novelty scoring** (cheap model plus embeddings over the chronicle): for each candidate, has
   anything like this happened before, on this floor, this way, by this kind of character? Deeds
   that resemble past deeds score low. Rarity is enforced by ranking, not by hidden thresholds.
2. **Drafting** (strong model): the top candidates become one to three proposed causality projects,
   each expressed only in effect primitives (below), with a monument inscription and a chronicle
   entry.
3. **Validation** (code): bounds on every primitive, protected floors, stacking limits, no
   reversal of an existing project.
4. **Ratification** (designer, v0): approve, edit, or reject the JSON before it compiles. Community
   ratification is a later step, once the primitives are trusted.
5. **Compilation and broadcast**: the project becomes live rules; the monument is placed; the
   chronicle entry is written; every group chat receives the announcement.

**Effect primitives (v0):**

| Primitive | Effect | Bounds |
|---|---|---|
| `floor_tax_mod` | permanent tax modifier on a floor range | 1 to 10%, not on protected floors |
| `env_tag` | environmental condition on a floor range (storm, fog, ash) | not on protected floors |
| `graph_edge` | permanent shortcut or passage between floors or rooms | at most one per project |
| `npc_state` | permanent change to a boss or NPC (form, disposition, role) | one entity |
| `recipe_unlock` | a new recipe from existing components, available to all | must be craftable |
| `shrine` | a structure on a floor granting a small bonus to visitors or a group | one per project |
| `group_modifier` | a buff or curse on a group | bounded stat effect |
| `dampener` | reduces the effect of an earlier project, never removes it | references one project |

Cities and other structures are the next primitive category, deferred (section 15).

**Invariants.** Projects accumulate forever. They may enhance or conflict; conflicts are content
(a storm plus fog plus acid rain; two economic decrees creating a black market). Attribution is
permanent. Nothing is reversed; dampeners are the only counter.

**Monuments.** Name of the character and group, date, description of the deed, visitor counter,
offering slot. Visiting grants a small bonus; offerings feed the deed-doer's legacy points; a
visit has a small chance of related class-unlock progress.

**Chronicle.** Automatic record in ages (founding, exploration, conflict, prosperity, current).
Tracks firsts, records and unique achievements. Player-written histories and oral tradition (NPCs
retelling entries, distorted) are later.

## 14. Model usage

No model on the main loop. Models are called in exactly four places:

| Where | Model | Frequency |
|---|---|---|
| `Defy fate` (Referee) | small | a handful per session |
| Post-fight paragraph | small | one per fight |
| Nightly floor prose and missions | small | once per floor per day |
| Weekly Chronicler (scoring, drafting) | small for scoring, strong for drafting | once a week |

## 15. Beta scope and the "later" list

**In beta:** everything above, on floors 1 to 10, three biomes, four classes, Telegram as the only
client, designer-ratified Chronicler.

**Later, in rough order:**

1. Cities and structures: bridges, markets, training grounds, walls; a floor whose structures
   pass a threshold becomes a city (safe zone, market, a held place for everyone). City founding
   is itself a causality project.
2. Floors 11 to 20 and the opening of the gate as a world event.
3. Theft (and a stealable floor key), assassination contracts, sabotage.
4. Community ratification of Chronicler projects.
5. Sync moments: scheduled challenge windows, group raids.
6. Death prevention items; spectating and betting on challenges.
7. Bloodline traits, religion blessings, school techniques as skins on the group object.
8. More biomes and classes; oral tradition; player-written histories.
9. Additional clients (web, Discord, app); the 2D renderer if it ever earns its place.
10. Monetisation. Parked until the loop proves out; nothing that touches stakes.

## 16. Placeholders to tune

Aging rate (0.8 years/day), phase modifiers, starting age range, inheritance rates (10/25%),
entry cost formula, tax cap (10%), group creation costs, war upkeep and delay (24h), ambush cap,
focus pool cost per `Defy fate`, Chronicler cadence (weekly) and candidate count (1 to 3),
primitive bounds.
