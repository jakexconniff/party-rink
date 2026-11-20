# EXECUTION PLAN, ACCEPTANCE CRITERIA, AND PARTY-NIGHT RUNBOOK

**Deadline context:** Friday November 20, 2026 today; Saturday November 21, 2026 is target event. Aim to deliver before that, but never assert the game is ready until tests pass. We optimize for early working multiplayer vertical slices and very low owner involvement.

## 1. Development order — vertical slices, not component silos

### Milestone A — Phone QR join and TV connection (must work first)

Agent creates runnable repo with a single LAN HTTP origin and websocket server; `/tv` displays a QR code + join URL; `/join` permits up to 8 names and shows roster live. Test browser tabs can join from machine; test that the host is first joining person.

**Acceptance:** operator starts 1 command; TV shows LAN URL; 2 simulated clients join and TV roster updates; full room rejects 9th; errors visible. No hockey code required for A.

### Milestone B — Complete party flow

Agent builds state transitions, game card, Red/Blue team selection, per-player readiness, host settings, 3-sec countdown, results/rematch, local reset. Host succession and reconnect identity work. Use a fake/dummy match if hockey not ready.

**Acceptance:** eight scripted clients can traverse every phase; 3v4 permitted, empty-team/unbalanced setup forbidden; host-only actions enforced; refresh reclaims player; host loss doesn't permanently strand room.

### Milestone C — First PLAYABLE hockey match

Agent implements skater movement, rink, puck possession, basic shooting, collisions, goals, running clock, goalie baseline patrol, resets, results. Before visual polish, two browser clients should be able to skate and score.

**Acceptance:** autonomous simulation has finite positions after a 5–10 minute simulated run; player input moves correct skater; red puck in blue goal increments Red score exactly once; blue shot increments Blue once; clock decreases only in PLAYING.

### Milestone D — Full requested controls and mechanics

Add touch joystick and independent action buttons; charge shot, aim, coasting; pass aim assist; poke-check and contact steals; free puck interception; goalie reactive layer if time allows; client reconnect while playing; disconnected inputs neutralized. Test charge/pointercancel.

**Acceptance:** all mechanics in `03_HOCKEY_GAME_DESIGN.md` implemented and covered by tests or explicitly tracked gaps; 8-client smoke script completes lobby→results.

### Milestone E — Showtime usability and packaging

Polish TV rink readability, join page, two-button layout, team colors, skater IDs, error messages; run production build and smoke test, screenshot at TV/phone sizes if possible; add Windows quick start; verify LAN connection with two real phones if user can help.

**Acceptance:** clean install, build, tests, smoke work; operator runbook sufficient for a person with no development background; `KNOWN_ISSUES.md` transparent.

### Scope/quality gates

**Gate 1:** Stop adding features until QR join and two-phone input work on same LAN or equivalent simulated browser test.

**Gate 2:** Once match is playable, prefer robustness and clear UX to new features.

**Gate 3:** If all acceptance tests can't be completed, document exactly which pieces fail and provide a safe fallback. Never inflate a prototype into a 'fully polished, tested with eight phones' claim.

## 2. Acceptance matrix

| ID | Scenario | Expected result |
|---|---|---|
| A01 | Start on Windows | One documented command launches server and both UIs; HTTP health = OK |
| A02 | Open `/tv` | Displays QR with LAN IPv4 URL (not localhost), typed URL fallback |
| A03 | Join phone #1 | Sets name, player #1, recognized as host |
| A04 | Join 2–8 | All separate slots, names and team indicators visible |
| A05 | Ninth phone joins | Friendly "Room full" response, no state corruption |
| A06 | Host starts lobby with 1 player | Disabled/denied; with >=2 connected players allowed |
| A07 | Only one game in menu | Hockey card selectable by host, non-host cannot advance |
| A08 | Team selection | Each person picks Red or Blue; every member has a Ready control |
| A09 | Teams 3v4 | All ready -> Next enabled; teams 2v4 -> denied due imbalance |
| A10 | Team not ready | Cannot leave teams until all are assigned and ready |
| A11 | Host chooses duration | 5/10/15 choices, no arbitrary values accepted |
| A12 | Match start | 3-2-1 countdown then move and timer start |
| A13 | Controller thumb input | Joystick + button can operate simultaneously; no scrolling |
| A14 | Shooting | Tap works, hold increases speed, left stick changes aim not acceleration |
| A15 | Passing | Released puck travels toward aim/teammate, can be intercepted |
| A16 | Stealing | Poke and contact can steal; no infinite same-frame ping-pong |
| A17 | Goalies | Patrol/deflect, no field-player bot, shots can still score |
| A18 | Goal | Score increments once, clock pauses, faceoff restores puck/positions |
| A19 | Match end | Correct final score and winner/draw, replay works |
| A20 | Disconnect and reconnect | Input stops; player reclaims skater via token; no duplicate slot |
| A21 | Host disconnects | Reconnect or new host / laptop admin can progress |
| A22 | 8-client simulation | Script completes all flow with no crashes/NaN/state violation |
| A23 | Production build | Builds without type errors; no required cloud credentials |
| A24 | TV display | Whole rink, puck, teams, goalie, labels, scoreboard readable at 1080p |
| A25 | Portrait phone | Buttons and stick usable on 390x844 class viewport |

Agent must mark each test as PASS / FAIL / UNVERIFIED in `TEST_REPORT.md`.

## 3. Automated testing without eight physical phones

The agent MUST create a script `npm run smoke:8` that connects eight simulated Socket.IO phone clients to the actual running server and:

1. Resets a dev-only test room or starts clean in an isolated instance.
2. Joins names `Player 1` through `Player 8`; assert host is Player 1, all IDs unique, no 9th allowed.
3. Chooses Hockey; assigns 4v4, readies all; selects 5-minute match; advances through countdown.
4. Streams distinct random movement vectors, repeated state changes (shoot tap/charge, pass), several thousand simulation ticks, asserts snapshot positions finite and no exceptions.
5. Triggers a legitimate scoring scenario via simulation fixture/dev-only hook (never callable by production phones) and checks score/goal reset.
6. Exits by simulated fast-forward/clock override in development test mode, checks results and rematch.
7. Repeats setup for a separate 3v4, seven-player room. Test reconnect, stale packets, and host disconnect/succession.
8. Prints clear final PASS/FAIL and exits nonzero on failure.

Add `vitest` (or comparable test runner) to test pure physics and room state transitions. A Playwright smoke is useful if available but NOT required if dependency/browser download would jeopardize shipping.

Do **not** use fake socket mockups alone to claim "8 players supported"; at least one test should exercise real socket communication. Eight browser tabs or actual phone tests are an additional bonus.

## 4. Windows + TV quick-start — write this into the actual README

1. Ensure Node.js LTS installed on Windows (or bundle the built app if possible; not required).
2. `npm install` then `npm run dev` or documented `npm start` after build.
3. Confirm console prints `http://localhost:3000/tv` and `http://<LAN_IPV4>:3000/join` (port may differ if configured).
4. Ensure laptop is on **home Wi-Fi (not guest network)**; if Windows asks for a firewall rule, allow Node on the **Private** network. Prefer keeping game restricted to LAN.
5. Connect laptop to TV with HDMI, mirror display or put TV browser fullscreen. Open laptop `/tv` page.
6. Use a phone on same Wi-Fi to scan QR. If it fails, type URL and test `/health`. If nothing connects, try another detected LAN IP or the provided `LAN_IP` override. Verify AP/client isolation is disabled.
7. Have host join first, guests join, host chooses Hockey, guests select teams and Ready, choose duration, press Start.
8. Disable laptop sleep for duration of gathering and connect power adapter. Keep server terminal running. Keep phone browsers foreground; optional lock-screen timeout adjustment can help but should not be mandatory.
9. If someone reloads, reconnect with same phone; if one person is stuck, see host succession/reset instructions.

### Pre-party dry run with owner (minimal time)

- **2-minute check:** Start app; open TV; scan QR from own phone; verify name appears.
- **3-minute check:** Second phone joins; host can progress; team selection/ready works; start a dev-short match on test build or at least trigger countdown.
- **3-minute check:** Skating, Pass/Poke and Shoot, goal, clock, reconnection after reload.
- **Optional additional time:** Gather more phones/clients to validate 6–8 concurrent connection counts.

### Common issues / fixes

- **QR opens `localhost`:** server is advertising incorrect URL. Set `LAN_IP` to laptop's IPv4 from `ipconfig` or select correct interface on TV; refresh QR.
- **Phone browser says cannot connect:** confirm same LAN; check firewall private-network access; type `http://<LAN_IP>:3000/health` from phone; avoid guest Wi-Fi/client isolation.
- **Laptop connected by ethernet and phones on Wi-Fi:** often works when same LAN; some router segmentation does not. Try laptop Wi-Fi instead.
- **Screen locks on phone:** reconnect and reclaim seat; inputs neutralize. Avoid requiring phone to stay active in background.
- **Lobby host gone:** reconnect on same device or use host succession, then host restarts/continues. Laptop admin can reset.
- **Bad performance:** reduce cosmetic animation, not simulation correctness; close unrelated laptop apps; use 1080p resolution; keep network local.
- **Run command failed:** check Node/npm installation, dependencies, in-use port, and exact error. Do not alter firewall/security broadly to fix a local party game.

## 5. Final output the coding agent owes the owner

- Repo working files, not only prose or a TODO.
- Exact run commands for Windows, in 5–8 short steps.
- Current test report: number passed/failed/unverified.
- What the agent actually tested (real browsers, automated simulated clients, or physical phones).
- Known bugs, including anything that could spoil a live party.
- One suggested safe fallback if the app is not fully reliable.
- No claims of asynchronous background work or tomorrow delivery; everything reportable must be work already completed.
