# MASTER IMPLEMENTATION PROMPT — Paste into Codex / ChatGPT Work

You are the **lead engineer, game designer, QA engineer, and release engineer** for a new local multiplayer browser party game called **Party Rink** (working name).

**Your job is to IMPLEMENT a working repository, run the app, write automated tests, fix failures, and leave a concise operator runbook. DO NOT return only an architecture proposal or ask me to code things.** You have discretion on minor details; use the attached specifications as binding product requirements. I have a near-term gathering Saturday evening, November 21, 2026, so optimize for a functional and pleasant-to-use MVP rather than breadth, fancy visuals, or speculative future architecture. The date is a target; do not claim completion or device validation you have not actually achieved.

## Read these files fully first

- `00_START_HERE.md`
- `02_PRODUCT_REQUIREMENTS.md`
- `03_HOCKEY_GAME_DESIGN.md`
- `04_TECHNICAL_DESIGN.md`
- `05_EXECUTION_AND_QA.md`
- `06_DEFERRED_BACKLOG.md`

If you are starting in a blank workspace, copy the handoff files into the repository under `/docs` before implementing. If the files cannot be accessed, request them once rather than silently approximating the design. Otherwise **do not ask clarifying questions**: choose the spec's defaults, record assumptions in `DECISIONS.md`, and proceed.

## Build the product

Implement **one local-network room with 2–8 phone players**. A Windows laptop displays `/tv`, a TV-friendly 2.5D arcade ice rink with a QR code when no match is active. Phones navigate to `/join`, enter short display names, and become controllers after joining. The first actual phone participant is party host. Host advances: **Lobby → Game Selection (single Hockey card) → Team Selection / Ready → Match Settings (5/10/15 minutes) → 3-second countdown → Hockey Match → Results → Replay**. First host can start; a simple laptop-side administrator fallback and host succession avoid a dead session. Red defends left, Blue defends right. No accounts, bot field players, cloud, database, or paid APIs.

In a match, each phone shows a **portrait, thumb-friendly virtual analog joystick left**, huge **PASS / POKE** and **SHOOT** buttons right, team/name/connection feedback. All the players appear on the TV at once. Controls are responsive, support multitouch, and recover from pointercancel/blur/disconnect. The puck may be carried, passed, shot (tap or charge with coasting and stick-aim), intercepted, and stolen on contact or via poke-check. Automated goalies patrol and imperfectly react to incoming pucks. Goals increment score and reset the faceoff; clock counts down only during active play; results show score and winner or tie. See exact state/rules in attached files.

## Implementation guidance

- Prefer **TypeScript, React + Vite for UI, Node.js + Socket.IO**, and a lightweight **HTML Canvas 2D** renderer with 2.5D visual treatment. Do NOT add a full 3D engine, cloud service, database, or asset pipeline. Phaser is optional only if faster for you; don't add dependency complexity without a direct benefit. No external art assets required.
- One server process serving both pages and sockets on **a single LAN-reachable port (default 3000)**, in development and production if feasible. Expose `/health` and show the correct IPv4 QR URL; support overriding the advertised LAN IP.
- **Server authoritative** match state, fixed-step simulation, bounded/correctly validated input, snapshots to TV. No trusting phones to provide game physics or scores. Deterministic-enough pure functions for important gameplay logic; avoid browser-specific game simulation.
- Draw original, pleasant, readable visuals with no external assets: ice, boards, center line, faceoff spots, team-colored pseudo-3D skaters, goals, puck, goalie, shadow, player labels, on-screen scoreboard, prominent countdown and goal celebration.
- Phone screen and TV both show phase, errors, and reconnect states clearly. Handle actual same-LAN IPv4 and Windows firewall guidance. Do not use browser APIs requiring HTTPS (except where optional graceful fallbacks exist), as players open an ordinary `http://<laptop-lan-ip>:3000/join` URL.
- Keep phone reconnect identity via a secure-ish server-issued opaque token saved on that browser, not socket.id. Preserve host role and slot across brief reloads, reclaim on reconnect. Rate-limit/validate events. Prevent controls remaining pressed on disconnect.
- Favor **two action buttons**; PASS is contextually POKE when not carrying the puck. Do not quietly introduce a mandatory third button.
- Match max is 8 human skaters total. Allow 3v4, 2v3, and other 1-player imbalances; both teams must have at least one skater, and require difference ≤1 to begin (communicate this in UI). No skater AI.

## Work autonomously in this order

1. **Create and run** the simplest LAN-capable server and both pages, then get QR → name → server join working immediately.
2. Implement player identities, host flow, phase transitions, team selection, readiness, durations, reconnects, and a basic TV UI.
3. Implement minimal server-simulated game with all players and goal scoring, verified by local automated clients. Make this playable BEFORE visual styling.
4. Add complete phone multitouch controller, passing, charge-shoot/aim, possession/interception, steals, goalie, collision handling, clock/faceoff/results.
5. Improve legibility, animation, error handling, and performance. Run 8-client smoke tests and physics/unit tests. If practical run browser UI tests in the environment.
6. Produce a concise `README.md`, `QUICK_START_WINDOWS.md`, `TEST_REPORT.md`, and `KNOWN_ISSUES.md` showing exact commands, test results, things not manually verified, and showtime recovery steps.

## Completion standards

- `npm install` and one documented command must work from a clean checkout. Include scripts `dev`, `build`, `test`, `smoke:8`, and `start` (or precise equivalents in README).
- `npm run build` and all tests must pass. `smoke:8` connects eight automated clients, includes a 3v4/4v4 scenario, drives lobby → match → goal/time progression → results, and reports success/failure visibly. No claim of physical-device testing unless actual phones were used.
- Include deterministic tests for: host assignment/reclaim, capacity/name validation, valid/invalid team setups, shot charge & aim, passing/receiving, cooldown after steal, goal detection, goalie deflection, clock pause, goal reset, disconnect/input release.
- Include **development-only shortcuts** (e.g., rapid match clock and automated scripted scoring) for QA, strictly disabled/hidden from production party UI. Never force the host to wait through five minutes just to verify the flow.
- Live full-screen TV view should remain clearly readable at 1080p. The phone controls should be comfortable on a small iPhone; no requirement for landscape or installed app.
- Add one-button **Restart Lobby** from laptop-side admin controls and **Play Again** on results; fail safe if host disconnects.
- On final output, give me **a short step-by-step path** to start the game on my Windows laptop and connect phones, followed by an honest pass/fail report and any blockers, not a long description of your process.

## Scope discipline and escalation

**Never sacrifice a functioning multiplayer hockey match to implement:** avatars, team-color picker, character roster, complex animations, powerups, camera rotation, a board game, multiple arenas, matchmaking, game catalog, bots, machine learning, goalie intelligence, online play, local persistence beyond reconnection, sound design, or advanced physics.

If the deadline becomes unrealistic, **make deliberate cuts in this order**: (1) decorative effects, (2) animation polish, (3) enhanced goalie reactions (retain scripted patrol), (4) fancy collision resolution (retain basic collisions), (5) charge UI presentation (retain tap shoot and functioning charge when possible). **Do not cut** QR join, all-player input, host flow, teams, clock, puck possession, scoring, or reliable recovery. Explain any remaining feature gap without claiming it is complete.

You may make sensible implementation decisions without checking with me. Only stop to request my action for true external blockers (device firewall authorization, installation permissions, a required network setting, or local testing that can't be emulated). Do not change the design by repeatedly asking permission.

**Begin by inspecting the workspace, then implement the first working vertical slice now.**
