# Causality

Hardcore text tower-climber, one shared world, one shared history. Rare exceptional deeds become
permanent, stacking, attributed changes that every future player lives with.

## Documents

- `design/spec-v2.md` - the design as decided on 2026-09-05. Source of truth.
- `design/telegram-v0-architecture.md` - v0 architecture: pure game core, Telegram as the first
  adapter, build order.
- `design/causality-spec-v1.0.0.json` - the original spec, superseded, kept for reference.

## Status

Design done for beta. No code yet. Next step is build order step 1 in the architecture doc.

## Decisions log (2026-09-05)

- Text only, async, Telegram first, core kept client-agnostic so the game is multi-format.
- No model on the main loop. Models only on `Defy fate`, post-fight paragraph, nightly prose,
  weekly Chronicler.
- Beta capped at 10 floors; floor 10 boss beatable, gate to 11 sealed until floors 11 to 20 ship.
- Groups: three categories (family by inheritance, order by oath, company by invitation), one of
  each per character, with charter, vault, holdings, standing, relations, buffs and curses.
- Death: estate passes 10% (25% if retired); chosen item passes only in a held place, otherwise it
  drops where you died.
- Lords: member-only; seat passes within the group unless slain in the floor challenge.
- PvP: no character can be lost to something it could not act against; war (24h delay) gates
  ambushes; theft, contracts and sabotage deferred.
- Heirs must be prepared and accept while you live; a spiritual heir (outside the game) is the invite path.
- Shards non-redeemable through beta; heirs free, a fresh bloodline is paid; chronicle daily as news, weekly as world changes.
- Cities and structures deferred, listed in the spec's "later" section.
