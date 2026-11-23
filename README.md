# Party Rink

A local-network arcade hockey party game. A laptop runs the game and shows it on the TV. 2–8 phones scan a QR code and become controllers, Red vs Blue. No app installs, no accounts, no internet needed once it's set up.

## Party-night quick start (Windows laptop)

### One-time setup (about 5 minutes)

1. **Install Node.js:** download the **LTS** installer from <https://nodejs.org> and run it with the default options. (Version 22.12 or newer.)
2. **Install Git** if the laptop doesn't have it: <https://git-scm.com/download/win>, default options.
3. **Get the code.** Open PowerShell and run:

   ```
   cd $HOME\Documents
   git clone https://github.com/jakexconniff/party-rink.git
   cd party-rink
   npm install
   ```

   (No Git? On the GitHub page use **Code → Download ZIP**, unzip it, and run `npm install` inside the folder.)

### Start the game

Double-click **`start-party.bat`** in the `party-rink` folder. (Or in PowerShell in that folder: `npm run party`.)

A window prints something like:

```
  PARTY RINK is running
  TV (open on this laptop):  http://localhost:3000/tv
  Phones join at:            http://192.168.1.23:3000/join
```

Keep that window open the whole night. Closing it ends the game.

**The first time**, Windows Firewall pops up asking about Node.js. Tick **Private networks** and click **Allow**. If you miss it or click Cancel, phones can't connect (see Troubleshooting).

### Put it on the TV

1. Plug the laptop into the TV with HDMI. Set the display to **Duplicate** or **Second screen only** (Windows key + P).
2. Open **Chrome or Edge** on the laptop and go to `http://localhost:3000/tv`.
3. Press **F11** for full screen.
4. Plug in the laptop's charger and stop it from sleeping (Settings → System → Power → Screen and sleep → Never while plugged in).

### Join with phones

- Everyone joins the **same Wi-Fi as the laptop** (not a guest network).
- Scan the QR code on the TV, type a name, tap **Join**. The first person in is the **HOST** and drives the menus on their phone.
- Turn the phone **sideways** to play: left half is the joystick, top-right is **PASS/POKE**, bottom-right is **SHOOT** (tap, or hold to charge).
- Tap **?** on a phone for the controls cheat sheet.
- **Play on the TV computer itself (one tab):** on the TV page click **🎮 Play on this screen** (bottom-left). A side panel lets you join; you become the **host** and run the menus from that panel. During the match play with the keyboard: **WASD** or arrows skate, **left click** (or J) is PASS/POKE, **right click** (or K / Space) is SHOOT, hold to charge. **P** pauses. **Hide** tucks the panel away, **Stop** removes you from this screen.
- **Another computer as a controller:** open the join address in its browser. The same keys work once the match starts (they do nothing in the menus).

### Running the night from the laptop

- **Pause:** press **P** or **Space** on the TV page (the host can also hold ⏸ on their phone). Resuming counts down 3-2-1.
- **Admin** button (bottom-left of the TV page): pause, end the match, back to lobby, full reset, add test players (bots), turn off the timing rings.
- **Results screen** on the TV has **Rematch**, **New game** and **Back to home**, so the TV can move things along even if the host's phone died.
- Keys in the server window: **l** back to lobby, **r** full reset, **e** end match, **s** status, **q** quit.
- Players who drop out can rejoin from the same phone mid-match and get their skater back.

### Rehearse it before people arrive (2 minutes)

1. Start the game and open the TV page.
2. Join from your own phone.
3. On the TV page click **Admin → + Add test player** three times.
4. On your phone: Continue → Play Ice Hockey → pick a team → I'm ready → pick a length → Start Match.

If your skater moves on the TV, you're good. [TESTING_LOCALLY.md](TESTING_LOCALLY.md) has a longer walkthrough.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phones time out loading the join page | Windows Firewall is blocking it. Start → "Allow an app through Windows Firewall" → Change settings → find **Node.js JavaScript Runtime** → tick **Private** (and Public if your Wi-Fi is set to Public). Also check Settings → Network & internet → Wi-Fi → your network → **Private network**. |
| QR code shows an address like `172.x` or `169.254.x` | The laptop picked the wrong network adapter. Close the window, then in PowerShell: `$env:LAN_IP="192.168.1.23"; npm start` with the laptop's real Wi-Fi address (run `ipconfig`, look under "Wireless LAN adapter Wi-Fi", "IPv4 Address"). |
| "Port 3000 is already in use" | The game is already running in another window. Close it, or run `$env:PORT=3001; npm start`. |
| Phone still can't connect | Make sure it's on the same Wi-Fi (not cellular, not a guest network). Some routers block devices from seeing each other: try a phone hotspot from the laptop instead (Settings → Network & internet → Mobile hotspot) and have everyone join that. |
| `npm` errors | Run the steps without npm: `node node_modules\vite\bin\vite.js build` then `node node_modules\tsx\dist\cli.mjs server\index.ts`. |
| Something weird mid-game | Press **l** in the server window (back to lobby, players kept) or **r** (full reset). Worst case close the window and double-click `start-party.bat` again; everyone rejoins by refreshing their phone. |

## For developers

- `npm run dev`: dev server with hot reload and extra admin tools (clock skip, force goal). Restarts wipe the game.
- `npm test`: unit tests. `npm run smoke:8`: eight simulated phones play a full match.
- `npm run typecheck`, `npm run build`.
- Code: `server/` (authoritative 60Hz simulation, Socket.IO), `client/` (React pages for `/tv` and `/join`, canvas renderer), `shared/` (types, tips, character heads). Design docs are in `docs/` and `PLAN.md`.
- Gameplay tips shown on the TV are in `shared/tips.ts`.
