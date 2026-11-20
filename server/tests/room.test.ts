import { describe, expect, it } from 'vitest';
import { Room, RoomError, sanitizeName } from '../room';
import { sanitizeLook } from '../../shared/appearance';
import type { Team } from '../../shared/types';

function makeRoom() {
  let t = 1000;
  const room = new Room({ now: () => t, hostGraceMs: 5000, pruneMs: 20000 });
  return { room, advanceTime: (ms: number) => (t += ms) };
}

function joinN(room: Room, n: number) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const r = room.join(`Player ${i}`);
    if (!r.ok) throw new Error(r.code);
    out.push(r);
  }
  return out;
}

function toTeams(room: Room, red: number, blue: number) {
  const ps = joinN(room, red + blue);
  const host = { kind: 'player' as const, id: ps[0].player.id };
  room.advance(host, 'START');
  room.advance(host, 'CHOOSE_HOCKEY');
  ps.forEach((p, i) => {
    room.setTeam(p.player.id, (i < red ? 'RED' : 'BLUE') as Team);
    room.setReady(p.player.id, true);
  });
  return { ps, host };
}

describe('names', () => {
  it('trims, collapses and validates', () => {
    expect(sanitizeName('  Ann   Lee ')).toBe('Ann Lee');
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName('x'.repeat(17))).toBeNull();
    expect(sanitizeName('x'.repeat(16))).toBe('x'.repeat(16));
    expect(sanitizeName('🏒'.repeat(16))).toBe('🏒'.repeat(16));
    expect(sanitizeName('a\u0000b​c')).toBe('abc');
    expect(sanitizeName(42)).toBeNull();
  });
});

describe('joining and host', () => {
  it('first join is host, numbers unique, 9th rejected', () => {
    const { room } = makeRoom();
    const ps = joinN(room, 8);
    expect(room.hostId).toBe(ps[0].player.id);
    expect(new Set(ps.map((p) => p.player.number)).size).toBe(8);
    const ninth = room.join('Nine');
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.code).toBe('ROOM_FULL');
    expect(room.players.length).toBe(8);
  });

  it('rejects invalid names', () => {
    const { room } = makeRoom();
    const r = room.join('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NAME_INVALID');
  });

  it('reconnect token reclaims the same slot and host role', () => {
    const { room, advanceTime } = makeRoom();
    const [a] = joinN(room, 3);
    room.disconnect(a.player.id);
    advanceTime(2000);
    room.housekeeping();
    expect(room.hostId).toBe(a.player.id); // still in grace
    const back = room.join('', a.token);
    expect(back.ok && back.reclaimed).toBe(true);
    if (back.ok) expect(back.player.id).toBe(a.player.id);
    expect(room.players.length).toBe(3);
    expect(room.hostId).toBe(a.player.id);
  });

  it('host passes to oldest connected after grace', () => {
    const { room, advanceTime } = makeRoom();
    const [a, b] = joinN(room, 3);
    room.disconnect(a.player.id);
    advanceTime(6000);
    room.housekeeping();
    expect(room.hostId).toBe(b.player.id);
  });

  it('unknown token falls back to a fresh join', () => {
    const { room } = makeRoom();
    const r = room.join('Zed', 'not-a-real-token');
    expect(r.ok && !r.reclaimed).toBe(true);
  });

  it('prunes long-disconnected players before a match', () => {
    const { room, advanceTime } = makeRoom();
    const [, b] = joinN(room, 3);
    room.disconnect(b.player.id);
    advanceTime(21000);
    room.housekeeping();
    expect(room.players.length).toBe(2);
  });

  it('joins close during match but reconnects still work', () => {
    const { room } = makeRoom();
    const { ps, host } = toTeams(room, 1, 1);
    room.advance(host, 'NEXT');
    room.advance(host, 'START_MATCH');
    const late = room.join('Late');
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.code).toBe('JOIN_CLOSED');
    room.disconnect(ps[1].player.id);
    const back = room.join('', ps[1].token);
    expect(back.ok).toBe(true);
  });
});

describe('phase flow and permissions', () => {
  it('lobby start needs 2 players', () => {
    const { room } = makeRoom();
    const [a] = joinN(room, 1);
    expect(() => room.advance({ kind: 'player', id: a.player.id }, 'START')).toThrow(RoomError);
    room.join('B');
    room.advance({ kind: 'player', id: a.player.id }, 'START');
    expect(room.phase).toBe('GAME_SELECT');
  });

  it('non-host cannot advance; admin can', () => {
    const { room } = makeRoom();
    const [, b] = joinN(room, 2);
    expect(() => room.advance({ kind: 'player', id: b.player.id }, 'START')).toThrow(/host/i);
    room.advance({ kind: 'admin' }, 'START');
    expect(room.phase).toBe('GAME_SELECT');
  });

  it.each([
    [3, 4, true],
    [4, 4, true],
    [2, 3, true],
    [1, 1, true],
    [2, 4, false],
    [2, 6, false],
    [0, 3, false],
  ])('%i v %i valid=%s', (red, blue, ok) => {
    const { room } = makeRoom();
    const { host } = toTeams(room, red, blue);
    expect(room.teamCheck().ok).toBe(ok);
    if (ok) {
      room.advance(host, 'NEXT');
      expect(room.phase).toBe('SETTINGS');
    } else {
      expect(() => room.advance(host, 'NEXT')).toThrow(RoomError);
    }
  });

  it('cannot leave teams until everyone ready; team change clears ready', () => {
    const { room } = makeRoom();
    const { ps, host } = toTeams(room, 2, 2);
    room.setTeam(ps[0].player.id, 'BLUE');
    expect(room.getPlayer(ps[0].player.id)!.ready).toBe(false);
    room.setTeam(ps[0].player.id, 'RED');
    expect(() => room.advance(host, 'NEXT')).toThrow(/Ready/);
    room.setReady(ps[0].player.id, true);
    room.advance(host, 'NEXT');
    expect(room.phase).toBe('SETTINGS');
    expect(() => room.setTeam(ps[1].player.id, 'BLUE')).toThrow(RoomError);
  });

  it('duration must be 5/10/15 and host-only', () => {
    const { room } = makeRoom();
    const { ps, host } = toTeams(room, 1, 1);
    room.advance(host, 'NEXT');
    expect(() => room.setDuration(host, 120)).toThrow(RoomError);
    expect(() => room.setDuration({ kind: 'player', id: ps[1].player.id }, 600)).toThrow(/host/i);
    room.setDuration(host, 900);
    expect(room.durationSeconds).toBe(900);
  });

  it('full flow: match → results → rematch / new game', () => {
    const { room } = makeRoom();
    const { host } = toTeams(room, 2, 2);
    room.advance(host, 'NEXT');
    room.advance(host, 'START_MATCH');
    expect(room.phase).toBe('COUNTDOWN');
    for (let i = 0; i < 200; i++) room.tick();
    expect(room.phase).toBe('PLAYING');
    room.match!.devSetClock(50);
    for (let i = 0; i < 10; i++) room.tick();
    expect(room.phase).toBe('RESULTS');
    expect(room.result?.winner).toBe('DRAW');
    room.advance(host, 'REMATCH');
    expect(room.phase).toBe('TEAMS');
    expect(room.players.every((p) => !p.ready && p.team)).toBe(true);
  });

  it('full reset wipes players and tokens', () => {
    const { room } = makeRoom();
    const [a] = joinN(room, 2);
    room.resetToLobby(false);
    expect(room.players.length).toBe(0);
    const r = room.join('Again', a.token);
    expect(r.ok && !r.reclaimed).toBe(true);
  });
});

describe('local test players', () => {
  it('never become host, auto-balance and ready, and play a match', () => {
    const { room } = makeRoom();
    room.addTestPlayer(); // added before any human
    expect(room.hostId).toBeNull();
    const me = room.join('Me');
    if (!me.ok) throw new Error('join failed');
    expect(room.hostId).toBe(me.player.id);
    room.addTestPlayer();
    room.addTestPlayer();
    const host = { kind: 'player' as const, id: me.player.id };
    room.advance(host, 'START');
    room.advance(host, 'CHOOSE_HOCKEY');
    room.setTeam(me.player.id, 'BLUE');
    room.setReady(me.player.id, true);
    room.housekeeping();
    expect(room.teamCheck().ok).toBe(true); // 2v2
    room.advance(host, 'NEXT');
    room.advance(host, 'START_MATCH');
    for (let i = 0; i < 60 * 20; i++) room.tick();
    const bots = room.match!.skaters.filter((s) => s.id !== me.player.id);
    expect(bots.length).toBe(3);
    expect(bots.some((s) => Math.hypot(s.vx, s.vy) > 10 || s.x !== 430)).toBe(true);
    room.match!.devSetClock(10);
    for (let i = 0; i < 400 && room.phase !== 'RESULTS'; i++) room.tick();
    expect(room.phase).toBe('RESULTS');
    room.removeTestPlayers();
    expect(room.players.length).toBe(1);
    expect(room.hostId).toBe(me.player.id);
  });

  it('host passes only to humans', () => {
    const { room, advanceTime } = makeRoom();
    const a = room.join('A');
    room.addTestPlayer();
    if (!a.ok) throw new Error();
    room.disconnect(a.player.id);
    advanceTime(10000);
    room.housekeeping();
    expect(room.players.find((p) => p.id === room.hostId)?.testPlayer ?? false).toBe(false);
  });
});

describe('easter eggs and dumb bots', () => {
  function blowout(opts: { quipChance: number; quipCooldownMs: number }) {
    let t = 1000;
    const room = new Room({ now: () => t, random: () => 0, ...opts });
    const me = room.join('Me');
    if (!me.ok) throw new Error();
    room.addTestPlayer('dumb');
    const host = { kind: 'player' as const, id: me.player.id };
    room.advance(host, 'START');
    room.advance(host, 'CHOOSE_HOCKEY');
    room.setTeam(me.player.id, 'BLUE');
    room.setReady(me.player.id, true);
    room.housekeeping();
    room.advance(host, 'NEXT');
    room.advance(host, 'START_MATCH');
    while (room.phase !== 'PLAYING') room.tick();
    const m = room.match!;
    const quips: number[] = [];
    for (let g = 0; g < 6; g++) {
      while (room.phase !== 'PLAYING') room.tick();
      m.devForceGoal('BLUE');
      for (let i = 0; i < 5; i++) room.tick();
      for (const e of m.drainEvents()) if (e.type === 'quip') quips.push(m.score.BLUE);
      t += 1000;
    }
    return quips;
  }

  it('quip fires only once the losing team is down 3+ and the leader scores again; respects cooldown', () => {
    expect(blowout({ quipChance: 1, quipCooldownMs: 0 })).toEqual([4, 5, 6]);
    expect(blowout({ quipChance: 1, quipCooldownMs: 60_000 })).toEqual([4]);
    expect(blowout({ quipChance: 0, quipCooldownMs: 0 })).toEqual([]);
  });

  it('dumb bots are test players that never host and play badly', () => {
    const { room } = makeRoom();
    room.addTestPlayer('dumb');
    expect(room.hostId).toBeNull();
    expect(room.publicState().players[0]).toMatchObject({ test: true, dumb: true, name: 'Dumb Bot A' });
  });
});

describe('appearance', () => {
  it('everyone gets a valid look on join; it survives reconnect', () => {
    const { room } = makeRoom();
    const [a] = joinN(room, 3);
    const look = { ...room.getPlayer(a.player.id)!.look };
    expect(sanitizeLook(look)).toEqual(look);
    room.disconnect(a.player.id);
    room.join('', a.token);
    expect(room.getPlayer(a.player.id)!.look).toEqual(look);
  });

  it('setLook validates input and is blocked during a match', () => {
    const { room } = makeRoom();
    const { ps, host } = toTeams(room, 1, 1);
    const id = ps[0].player.id;
    room.setLook(id, { skin: 2, head: 3, face: 1, body: 2, accent: 4 });
    expect(room.getPlayer(id)!.look).toEqual({ skin: 2, head: 3, face: 1, body: 2, accent: 4 });
    expect(() => room.setLook(id, { skin: 99, head: 0, face: 0, body: 0, accent: 0 })).toThrow(RoomError);
    expect(() => room.setLook(id, 'hat')).toThrow(RoomError);
    room.advance(host, 'NEXT');
    room.advance(host, 'START_MATCH');
    expect(() => room.setLook(id, { skin: 0, head: 0, face: 0, body: 0, accent: 0 })).toThrow(/after the match/);
  });

  it('teammates never share an accent colour', () => {
    const { room } = makeRoom();
    const ps = joinN(room, 8);
    for (const p of ps) room.setLook(p.player.id, { skin: 0, head: 0, face: 0, body: 0, accent: 2 });
    const host = { kind: 'player' as const, id: ps[0].player.id };
    room.advance(host, 'START');
    room.advance(host, 'CHOOSE_HOCKEY');
    ps.forEach((p, i) => room.setTeam(p.player.id, i < 4 ? 'RED' : 'BLUE'));
    room.housekeeping();
    for (const team of ['RED', 'BLUE'] as const) {
      const accents = room.players.filter((p) => p.team === team).map((p) => p.look.accent);
      expect(new Set(accents).size).toBe(4);
    }
    // picking a teammate's colour gets you a free one instead
    const red = room.players.filter((p) => p.team === 'RED');
    room.setLook(red[1].id, { ...red[1].look, accent: red[0].look.accent });
    expect(red[1].look.accent).not.toBe(red[0].look.accent);
  });
});

describe('input handling', () => {
  it('ignores stale seq, clamps values, neutralizes on disconnect', () => {
    const { room } = makeRoom();
    const { ps, host } = toTeams(room, 1, 1);
    room.advance(host, 'NEXT');
    room.advance(host, 'START_MATCH');
    const id = ps[0].player.id;
    room.input(id, { seq: 5, x: 9, y: 0, pass: false, shoot: false });
    const s = room.match!.getSkater(id)!;
    expect(s.input.x).toBe(1);
    room.input(id, { seq: 4, x: -1, y: 0, pass: false, shoot: false });
    expect(s.input.x).toBe(1); // stale packet ignored
    room.input(id, { seq: 6, x: NaN as number, y: 0, pass: false, shoot: true });
    expect(s.input.x).toBe(0);
    room.disconnect(id);
    expect(s.input.shoot).toBe(false);
    expect(s.connected).toBe(false);
  });
});
