import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { ControlState, InputMsg, Team } from '../../shared/types';
import { fmtClock } from '../net/socket';

const STICK_RADIUS = 62;
const SEND_MIN_MS = 33; // ≤30 Hz on change
const HEARTBEAT_MS = 120;
const CHARGE_MS = 1500;

/** Android Chrome can lock to landscape once in fullscreen; iOS can't — the rotate prompt covers it. */
let lockTried = false;
function tryLandscapeLock() {
  if (lockTried) return;
  lockTried = true;
  try {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (!el.requestFullscreen || !orient?.lock || !matchMedia('(orientation: landscape)').matches) return;
    el.requestFullscreen()
      .then(() => orient.lock!('landscape'))
      .catch(() => undefined);
  } catch {
    /* optional nicety only */
  }
}

interface Props {
  socket: Socket;
  cs: ControlState | null;
  team: Team;
  name: string;
  number: number;
  connected: boolean;
}

export function Controller({ socket, cs, team, name, number, connected }: Props) {
  const input = useRef({ x: 0, y: 0, pass: false, shoot: false, cancel: false });
  const seq = useRef(Date.now() % 1e6); // monotonically increasing across reloads
  const lastSent = useRef(0);
  const pending = useRef<number | null>(null);
  const stickId = useRef<number | null>(null);
  const passId = useRef<number | null>(null);
  const shootId = useRef<number | null>(null);
  const stickOrigin = useRef({ x: 0, y: 0 });
  const baseEl = useRef<HTMLDivElement>(null);
  const knobEl = useRef<HTMLDivElement>(null);
  const zoneEl = useRef<HTMLDivElement>(null);
  const [passDown, setPassDown] = useState(false);
  const [shootDown, setShootDown] = useState(false);
  const shootStart = useRef(0);
  const [charge, setCharge] = useState(0);

  const sendNow = () => {
    pending.current = null;
    lastSent.current = performance.now();
    seq.current += 1;
    const msg: InputMsg = { seq: seq.current, ...input.current };
    socket.emit('input:state', msg);
    input.current.cancel = false;
  };
  const send = (urgent = false) => {
    const since = performance.now() - lastSent.current;
    if (urgent || since >= SEND_MIN_MS) sendNow();
    else if (pending.current === null) pending.current = window.setTimeout(sendNow, SEND_MIN_MS - since);
  };

  // heartbeat keeps the server's stale-input watchdog happy while a stick is held
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (performance.now() - lastSent.current >= HEARTBEAT_MS) sendNow();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const placeStick = (show: boolean, bx = 0, by = 0, kx = 0, ky = 0) => {
    const b = baseEl.current;
    const k = knobEl.current;
    if (!b || !k) return;
    b.style.display = k.style.display = show ? 'block' : 'none';
    b.style.left = `${bx}px`;
    b.style.top = `${by}px`;
    k.style.left = `${kx}px`;
    k.style.top = `${ky}px`;
  };

  const releaseAll = (cancel: boolean) => {
    stickId.current = passId.current = shootId.current = null;
    const wasShoot = input.current.shoot;
    input.current = { x: 0, y: 0, pass: false, shoot: false, cancel: cancel && wasShoot };
    setPassDown(false);
    setShootDown(false);
    placeStick(false);
    send(true);
  };

  useEffect(() => {
    const onHide = () => releaseAll(true);
    const onVis = () => {
      if (document.visibilityState !== 'visible') releaseAll(true);
    };
    window.addEventListener('blur', onHide);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('orientationchange', onHide);
    document.addEventListener('visibilitychange', onVis);
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('gesturestart', prevent as EventListener);
    return () => {
      window.removeEventListener('blur', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('orientationchange', onHide);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('gesturestart', prevent as EventListener);
      releaseAll(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // charge meter animation (local, smooth; server is authoritative about the actual shot)
  useEffect(() => {
    if (!shootDown) {
      setCharge(0);
      return;
    }
    let raf = 0;
    const loop = () => {
      setCharge((performance.now() - shootStart.current) / CHARGE_MS);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shootDown]);

  // ---- stick
  const zoneXY = (e: React.PointerEvent) => {
    const r = zoneEl.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onStickDown = (e: React.PointerEvent) => {
    e.preventDefault();
    tryLandscapeLock();
    if (stickId.current !== null) return;
    stickId.current = e.pointerId;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = zoneXY(e);
    stickOrigin.current = p;
    placeStick(true, p.x, p.y, p.x, p.y);
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current) return;
    e.preventDefault();
    const p = zoneXY(e);
    let dx = p.x - stickOrigin.current.x;
    let dy = p.y - stickOrigin.current.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      // drag the base along so the stick never feels "stuck" at the rim
      const over = d - STICK_RADIUS;
      stickOrigin.current.x += (dx / d) * over;
      stickOrigin.current.y += (dy / d) * over;
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    placeStick(true, stickOrigin.current.x, stickOrigin.current.y, stickOrigin.current.x + dx, stickOrigin.current.y + dy);
    input.current.x = Math.round((dx / STICK_RADIUS) * 100) / 100;
    input.current.y = Math.round((dy / STICK_RADIUS) * 100) / 100;
    send();
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null;
    input.current.x = input.current.y = 0;
    placeStick(false);
    send(true);
  };

  // ---- buttons
  const btnDown = (which: 'pass' | 'shoot') => (e: React.PointerEvent) => {
    e.preventDefault();
    const ref = which === 'pass' ? passId : shootId;
    if (ref.current !== null) return;
    ref.current = e.pointerId;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    input.current[which] = true;
    if (which === 'pass') setPassDown(true);
    else {
      shootStart.current = performance.now();
      setShootDown(true);
    }
    send(true);
  };
  const btnUp = (which: 'pass' | 'shoot', cancel: boolean) => (e: React.PointerEvent) => {
    const ref = which === 'pass' ? passId : shootId;
    if (ref.current !== e.pointerId) return;
    ref.current = null;
    input.current[which] = false;
    if (which === 'shoot') {
      input.current.cancel = cancel;
      setShootDown(false);
    } else setPassDown(false);
    send(true);
  };

  const hasPuck = !!cs?.hasPuck;
  const phase = cs?.phase;

  // Haptics (Android; iOS Safari ignores vibrate) — purely a nicety.
  const prev = useRef<{ hasPuck: boolean; score: [number, number]; stumbling: boolean } | null>(null);
  useEffect(() => {
    if (!cs) return;
    const buzz = (p: number | number[]) => {
      try {
        navigator.vibrate?.(p);
      } catch {
        /* unsupported */
      }
    };
    const p = prev.current;
    if (p) {
      if (cs.hasPuck && !p.hasPuck) buzz(35);
      if (cs.stumbling && !p.stumbling) buzz(90);
      const mine = team === 'RED' ? 0 : 1;
      if (cs.score[mine] > p.score[mine]) buzz([120, 60, 120, 60, 220]);
    }
    prev.current = { hasPuck: cs.hasPuck, score: cs.score, stumbling: cs.stumbling };
  }, [cs, team]);

  const charging = shootDown && (hasPuck || !!cs?.charging);
  const perfectZone = charge >= 0.8 && charge <= 0.95;
  const pokeCooldown = !hasPuck && cs ? 1 - cs.pokeReady : 0;
  const catchHint = !hasPuck && !!cs?.catchHint;
  const status = cs?.stumbling ? 'Whiff! 💫' : cs?.boosting ? 'BOOST! ⚡' : catchHint ? 'Tap POKE to catch!' : '';
  const banner =
    phase === 'COUNTDOWN' ? 'Get ready…' : phase === 'GOAL_PAUSE' ? 'GOAL!' : !connected ? 'Reconnecting…' : null;

  return (
    <div className={`ctl ${team}`}>
      <div className="ctl-top">
        <span>
          <span className={`num-badge ${team}`}>{number}</span> {name}
        </span>
        <span className="score">
          <span className="red-t">{cs?.score[0] ?? 0}</span> – <span className="blue-t">{cs?.score[1] ?? 0}</span>{' '}
          · {fmtClock(cs?.clockMs ?? 0)}
        </span>
        <span>
          <span className={`dot ${connected ? '' : 'bad'}`} />
          {hasPuck ? (
            <>
              <span className="puck-dot" />
              PUCK
            </>
          ) : null}
        </span>
      </div>
      <div className="ctl-body">
        <div
          ref={zoneEl}
          className="stick-zone"
          onPointerDown={onStickDown}
          onPointerMove={onStickMove}
          onPointerUp={onStickUp}
          onPointerCancel={onStickUp}
          onLostPointerCapture={onStickUp}
        >
          <div ref={baseEl} className="stick-base" style={{ display: 'none' }} />
          <div ref={knobEl} className="stick-knob" style={{ display: 'none' }} />
          <div className="stick-hint">Left thumb: drag anywhere here to skate</div>
        </div>
        <div className="btn-zone">
          <button
            className={`act ${hasPuck ? 'pass' : 'poke'} ${passDown ? 'down' : ''} ${catchHint ? 'catch-hint' : ''}`}
            onPointerDown={btnDown('pass')}
            onPointerUp={btnUp('pass', false)}
            onPointerCancel={btnUp('pass', true)}
            onLostPointerCapture={btnUp('pass', true)}
          >
            {pokeCooldown > 0.02 ? (
              <div className="poke-cool" style={{ transform: `scaleY(${pokeCooldown})` }} />
            ) : null}
            <span>{hasPuck ? 'PASS' : 'POKE'}</span>
            <small>{hasPuck ? 'to teammate' : catchHint ? 'tap to catch!' : 'steal puck'}</small>
          </button>
          <button
            className={`act shoot ${hasPuck || cs?.charging ? '' : 'inactive'} ${shootDown ? 'down' : ''}`}
            onPointerDown={btnDown('shoot')}
            onPointerUp={btnUp('shoot', false)}
            onPointerCancel={btnUp('shoot', true)}
            onLostPointerCapture={btnUp('shoot', true)}
          >
            {charging ? (
              <>
                <div className="sweet-spot" />
                <div
                  className={`charge-fill ${perfectZone ? 'perfect' : charge > 1 ? 'over' : ''}`}
                  style={{ height: `${Math.round(Math.min(1, charge) * 100)}%` }}
                />
              </>
            ) : null}
            <span>{charging && perfectZone ? 'NOW!' : 'SHOOT'}</span>
            <small>
              {charging
                ? charge > 1
                  ? 'too long — aim wobbles!'
                  : 'release in the green'
                : hasPuck
                  ? 'tap or hold to charge'
                  : 'hold for one-timer'}
            </small>
          </button>
        </div>
      </div>
      {banner ? <div className="ctl-banner">{banner}</div> : null}
      {status && !banner ? (
        <div className="ctl-status" style={{ color: cs?.stumbling ? '#ffb020' : '#50e6ff' }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
