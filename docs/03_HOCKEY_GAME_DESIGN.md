# HOCKEY GAME DESIGN — Mechanics specification

**Intent:** A quick-to-learn, hectic, original arcade hockey game for **2–8 human skaters** split into Red and Blue. Accessibility and fairness on touchscreen are prioritized over simulation realism.

This document defines a stable gameplay contract. Numbers are **starting tuning constants**, not claims of final balance. Keep all constants in a readable `gameConfig.ts` so the agent can tune during automated tests.

## 1. Rink, camera, teams

- Entire rink visible at all times on `/tv`; fixed elevated perspective. Do not implement tracking camera. Match world coordinates are **1200 × 680 arbitrary units**; renderer scales to TV aspect while keeping full playable boundaries in frame.
- Playable ice rectangle from **x=64..1136** and **y=48..632**, preferably rounded rink corners in rendering (collision may use simple rectangle for MVP).
- **Authoritative convention:** RED defends the **LEFT** goal (x≈64), BLUE defends the **RIGHT** goal (x≈1136). Red scores by moving the puck across the right goal line; Blue scores across the left. Apply consistently in code, labels, and UI.
- Goal mouth at y=276..404. Entire puck must cross the goal line inside mouth: right score when puck's trailing edge crosses x=1136 at valid y; left score when puck's trailing edge crosses x=64 at valid y. Outside mouth, boards reflect puck.
- Player colors are fixed red / blue, up to 4 skaters per team (8 total). Assign numbered skater IDs 1..8 and a short visible name; skaters visually distinguishable even at distance.
- Goalie is not a player and does not count against 8 participants. Both sides always have one automated goalie.
- Draw original art using Canvas shapes: ice gradient, rink lines, boards, goal nets, soft shadow, simple cylindrical/head + torso skaters with helmets, puck with clear edge/drop shadow, skater name labels, charge line, goalie in contrasting outline. "2.5D" means pseudo-volume and shadows, **not a WebGL/3D requirement**.

## 2. Movement and collision

### Inputs

Each phone sends a normalized vector `(x,y)` with each axis in [-1,1], radial magnitude <=1. A dead zone (recommended radius <= 0.13) snaps center to zero. The same joystick is used for movement during normal skating and **aiming during a held shot**. Aim changes MUST NOT accelerate the skater while charging.

### Skating

- Starting `maxSpeed = 230 units/s`, `acceleration = 260 units/s^2` (~0.9 seconds to top speed), `coastDecel = 180 units/s^2`, `turnAssist`/lateral friction sufficient for mobile users to correct trajectories. Avoid unrealistically slippery controls.
- With stick input, accelerate toward input direction; preserve some prior velocity while changing direction. With stick released, gradually slow rather than stopping instantly.
- During charge shooting: disable joystick acceleration; player continues sliding under **stronger drag** (e.g., 220 units/s²) from existing velocity. Shoot aiming reads stick direction. If aiming stick is neutral, preserve last valid aim/facing, else prefer direction toward opposing goal.
- Skater radius around 16 world units; puck radius around 9. Movement resolves boundaries; players may bump/push one another with gentle separation, not ghost through one another.
- **No body-check button** in MVP. Contact-based possession steal is the passive defense mechanic; on a collision with current carrier, opponent can steal subject to an immunity timer.

### Respawn/faceoff setup

- At the start and after each goal, line up skaters deterministically with team members in their half of the rink and leave center ice clear. Calculate formations for team sizes 1..4 per side.
- Puck spawns loose at center `(600,340)`, zero velocity. The countdown prevents motion until `PLAYING`.
- Goal pause 2 seconds, scoreboard updates immediately; show clear `RED SCORES!` / `BLUE SCORES!`, reposition everybody and resume. Do not restart whole match clock.

## 3. Puck model and possession

States: `LOOSE`, `CARRIED(playerId)`. An incoming puck is loose even if a shot or pass; type (`shot`/`pass`) may be visual metadata but collision pickup is possible.

- Carried puck is visibly tethered near the carrier's forward skating direction, ~22–26 units away. It follows the skater until they release/pass/shoot/are dispossessed.
- On collision with a loose puck, **a human skater automatically intercepts and gains possession**, even for a moving pass or shot. This is essential to the product owner's stated goal. Do not limit pickups to slow pucks. Use swept segment/circle checks or equivalent adequate collision handling so a fast puck doesn't tunnel through a defender.
- The player who just launched the puck cannot immediately recapture their own shot/pass for ~250 ms. New possessor receives ~300 ms protection from being *instantly stolen by overlap*, but puck remains eligible for legitimate movement/passing.
- **Goalies** do not possess puck: they deflect it outward with damped reflection. Rink walls bounce the puck; applies speed damping and friction. Loose puck slows gradually; ensure it never becomes irretrievably stuck in or behind a goal.
- Suggested puck shot speed **360–780 units/s** based on charge. Pass around **450 units/s**. Simulation updates must clamp speed and prevent NaN/infinite positions. Tunable friction defaults should be playtested by bots.

## 4. Controls and actions

### PHONE layout (portrait; physical thumb reach)

- **Left 55%:** oversized fixed or floating circular analog joystick; continuously sends vector, up to ~20–30 times/sec, only when changed / capped.
- **Right 45%:** two distinct big touch buttons: **PASS / POKE** and **SHOOT**. No third required button.
- Use browser Pointer Events with independent pointer IDs so two thumbs work at once; pointer capture; `pointercancel`, `pointerup`, `lostpointercapture`, window blur, visibility change all release correctly. Set `touch-action: none` for gameplay controls, prevent zoom/scroll on controls. Must work without haptics and without HTTPS-only features.
- TV renders both teams, player labels, puck, charge arrows and ownership indicator. The player sees team, name and button feedback on phone. Keep game-critical feedback on TV as well.

### PASS / POKE contextual button

**When carrying:** Tap PASS -> puck is launched in the currently facing/stick direction (or toward nearest eligible teammate in a forward cone if one exists). Pass is *assisted but not a teleport*: a real moving puck, interceptable by opponents and teammates. Default pass aim cone ±40–50 degrees, max lock range ~450 units, if no candidate use aimed direction. If at least one teammate is present, aim assistance should make a reasonable pass more likely to succeed; no automatic requirement to select a teammate. Cooldown ~350 ms.

**When not carrying:** Tap same button -> **poke-check** directed along the player's facing/stick direction, range ~55 units, narrow forward arc. If an opposing carrier is in range, steal possession; otherwise optionally nudge a loose puck. Show brief stick extension / spark; cooldown ~600–700 ms. A failed check does not lock skating movement. A defensive PASS/POKE is a deliberate user action, distinct from simply bumping into someone.

### SHOOT tap or charge

**When carrying:**

1. On button press, enter `CHARGING`; player keeps their pre-existing skating momentum, with coasting, but stick input stops controlling acceleration and instead sets aim. Show an arrow toward current aim on TV and a visible fill/progress ring on phone.
2. Charge increases to full over **1.5 sec**. A short tap must still create a valid weak shot (minimum ~360 units/s). Shot speed interpolates to ~780 units/s. Maximum charge is capped; continued holding doesn't build infinite force.
3. On button release, launch puck in current aim direction, incorporating at most a small amount of skater momentum. Puck becomes loose, interceptable by players and goalie. Apply an anti-self-recapture grace window (~250 ms).
4. When touch is canceled/disconnected while charging, **cancel the charge safely** (no unintended shot) and restore locomotion; other player state remains consistent.
5. If player loses possession during charge, cancel charging and do not fire an invisible/duplicate puck.
6. If the shoot button is tapped without possession, do nothing with subtle feedback; do not spend time implementing a separate check command.

**Shoot aiming defaults:** On charge begin, start from stick direction if sufficiently nonzero; else prior facing direction; else toward opponent goal. Joystick motion while charging changes aim. Show arrow on TV for player comprehension. Do not aim toward the player's own goal automatically unless explicitly chosen.

### Interception and steals

- A skater colliding with a loose puck acquires it immediately (unless recently released by that same skater).
- An opposing skater colliding with a carrier steals it if the victim is not inside post-pickup protection; cooldown should avoid ping-pong possession every simulation tick. Preserve realistic arcade collision separation.
- Poke-check can also steal if facing and in reach, using same protection/cooldowns.
- Teammates do not steal from teammates by collision; they may receive passes/loose puck if unowned.
- On any possession change, client/TV sees obvious ownership ring or short flash.

## 5. Automated goalies — scripted, NO skater AI

Two goalie entities, permanently assigned to their own goal at x≈105 (Red) and x≈1095 (Blue). They move **only vertically** within safe y bounds around their own goal mouth, never roam the rink. Render padded body, outlined glove/stick, a small goalie shadow.

**Behavior states**:

1. `PATROL`: sinusoidal or smooth ping-pong between y≈292..388, period ~3.5 seconds; vary period/phase **slightly and deterministically** (e.g., seeded at match start) to avoid perfect metronome timing.
2. `REACT`: when puck is loose and traveling toward own net in a danger area (within ~280 horizontal units), estimate future puck y on goalie plane. **React after ~200–350 ms**, with speed capped ~150–200 units/s. Blend target with patrol position; imperfect/limited prediction. Goalies MUST sometimes miss, especially angled shots and rebounds.
3. `SAVE`: on puck-radius collision, deflect outward into playable rink, change vertical component modestly, and briefly flash/glove animate. Do not teleport puck to a teammate. Keep collision/reaction cooldown short to prevent endless overlapping deflections.

**Important scoring geometry:** Goalies are separate from the goal-line test. A shot that passes the goalie and fully crosses the valid mouth should score. Avoid placing goalie in a location that blocks every shot. One goalie per team regardless of 1v1 to 4v4.

If time is short, **patrol + physical collision** is acceptable; drop reactive tracking before dropping core gameplay. DO NOT add pathfinding, behavior trees, ML, simulated goalie as a separate player, or bot skaters.

## 6. Match rules and timers

- Duration options **5, 10, 15 active minutes**, selected by phone host after team readiness. Clock pauses in COUNTDOWN, GOAL_PAUSE, RESULTS, and while the room is not active.
- 3-second opening countdown; release input at start so nobody accelerates before `GO`.
- Score one goal when the **entire** puck crosses opposing goal line through mouth. Clamp/treat collisions carefully to avoid double-goal triggers. Score updates exactly once per puck crossing.
- Goal pause 2 seconds, faceoff/reset positions, resume same match clock. Optional next 1-second `Ready` banner if visually helpful, but avoid excessively delaying a long match.
- At `00:00`, freeze state and show results. Red wins, Blue wins, or Draw. **No overtime** MVP.
- If a client disconnects mid-match, server clears their input and charging immediately; show disconnected marker. Reserve their skater for ~30 seconds, then keep idle in place (or move off ice when safe) until match ends; they may reconnect to regain their skater. Never transfer their control to a bot.
- Server controls all simulation and scoring; never allow clients to set position, puck state, goals, time, or team after the match starts.

## 7. Balance / tuning boundaries

- `playerMaxSpeed`, `playerAccel`, `coastDecel`, `puckShotMinSpeed`, `puckShotMaxSpeed`, `puckPassSpeed`, `pokeRange`, `pokeCooldown`, `loosePuckDrag`, `goalieSpeed`, `goalieReactDelayMs`, `goalMouthHeight`, `goalieSaveRadius` and timing constants in one file.
- Keep a predictable 60-ish FPS render loop; simulate at fixed 30 or 60 ticks/sec server-side. Apply delta accumulator and cap catch-up steps.
- If 8 skaters overwhelm the rink, enlarge playable rink or slightly reduce collision radii rather than removing people.
- Fix "no goal can ever be scored" and "every shot always scores" before cosmetic issues. A scripted test should be able to score and save goals.
- Feel is **arcade hockey**, not actual NHL rules: **no offside, penalties, icing, team lineups, stamina, faceoff circles as rules, powerups, goalie control, or referee**.

## 8. Tests specifically for hockey

- Full 30-degree shot from left/red scores at right mouth when unobstructed.
- A shot high enough outside mouth rebounds from boards and cannot score.
- Shot caught/intercepted by a different skater changes carrier instantly; source cannot immediately recatch.
- A pass can reach a teammate and be intercepted by opposing player along its path.
- Poke-check steals within range and forward arc but fails out of range / when facing away.
- Colliding with a carrier steals once, not dozens of times per second.
- Charge increases force; charge input stops skating acceleration but retains reasonable coasting.
- Shots released during a disconnect/cancel do not fire.
- Goalie saves some shots, misses other well-aimed shots, never leaves goal zone.
- Goal scored exactly once, clock paused through reset, reset starts fair at center.
- Game ends when timer expires, not after a wall-clock interval including goal pauses.
