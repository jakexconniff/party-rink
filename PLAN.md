# Party Rink — Build Plan (condensed)

Full specs: `docs/00–06`. Where this file and the specs disagree, the specs win. Target date: Sat Nov 21, 2026.

## Product
A local-network arcade hockey game for 2–8 players, Red vs Blue. The laptop serves `/tv` on the TV and phones open `/join` as controllers. There is no cloud, database, accounts or bot skaters. Each team gets one scripted goalie.

## Stack
TypeScript, Node, Express, Socket.IO v4, React and Vite (as Express middleware so dev runs on one port), Canvas 2D, `qrcode` and vitest. Everything runs on one port (3000) bound to 0.0.0.0. It exposes `/health` and accepts a `LAN_IP` override.

## Layout
`server/` (index, room, protocol, simulation/{game,physics,goalie,config}), `client/` (pages Tv/Join, Joystick, TouchActions, RinkCanvas), `shared/types.ts`, `scripts/smoke-eight.ts`, `docs/`.

## Phases (the server is the only authority)
LOBBY → GAME_SELECT → TEAMS → SETTINGS → COUNTDOWN(3s) → PLAYING ↔ GOAL_PAUSE(2s) → RESULTS → Rematch (back to TEAMS with ready cleared) or New Game (back to GAME_SELECT).
- **Host:** the first player to join. If the host disconnects, the role passes to the oldest connected player after a short grace period.
- **Admin reset:** an admin reset is available from localhost only.
- **Lobby:** the host can start once 2 or more players are connected.
- **Teams:** to advance, every player must be on a team and ready, both teams must have players, and the size gap must be ≤1.
- **Joining:** new joins are closed from COUNTDOWN on. Existing players can still reconnect with their token.
- **Identity:** each phone gets an opaque token from the server and stores it in localStorage. The server keeps only a hash of the token.

## Game rules (constants go in `config.ts`)
- **Rink and goals:** the world is 1200×680 and the ice spans x 64–1136, y 48–632. The goal mouth is y 276–404. Red defends the left goal and Blue the right. A goal counts once the whole puck crosses the line.
- **Skating:** max speed 230, acceleration 260, coasting deceleration 180. Skater radius is 16 and puck radius is 9. The joystick dead zone is 0.13.
- **Possession:** any skater who touches a loose puck takes it. Collision checks are swept so fast pucks can't pass through. The shooter can't recatch for 250 ms, and a new carrier is safe from steals for 300 ms. Bumping the carrier steals the puck, at most once per immunity window.
- **Pass / poke button:** with the puck it passes at speed 450, assisted toward a teammate within a ±45° cone and 450 units, with a 350 ms cooldown. Without the puck it poke-checks with 55 range in a narrow arc and a 650 ms cooldown.
- **Shoot button:** holding charges the shot over 1.5 s, from speed 360 up to 780. While charging, the stick aims instead of moving the skater and drag rises to 220. A cancel or disconnect drops the shot without firing.
- **Goalies:** goalies stay at x 105 and 1095 and move only up and down. They patrol y 292–388 on a seeded ~3.5 s cycle. When the puck heads toward the net, they react after a 200–350 ms delay at up to ~175 units/s. On a save, the puck deflects outward. Goalies must miss sometimes.
- **Clock:** the clock runs only during PLAYING. The match ends at 0:00, and a draw is allowed.
- **Disconnects:** the player's input is cleared at once and the skater stays idle. The player can reclaim it.

## Network
- **Phone input:** phones send `{seq,x,y,passDown,shootDown}` at 20–30 Hz. The server clamps values, detects button edges and rejects stale seq numbers. Input goes neutral after 500 ms of silence.
- **Simulation:** the server runs a fixed 60 Hz tick.
- **Updates:** the TV gets snapshots at about 30 Hz. Phones get a low-rate `controlState`.

## Build order (each milestone gates the next)
- **A:** server, QR/URL, join, live roster, 9th player rejected.
- **B:** full phase flow, teams and ready, host succession, reconnect, admin reset, using a dummy match.
- **C:** a playable match with movement, puck, tap-shoot, goals, clock, goalie patrol and results.
- **D:** joystick and buttons with multitouch, charge and aim, pass assist, poke and contact steals, reactive goalie, reconnect during a match.
- **E:** readability polish, prod build, `smoke:8`, docs.

Cut order if time runs short: decorative effects → animation → goalie reactions → collision finesse → charge UI. Never cut QR join, inputs, host flow, teams, clock, possession, scoring or recovery.

## Done means
- `npm install`, `dev`, `build`, `test`, `smoke:8` and `start` all work.
- `smoke:8` uses real sockets for 8 clients through the whole flow, including 4v4 and 3v4 rooms, a dev-only goal hook, fast-forwarding the clock, reconnect and host succession.
- Unit tests cover the list in docs/01 and docs/03 §8.
- Deliverables: `README`, `QUICK_START_WINDOWS`, `TEST_REPORT` (A01–A25 marked PASS/FAIL/UNVERIFIED), `KNOWN_ISSUES` and `DECISIONS`.

## Decisions taken (defaults, recorded in DECISIONS.md)
- Duplicate names are allowed. The TV and phones show them as "#N Name".
- A disconnected player during TEAMS is left out of the ready check. A disconnected player still counts toward team balance until removed by host Back or a lobby reset.
- The faceoff puck starts loose at center, so the first skater there takes it.
- `AGENTS.md` instructions apply to Claude Code. Codex isn't required.
