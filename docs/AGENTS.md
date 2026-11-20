# Codex project instructions — Party Rink

You are a coding agent in the Party Rink repository. **Build the application**, do not stop at a plan. This folder contains the complete approved handoff.

Read these documents in order before changing code:

1. `00_START_HERE.md`
2. `01_MASTER_AGENT_PROMPT.md` — primary instruction
3. `02_PRODUCT_REQUIREMENTS.md`
4. `03_HOCKEY_GAME_DESIGN.md`
5. `04_TECHNICAL_DESIGN.md`
6. `05_EXECUTION_AND_QA.md`
7. `06_DEFERRED_BACKLOG.md`

Be autonomous, optimize for a playable local-network MVP for Saturday Nov 21, 2026, and keep scope ruthlessly tight. Use TypeScript + React/Vite + Node + Socket.IO + Canvas 2D unless a demonstrably simpler working stack exists. No paid APIs, native apps, cloud dependencies, database, 3D engine, or field-player bots. The game is **one eight-phone-capable Red vs Blue arcade hockey minigame** with QR joining, name/host, team and ready selection, 5/10/15 match duration, large portrait joystick and two contextual buttons, skating, pass, shoot/charge/aim, steal, puck intercept, goalies, scores, and results.

Prioritize runnable code and automated smoke tests. Implement and test a full vertical slice before visuals. Run `build`, `test`, and eight-client `smoke:8`, and report exact results. Create operator quick-start and honest known-issues documents. If truly blocked by local hardware/network permissions, specify the smallest action needed from the user; otherwise proceed with defaults and record decisions.
