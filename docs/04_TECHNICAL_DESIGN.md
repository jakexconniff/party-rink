# TECHNICAL ARCHITECTURE — Local multiplayer party rink

## 1. Architecture principle

**Simplest architecture that survives an actual party.** One Windows laptop runs a Node process serving both browser UIs and Socket.IO. TV uses `/tv`; guest phones use `/join`. All authoritative lobby, team, and game physics live on the Node server. Client applications display state and send narrowly scoped input / user commands.

**Recommended stack:** TypeScript + Node.js + Express + Socket.IO (v4) + React/Vite + built-in Canvas 2D. Avoid DB, cloud, Phaser/Three unless agent finds an overwhelming speed advantage. Use `qrcode` for offline QR generation and native `os.networkInterfaces()` to discover an IPv4 LAN URL. Node and frontend should be run from a single repo with reproducible scripts.

### High-level data flow

```text
Laptop browser /tv  ←--- game snapshots/lobby events ---┐
                                                        │
Phone A /join  -- joystick, pass, shoot, lobby -->  Node + Socket.IO  -- fixed-step simulation
Phone B /join  -- joystick, pass, shoot, lobby -->     (single room)
...                                                     │
Phone H /join  ----------------------------------------┘

TV draws 2.5D rink + game UI, phone draws lobby + controller UI.
```

Server listens on `0.0.0.0` (default `PORT=3000`) and prints detected LAN addresses. For dev, prefer one HTTP origin/port through Vite middleware in Express, or an equivalent approach allowing QR to use one correct URL. In production, serve Vite build statically from same Node server. If agent elects two ports in dev, hide that behind correct QR generation and document URLs explicitly.

## 2. Suggested repository layout

```text
party-rink/
├── docs/                      # supplied handoff specs
├── package.json               # npm scripts
├── tsconfig.json
├── vite.config.ts
├── server/
│   ├── index.ts               # HTTP, socket server, health, LAN helper
│   ├── room.ts                # players, host, phase transitions
│   ├── protocol.ts            # runtime event validation; or shared/
│   ├── simulation/
│   │   ├── game.ts            # fixed-step state machine
│   │   ├── physics.ts         # movement/collision/puck
│   │   ├── goalie.ts          # simple patrol/response
│   │   └── config.ts          # all numeric tuning knobs
│   └── tests/
├── client/
│   ├── main.tsx
│   ├── pages/Tv.tsx
│   ├── pages/Join.tsx
│   ├── components/Joystick.tsx
│   ├── components/TouchActions.tsx
│   ├── components/RinkCanvas.tsx
│   ├── net/socket.ts
│   └── styles.css
├── shared/
│   └── types.ts               # types used by both sides
├── scripts/
│   └── smoke-eight.ts         # automated simulated phones
├── QUICK_START_WINDOWS.md
├── TEST_REPORT.md
└── KNOWN_ISSUES.md
```

This layout is illustrative, not mandated; actual simple working code wins over a clean abstraction that delays shipping.

## 3. Server domain model

```ts
type Phase = 'LOBBY' | 'GAME_SELECT' | 'TEAMS' | 'SETTINGS' |
  'COUNTDOWN' | 'PLAYING' | 'GOAL_PAUSE' | 'RESULTS';
type Team = 'RED' | 'BLUE';

type Player = {
  id: string;                 // stable server-assigned ID, not socket.id
  name: string;               // sanitized/escaped, 1..16 visible characters
  number: number;             // 1..8
  team: Team | null;
  ready: boolean;
  connected: boolean;
  lastConnectedAt: number;
  reconnectTokenHash: string; // store token server-side hashed, in memory
};

type Room = {
  phase: Phase;
  hostPlayerId: string | null;
  players: Player[];
  chosenGame: 'HOCKEY';
  durationSeconds: 300 | 600 | 900;
  match: Match | null;
};

type InputState = {
  moveX: number; moveY: number; // normalized
  passPressed: boolean;        // edge triggered, not repeated every tick
  shootDown: boolean;          // continuous hold/release with change edges
  seq: number;                 // monotonically increasing per client
};
```

**Note on identity:** Socket.IO `socket.id` changes across reconnections; don't use it as player identity. Generate player ID and opaque reconnect token server-side on join, return token over existing socket, store token in phone browser localStorage. If the client reloads, present token and reclaim its slot. Revoke token on explicit room reset. This is a local trusted-party app: no need for a full authentication service, but tokens should be unguessable and not exposed in URL or on TV.

### Game state (conceptual)

```ts
type Match = {
  redScore: number; blueScore: number;
  remainingMs: number;
  ticks: number;
  skaters: Array<{ id: string; team: Team; x: number; y: number;
    vx: number; vy: number; facingX: number; facingY: number;
    connected: boolean; chargingSinceMs: number | null }>;
  puck: { x: number; y: number; vx: number; vy: number;
    carrierId: string | null; lastReleasedBy: string | null;
    lastReleaseMs: number };
  goalies: Array<{ team: Team; x: number; y: number; vy: number;
    mode: 'PATROL' | 'REACT' | 'SAVE' }>;
};
```

Expose a **public/serializable snapshot** that omits reconnect tokens and private IDs. Payload should be compact enough to serve eight phones + TV on LAN; only TV requires high-frequency full game snapshots. Phones can receive a lower-frequency status/control acknowledgement and match timer, not a full rich world every frame.

## 4. Websocket event contract

Exact event names are suggestions, but enforce equivalent schemas and server authorization.

| Direction | Event | Payload | Server behavior |
|---|---|---|---|
| Phone→Server | `player:join` | `{ name: string, reconnectToken?: string }` | validate, rebind or create (max 8), first host |
| Server→Phone | `player:joined` | `{ playerId, reconnectToken, number, isHost }` | phone persists token |
| Server→All | `room:state` | phase, public roster, host id, duration, errors | lobby/team UI sync |
| Host→Server | `room:advance` | `{ action: 'START'|'CHOOSE_HOCKEY'|'NEXT'|'BACK'|'START_MATCH'|'REMATCH'|'NEW_GAME' }` | validate host+phase, never trust client |
| Phone→Server | `player:team` | `{ team: 'RED'|'BLUE' }` | validate phase, reset own ready |
| Phone→Server | `player:ready` | `{ ready: boolean }` | validate phase |
| Host→Server | `match:duration` | `{ seconds: 300|600|900 }` | validate host+SETTINGS |
| Phone→Server | `input:state` | `{ seq, x, y, passDown, shootDown }` | validate, clamp, detect edges, throttle |
| Server→TV | `match:snapshot` | positions, puck, goalie, score, clock, match phase | TV interpolation/render |
| Server→Phone | `player:controlState` | possession, chargePct, current phase, role, connection | UI feedback |
| Server→All | `system:error` | `{ code, message }` | visible human-readable error |
| TV Admin→Server | `admin:reset` | local-only/guarded request | emergency return to lobby |

**Admin security:** Do not let arbitrary phones call `admin:reset`. A convenient laptop-only browser button can use a process-local admin token embedded exclusively in TV response or a localhost-only HTTP endpoint. Guard against phone users reaching it. In this local-party demo, minimum workable fallback is a keyboard command processed by the laptop-side server process.

### Input semantics

- Normalize/clamp x and y. On `shootDown` rising edge, begin charge if carrying; on falling edge, release shot. `passDown` rising edge triggers one pass/poke; holding must not repeat.
- **Input stream ~20–30 Hz**, may send immediate state transitions on down/up. Use sequential counters or timestamps to reject stale packets. If a client fails to send updates for >250–500ms, neutralize movement/buttons; upon socket disconnect, neutralize instantly. Do not blindly replay buffered stale movement on reconnect.
- For clarity, agents may choose separate `input:move` and `input:action` events instead of one state event, but must preserve the same edge semantics and cancellation behavior.
- Use `pointerId` tracking on phones so joystick and two buttons can be independently touched. `pointercancel`, `lostpointercapture`, app blur, page hide = action release and neutral input.

## 5. Simulation, networking, rendering

- **Server:** fixed simulation timestep 1/30 or 1/60 second; use monotonic time and bounded accumulator. Lobby/phase machine and game physics authoritative. Snapshot send ~15–30 Hz. Match clock advances only on active ticks in `PLAYING`.
- **TV client:** `requestAnimationFrame` Canvas renderer; interpolate between server snapshots when possible, but simple snapshot rendering is acceptable for initial MVP. Never run score/collision authority in TV.
- **Phone:** minimal React UI with touch controls, plus authoritative server status. Do not stream full resolution imagery; controller sends only tiny input packets.
- **Physics:** implement internally. Avoid a huge game engine if custom simple circles/rects suffice. Use swept segment/circle collision for fast puck and goal triggers to avoid passing through skaters between ticks.
- **Local network:** listen on all interfaces, advertise a private IPv4 address (192.168.*, 10.*, 172.16–31.* if suitable). When multiple NICs are present, expose a selector or `LAN_IP` environment override. Always show URL as fallback to QR.
- **HTTP and phones:** `http://<LAN_IP>:3000/join` is acceptable for LAN testing. Do not require geolocation, camera permission in the web page, motion sensors, Web Vibrations, service workers, WebAuthn, or HTTPS-only APIs. Phone's system camera app scans QR, which is generated server-side.
- **Windows networking:** Allow Node/private-network traffic through firewall. Guest Wi-Fi or client isolation may block phones; provide a prominent troubleshooting message on TV/README.

## 6. Browser and Wi-Fi practicalities

- Support mobile Safari and mobile Chrome in typical current iOS/Android releases.
- Viewport meta `width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no` is optional; relying exclusively on disabling zoom is not sufficient. Buttons and joystick must work with Pointer Events and `touch-action: none`.
- Respect safe area insets and orientation. If landscape, show "Please rotate phone to portrait" instead of breaking controls.
- Avoid haptics as a requirement; iOS Safari may not offer the standard vibration behavior. Use pressed-state visuals.
- Provide a `Disconnect / Reconnect` banner on phone. For idempotent reconnect, server sends full roster and match state after identity rebind.
- Ensure when a phone locks, sticks neutralize after timeout to prevent unattended skating.

## 7. Validation and security (right-sized for home LAN)

- Server validates every event: name, max participants, enum phases, permissions, team assignment, duration, input bounds, max input rate. Never trust remote score/positions.
- Only host can advance/change settings. Only the owner of a skater can send its inputs. Client may only mutate its own team/ready state.
- Escape display names; no HTML injection. No third-party analytics/tracking.
- If server crashes, room can reset on restart; DB persistence is explicitly out of scope.
- Keep state in memory. Room reset wipes player tokens and match state; reconnect token in localStorage should gracefully retry and fall back to name entry.

## 8. Unit, integration, browser and load tests

- **Unit:** pure functions for puck collisions/goals, shot power, possession immunity, poke range/arc, goalie movement/deflection, movement, time and reset.
- **Server integration:** host privilege, eight-seat cap, room state progression, invalid inputs rejected, 3v4 readiness success, 4v4 success, 2v6 failure, rejoin after reconnect, host transfer.
- **Automated client swarm:** connect 8 `socket.io-client` simulated guests; join, choose teams, ready, start, stream input for several seconds, force a goal by calling dev-only simulated helper or stepping pure physics; end match with accelerated dev clock; verify no exceptions, all snapshots finite, scores/timers valid; print clear PASS/FAIL.
- **Browser:** if Playwright is available, validate phone page at 390x844 and TV page at 1920x1080, test mouse-simulated joystick+button. Optional screenshot output. Do not block MVP on unavailable browser automation installation.
- **Human test:** two physical phones, including at least one iPhone if available, same Wi-Fi. If unavailable, report honestly as UNVERIFIED, not PASSED.

## 9. External developer references

- https://socket.io/docs/v4/ — Socket.IO lifecycle and realtime client/server
- https://socket.io/docs/v4/client-api/ — connections and reconnect behavior
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events — pointerId & multitouch
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events — `touch-action` and pointer cancellation

**Implementation rule:** Prefer the shortest provably working code path and verify it, rather than implementing every idealized architectural detail above. If a recommendation is unworkable, record a one-paragraph deviation and move on.
