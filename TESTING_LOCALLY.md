# Testing Party Rink by yourself (happy path)

You need one laptop and one phone (or just the laptop, see "No phone?" below).

## 1. Start the server

In a terminal in this folder, run:

```
node node_modules/tsx/dist/cli.mjs server/index.ts --dev
```

(`npm run dev` does the same once npm is fixed on this machine. The `npm run dev` script auto-restarts when server files change. That wipes the game, so don't edit code mid-test.)

The terminal prints the TV address and the phone join address. Leave the terminal open. Every join, button press, phase change, goal and phone-side error is logged there with a timestamp.

## 2. Open the TV view on the laptop

Go to `http://localhost:3000/tv`. You should see a QR code and 8 empty slots.

## 3. Join from your phone

The phone must be on the same Wi-Fi as the laptop. Scan the QR code, type a name and tap **Join**. You become **Player 1** with a **HOST** badge.

## 4. Add test players (since you're alone)

On the laptop's TV page, click **Admin** (bottom-left), then **+ Add test player** three times. Test players show a **TEST** tag. They never become host, pick teams and press Ready by themselves, and skate a simple chase-the-puck pattern during the match.

## 5. Walk the flow on your phone

1. **Continue**, then **Play Ice Hockey**.
2. Pick a team and tap **I'm ready**. Test players rebalance around you.
3. Tap **Next: match length**, pick 5 / 10 / 15 minutes, then tap **Start Match!**
4. **Turn the phone sideways.** The left half is the joystick (drag anywhere). The right side has **PASS/POKE** (top) and **SHOOT** (bottom; tap, or hold to charge and aim with the stick).
5. Watch the TV for the 3-2-1 countdown, your skater moving, goals with a 2-second pause, and the clock.

### Skill moves to try

| Move | How | What you'll see |
|---|---|---|
| **Steal** | Tap **POKE** right next to the opponent carrying the puck, facing them | "STOLEN!" on the TV. Bumping into someone never steals, it only slows them down. |
| **Whiff** | Tap POKE with nothing nearby | Dizzy stars, half speed for a moment, and a longer POKE cooldown (the button greys out) |
| **Perfect shot** | Hold SHOOT and release while the fill is in the **green band** (80–95%) | The aim arrow turns green, then "PERFECT!" and a faster shot. Holding too long makes the aim wobble (red). |
| **One-timer** | Hold SHOOT *before* a teammate's pass reaches you | The puck is shot instantly on arrival ("ONE-TIMER!"). Aim with the stick. |
| **Clean catch** | Tap POKE just as a loose puck reaches you (the button glows) | Speed boost ("CLEAN!") |

Carrying the puck makes you a bit slower, so passing pays off. The rink is smaller for 2–4 players.

## 6. Finish quickly

On the TV page, open Admin. **Clock → 0:10** (dev mode only) or **End match now** jumps to results. On your phone, **Rematch** returns to teams and **New game** returns to game select. The results screen on the laptop also has **Rematch**, **New game** and **Back to home** (lobby, players kept), so the TV can move on even if the host has left.

## Other useful checks

- **Reconnect:** reload the phone page mid-match. You get the same skater back.
- **Server restarted:** phones say so and drop back to the lobby. The game lives in memory, so a restart always resets it.
- **No phone?** Open `http://localhost:3000/join?player=1` in a narrow browser window. `?player=2` gives a second independent player in another tab. Use your browser's device toolbar to emulate a phone in landscape.
- **Automated:** `node node_modules/vitest/vitest.mjs run` (unit tests) and `node node_modules/tsx/dist/cli.mjs scripts/smoke-eight.ts` (8 real socket clients through the whole flow).

## Troubleshooting with the log

| You see | Look in the terminal for |
|---|---|
| Phone bounced back to "You're in" | `PARTY RINK is running` appearing again (server restarted), or `[client …] no longer in roster` |
| A button did nothing | `[rejected] #N name: CODE — reason` |
| Phone shows the wrong screen | `[client #N name] showing …` next to `[phase] A → B` |
| Phone keeps disconnecting | `[disconnect] #N name (reason)` |

## Pause and help

- **Pause:** the host holds the ⏸ button in the controller's top bar for about 1 second (a quick tap does nothing). On the laptop, press **P** or **Space** on the TV page, or use Admin → Pause. Resuming starts a 3-2-1 countdown.
- **Help:** every phone has a **?** button (top-right) that opens the controls cheat sheet on that phone only, without pausing. The TV shows the same sheet while paused.
