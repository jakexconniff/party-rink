// Types shared by server and clients. Keep this file free of runtime dependencies.

export type Team = 'RED' | 'BLUE';
export type Phase =
  | 'LOBBY'
  | 'GAME_SELECT'
  | 'TEAMS'
  | 'SETTINGS'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'GOAL_PAUSE'
  | 'RESULTS';
export type MatchPhase = 'COUNTDOWN' | 'PLAYING' | 'GOAL_PAUSE' | 'OVER';

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
}

export interface MatchResult {
  red: number;
  blue: number;
  winner: Team | 'DRAW';
}

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
