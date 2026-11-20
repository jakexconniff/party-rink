// Types shared by server and clients. Keep this file free of runtime dependencies.
import type { Look } from './appearance';
export type { Look };

export type Team = 'RED' | 'BLUE';
export type Phase =
  | 'LOBBY'
  | 'GAME_SELECT'
  | 'TEAMS'
  | 'SETTINGS'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'GOAL_PAUSE'
  | 'PAUSED'
  | 'RESULTS';
export type MatchPhase = 'COUNTDOWN' | 'PLAYING' | 'GOAL_PAUSE' | 'PAUSED' | 'OVER';

export const DURATIONS = [300, 600, 900] as const;
export type Duration = (typeof DURATIONS)[number];

export const ADVANCE_ACTIONS = [
  'START',
  'CHOOSE_HOCKEY',
  'NEXT',
  'BACK',
  'START_MATCH',
  'REMATCH',
  'NEW_GAME',
] as const;
export type AdvanceAction = (typeof ADVANCE_ACTIONS)[number];

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 16;

export interface PublicPlayer {
  id: string;
  name: string;
  number: number;
  team: Team | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  inMatch: boolean;
  /** laptop-added test player (local testing only) */
  test: boolean;
  /** a deliberately bad test bot */
  dumb: boolean;
  look: Look;
}

export interface PlayerStat {
  number: number;
  name: string;
  team: Team;
  goals: number;
  shots: number;
  steals: number;
  catches: number;
  oneTimers: number;
  perfects: number;
}

export interface MatchResult {
  red: number;
  blue: number;
  winner: Team | 'DRAW';
  stats: PlayerStat[];
  /** player number of the MVP, if anyone did anything */
  mvp: number | null;
}

/** Gameplay events streamed to the TV for callouts/effects. Player references are numbers. */
export type MatchEvent =
  | { type: 'goal'; team: Team; scorer: number | null; goals: number; x: number; y: number }
  | { type: 'steal'; by: number; from: number; x: number; y: number }
  | { type: 'save'; team: Team; x: number; y: number }
  | { type: 'shot'; by: number; speed: number; perfect: boolean; oneTimer: boolean; x: number; y: number }
  | { type: 'pass'; by: number; x: number; y: number }
  | { type: 'pickup'; by: number; x: number; y: number }
  | { type: 'cleanCatch'; by: number; x: number; y: number }
  | { type: 'whiff'; by: number; x: number; y: number }
  /** easter egg: a chat bubble over a player on a badly losing team */
  | { type: 'quip'; by: number; text: string }
  | { type: 'end' };

export interface RoomState {
  phase: Phase;
  hostId: string | null;
  players: PublicPlayer[];
  durationSeconds: Duration;
  canStartLobby: boolean;
  teamCheck: { ok: boolean; reason: string };
  joinOpen: boolean;
  result: MatchResult | null;
  devHooks: boolean;
}

/** Phone → server controller state. */
export interface InputMsg {
  seq: number;
  x: number;
  y: number;
  pass: boolean;
  shoot: boolean;
  /** true when the shoot release came from a cancel (pointercancel, blur) rather than a deliberate release */
  cancel?: boolean;
}

export interface SkaterSnap {
  /** player number 1..8 */
  n: number;
  /** 0 red, 1 blue */
  tm: 0 | 1;
  x: number;
  y: number;
  fx: number;
  fy: number;
  /** charge 0..1, or -1 when not charging */
  ch: number;
  ax: number;
  ay: number;
  /** 1 connected */
  c: 0 | 1;
  /** 1 while poke animation is showing */
  pk: 0 | 1;
  /** 1 while stumbling after a whiffed poke */
  st: 0 | 1;
  /** 1 while speed-boosted after a clean catch */
  bo: 0 | 1;
}

export interface GoalieSnap {
  x: number;
  y: number;
  /** 1 during save flash */
  s: 0 | 1;
}

export interface Snapshot {
  t: number;
  phase: MatchPhase;
  clockMs: number;
  countdownMs: number;
  score: [number, number];
  lastGoal: Team | null;
  /** puck x, y, carrier player number (0 = loose) */
  puck: [number, number, number];
  sk: SkaterSnap[];
  gl: [GoalieSnap, GoalieSnap];
  /** playable rink bounds for this match: minX, maxX, minY, maxY */
  rk: [number, number, number, number];
}

export interface ControlState {
  inMatch: boolean;
  team: Team | null;
  hasPuck: boolean;
  charging: boolean;
  chargePct: number;
  phase: MatchPhase | null;
  clockMs: number;
  score: [number, number];
  /** 0..1, 1 = POKE ready */
  pokeReady: number;
  stumbling: boolean;
  boosting: boolean;
  /** a loose puck is about to reach you — tap POKE for a clean catch */
  catchHint: boolean;
}

export interface JoinedMsg {
  playerId: string;
  reconnectToken: string;
  number: number;
  name: string;
  reclaimed: boolean;
}

export interface ErrorMsg {
  code: string;
  message: string;
}

export interface JoinUrl {
  ip: string;
  url: string;
  qr: string;
  iface: string;
}

export interface ServerInfo {
  urls: JoinUrl[];
  port: number;
  lanOverride: boolean;
  warning: string | null;
  isLocal: boolean;
}
