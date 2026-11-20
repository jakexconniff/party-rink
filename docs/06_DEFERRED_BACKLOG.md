# Deferred features / future party-game platform

These are intentional deferrals, **not missing MVP requirements**.

## Future iteration 1 — Hockey refinements

- Custom team colors chosen by first team member (team captain), with minimum contrast requirements.
- Character/jersey/avatar selection, including playful silhouette variations, nameplates, and celebration animations.
- Full 3D rink, 3D skaters, optional camera shake, richer lighting/ice reflections.
- Better goalie strategies/difficulty sliders, controlled manually by a player, or smarter shooting prediction.
- Bot **field players** to balance odd teams, or time-limited powerplay handicaps. No bots in MVP.
- More arenas, obstacles or arcade powerups, alternate rule presets, configurable match duration beyond 5/10/15.
- Highlight replay, player stats, assists, saves, custom music, announcer, satisfying audio.
- Tournament brackets, multi-match aggregate scores, MVP awards.
- Phone options: button size/swap, left-handed mode, accessibility/color-blind palettes, vibration on supported phones.
- Teams switching sides, overtime or shootout; MVP permits draws.

## Future iteration 2 — Multi-game collection

- Make lobby, QR joining, host privileges, team management, round settings, scoring, and controllers reusable across multiple minigames.
- Examples: dodgeball arena, bumper battle, racing/obstacle sprint, capture-the-flag, platform survival, arena tag.
- Each game registers its game description, team format, controls, simulation module, and TV renderer; the platform retains roster/host/connection/reconnect.
- Add party series scoreboard and round-robin voting; optionally a board-game metagame **after** minigames work well.
- Shared touch-controller primitives: analog stick, binary button, hold/charge, directional swipe; controls can vary by game but retain familiar layout.

## Future iteration 3 — Operational maturity

- Multi-room PIN entry and secure public internet hosting.
- Lobby/spectator mode, mid-match drop-in/drop-out, team rebalancing, admin kick / moderation.
- Persistent identities and player stats; database and cloud persistence only if a real need emerges.
- PWA install/offline caching (needs HTTPS in normal cross-device browsing), cross-network play, low-latency diagnostics.
- Native or Bluetooth controller support if the party wants alternate input devices later.

## Architecture guidance for MVP

Maintain light seams without over-engineering:

1. `Room/PartyState` vs `HockeyMatch` should be distinct concepts.
2. Lobby/game selection should not assume the only conceivable game is hockey, but no extensible plugin system needs to be built now.
3. Controller input should be represented as a clean data structure rather than direct DOM references in the game engine.
4. Keep configurable physics/constants in one place.
5. One playable game now is far more valuable than a beautiful empty framework.
