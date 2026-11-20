# PARTY RINK — One-day development handoff

**Status:** MVP scope approved by product owner on Friday, November 20, 2026.  
**Target:** A credible, actually playable demo for a friends' gathering on **Saturday evening, November 21, 2026**. Target is aspirational, not a guarantee.  
**Developer workflow:** A capable coding agent (prefer Codex in a writable local repository) does nearly all implementation, self-testing, and troubleshooting. Product owner only installs/runs, connects the laptop to a TV, tests phones, and reports blockers.

## The pitch

Build an original local-network arcade hockey party game. A laptop hosts the game and displays a colorful overhead/elevated hockey rink on a TV. Two to eight people scan an on-screen QR code, enter a name, choose teams, and use their own phones as touch controllers. No native apps, USB controllers, paid services, online accounts, or cloud dependencies.

## Fixed decisions — do not ask again

- **Ship an MVP quickly**, accepting simple graphics; do not spend the day polishing 3D assets.
- Visual style: **2.5D**, elevated view showing the whole rink, simple pseudo-3D stylized skaters, original graphics.
- Two teams, **Red vs Blue**, and one map. Human teams may be uneven (e.g., **3v4** or **2v3**); no bot skaters. The team-size gap is at most 1 for fairness.
- Two large buttons on every **portrait** phone: **PASS / POKE** (context-sensitive) and **SHOOT**; a virtual analog joystick occupies the left side. Physical contact also causes steals.
- A simple automated goalie per team is in scope; sophisticated AI, player goalie control, and bot skaters are out of scope.
- Lobby with QR, name entry, first joining player as host, host starts once ready; one playable hockey game; team choice/readiness; match duration **5, 10, or 15 minutes**; 3-second start countdown; scores/results/replay.
- Product owner's participation is **minimal**. Do not require routine decisions or eight physical phones to test.

## Handoff documents (read in order)

1. `01_MASTER_AGENT_PROMPT.md` — paste this into Codex/ChatGPT Work with this folder attached/in the repo. **Directly instructs the agent to build, not just plan.**
2. `02_PRODUCT_REQUIREMENTS.md` — flows, screen contracts, readiness and host behavior, scope.
3. `03_HOCKEY_GAME_DESIGN.md` — detailed rules, gameplay, controls, goalies, balance defaults.
4. `04_TECHNICAL_DESIGN.md` — code structure, wire protocol, state authority, phone networking, reliability.
5. `05_EXECUTION_AND_QA.md` — development order, acceptance tests, dry-run procedure, showtime fallback.
6. `06_DEFERRED_BACKLOG.md` — deliberately excluded ideas and architecture extension points.

## Definition of success for tomorrow

1. One laptop can serve the game and show a QR join URL on a TV.
2. At least **six, ideally eight**, simulated clients can join without state errors; two actual phones join successfully on local Wi-Fi.
3. Every player can enter a name, see their own controls, select a team, ready up, and reconnect after a page reload.
4. Host can select hockey, start a properly assigned game, choose 5/10/15 minutes, and run a multiplayer match.
5. Movement, shooting, passing, possession, stealing, goalie saves, scoring, countdown, timekeeping, and results function and are legible on the TV.
6. The system does not need developer intervention during the actual match.

**Not the bar for tomorrow:** polished 3D animation, perfect netcode, sophisticated physics, music, multiple minigames, bots, persistence, accounts, avatars, matchmaking, or internet hosting.

## Immediate operator steps (once agent finishes)

- On laptop: install a supported recent Node.js LTS, install dependencies, run the project's documented start command.
- Ensure laptop and players' phones are on the **same non-isolated Wi-Fi LAN**, allow Windows Firewall for the **Private** network if prompted, connect laptop to the TV, open `/tv`, and scan the QR using one or two phones.
- Have a guaranteed fallback activity ready if local Wi-Fi or any show-stopper fails.

## Design provenance and IP boundary

The desired feel is inspired by short, arcade-style ice hockey party minigames, including *Mario Party 5* Ice Hockey, but the product is an **original implementation**. Do not copy Nintendo character designs, audio, art, logos, code, or exact presentation. Simple 2D draw calls and original shapes are sufficient.

### Technical reference URLs

- Mario Party 5 Ice Hockey general reference: https://www.mariowiki.com/Ice_Hockey_(minigame)
- Socket.IO documentation (v4): https://socket.io/docs/v4/
- MDN Pointer Events: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- MDN touch handling: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events
