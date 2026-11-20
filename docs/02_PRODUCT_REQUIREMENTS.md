# PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Product:** Party Rink — original 2–8 player, phone-controlled local arcade hockey.  
**Version:** MVP 0.1.  
**Target test window:** Before Saturday evening, Nov 21, 2026.  
**Primary device:** Windows laptop HDMI to TV.  
**Player devices:** iPhone/Android browsers, same non-isolated Wi-Fi.

## 1. Who, when, and why

A host is entertaining 6–8 friends. Traditional PC controllers are difficult to collect/connect. All participants already have phones. Players should scan a QR code, identify themselves, and play an arcade hockey match visible on a shared TV, without downloading a game or touching the laptop keyboard during play. The host has very little time to configure/test.

Success means the group spends more time actually playing than troubleshooting. A failure to connect/reconnect smoothly is more damaging than basic graphics.

## 2. MVP functional scope

| Area | Required MVP behavior | Explicitly NOT in MVP |
|---|---|---|
| Hosting | One room on laptop; `/tv` shows join QR+URL; `/join` for phone | cloud deploy, internet matchmaking |
| Capacity | 2–8 human players; name join; room full error | multiple simultaneous rooms |
| Host | First successful join is host; host may advance; auto-transfer after disconnection; TV admin fallback | complex permissions |
| Identity | Name up to 16 visible chars; persistent reconnect token; stable color/number | user accounts/avatars |
| Lobby | Joined player list visible on TV; host Start button when >=2 connected players | voting/kicking for MVP |
| Game menu | One available selectable Hockey game; host advances | multiple minigames |
| Teams | Choose Red or Blue; ready toggle; TV shows rosters; team balance difference <=1 | team captain, color editing, drafts |
| Settings | Host chooses 5/10/15 minute active-play clock; default 5 | rules editor |
| Match | 3-2-1 countdown; all connected participants skate; goalies; goals; clock; scores | referees/offside/penalties |
| Results | Winner/draw, final score; host Play Again, or Back to Game Selection | statistics/history |
| Controller | Portrait joystick + Pass/Poke + Shoot; signal/reconnect feedback | hardware controls, tilt, haptic dependence |

## 3. Navigation / state machine

`LOBBY → GAME_SELECT → TEAMS → SETTINGS → COUNTDOWN → PLAYING ↔ GOAL_PAUSE → RESULTS`

- From `RESULTS`, host can select **Rematch** (return to TEAMS with same teams, readiness cleared) or **New game** (GAME_SELECT).
- A **Restart to Lobby** safety action is available on the laptop's TV/admin screen, with confirmation, in any state.
- If a player joins after gameplay has started, they see a **Match in progress; watch/wait for next round** message; they do not enter the active match or exceed 8 seats. Keep MVP simpler: **close new player admissions during countdown/match/results**; previously registered players may reconnect.
- Lobby host may start game selection with >=2 connected players. Team settings/next requires at least one human skater on each team, every active participant assigned and ready, and |redCount - blueCount| <= 1. The host counts as a player and must ready too.
- Between `TEAMS` and `SETTINGS`, player readiness stays locked unless host backs up. For an accidental change, return to TEAMS and clear readiness for all players.
- Host changes selected match length in `SETTINGS` and presses Start Match. `COUNTDOWN` is 3 seconds of wall time, then active clock begins.
- Server alone performs phase transitions; UI buttons are requests, not authority.

### Screen-by-screen contract

#### A. TV: Welcome / Lobby
- Large title; join prompt; large scannable QR; **written URL** below; status `Waiting for players (3/8)`.
- Clear display of player names and who is Host; status if LAN address cannot be detected.
- Can be seen from across a living room (1080p display).
- QR is derived from current LAN IPv4 and chosen port, not `localhost`. One active local room; room code is optional and not needed in MVP.

#### B. Phone: Join
- Landing screen with party title, name text input, Join button, simple connection indicator.
- Name trim, 1–16 characters, escaped everywhere; identical visible names accepted only if tagged by distinct player number, or explicitly reject duplicates (choose and document).
- Immediately present waiting screen after successful join: `You are Player 4`, `Waiting for host`, list/count optional.
- First join gets a `Host` pill and a `Continue` button when enough people join.
- Error states: room full, join closed, Wi-Fi connection lost, name invalid, server not reachable.

#### C. TV + phone: Game selection
- TV displays a single, unmistakable **Ice Hockey** selection card.
- All phones can see selected game; host alone gets `Select / Continue`.

#### D. TV + phone: Teams
- Red team left, Blue team right; show each player's name, team, and Ready state.
- On phones, choose a team and press Ready. A player may change team until locking and such a change clears own Ready.
- Host `Next` disabled until everyone connected is on a team and ready, both teams populated, team-size gap <=1.
- Team colors **fixed** Red/Blue; the earlier "team captain chooses the color" idea is deferred. This avoids an unnecessary host/captain state machine.
- Optionally show a tiny pseudo-avatar/number for identity, but do not invest in avatar assets.

#### E. TV + host phone: Match settings
- Host chooses 5, 10, or 15 minutes; show preview `First puck drops in 3 seconds`.
- TV lists team rosters; host Start Match. No one else changes duration.

#### F. TV: Match
- Full rink entirely visible, upper scoreboard Red/Blue and mm:ss; game clock always prominent.
- Original skaters: team colors, player numbers and truncated names; goalies visually distinguishable (e.g., shield shape / goalie label).
- Puck obviously visible against ice; owning skater indicated with glow or small puck indicator.
- Giant `3, 2, 1, GO!`, goals overlay (`RED SCORES!`) and 2-second goal pause, then faceoff.
- Show disconnect markers and hold a skater idle instead of leaving last input engaged.

#### G. Phone: Match controller
- Portrait page with fixed left joystick region and two oversized right-side buttons (`PASS / POKE`, `SHOOT`).
- Name/team/clock/signal indicator minimal and non-intrusive.
- SHOOT button displays charging progress; joystick changes shot aim while held. Aim also visualized on TV.
- Prevent scroll/selection/long-press context menu while playing. Use pointer events, multitouch, capture, proper cancellation. Avoid layout shifts.
- Recover after short device sleep or accidental refresh, rejoin using saved token; player remains same skater and team. When disconnected, indicate reconnecting; clear inputs server-side.

#### H. TV and phones: Results
- Final score, winner or Draw; host gets Rematch and New Game buttons; TV can restart room via admin control.
- No overtime in MVP. Tie is a valid result.

## 4. Usability rules

- **No UI requires an explanatory speech.** Labels must make sense to an average guest.
- On TV, text must be at least practically readable from ~8–12 feet away, with strong color contrast; avoid relying only on red/blue to distinguish teams (show sides/names).
- On phone, both action buttons are reachable by the right thumb; joystick by left thumb; support simultaneous stick drag + button press.
- If host closes their phone, the app should be recoverable through token reconnection or by transferring host authority to the oldest connected participant after a brief grace period. The laptop still offers reset/start overrides.
- The game should remain functional even if sound/haptics/fullscreen APIs are unavailable.

## 5. Explicit assumptions

- 1 active room; local trusted gathering. No public web exposure and no user accounts.
- Phones and laptop are on the same Wi-Fi, with device-to-device traffic allowed.
- Two to eight participants are humans. 1v1, 2v2, 3v3, 3v4, 4v4 are allowed; mismatch at most one. 1v2/2v3 likewise allowed.
- Red attacks the right goal, Blue attacks the left goal. Teams do not switch sides at halftime.
- No mid-match new joiners, but reconnection is allowed.
- Game clock pauses during countdown and goal celebrations.
- Default scoreboard clock duration is five minutes; 10 and 15 available.
- A scripted goalie is allowed because it's not a general field-player AI.

## 6. Acceptance / non-goals

Acceptance criteria and smoke/test steps are in `05_EXECUTION_AND_QA.md`. Deferrals in `06_DEFERRED_BACKLOG.md` are **NOT** acceptance failures for this release.
