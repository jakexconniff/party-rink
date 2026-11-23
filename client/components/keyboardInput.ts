// Shared input plumbing for the controllers: sending input to the server, and keyboard + mouse play.
import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { InputMsg } from '../../shared/types';

const SEND_MIN_MS = 33; // ≤30 Hz on change
const HEARTBEAT_MS = 120;

export type InputState = { x: number; y: number; pass: boolean; shoot: boolean; cancel: boolean };

/** Holds the current input and sends it to the server (rate-limited, plus a heartbeat for the stale-input watchdog). */
export function useInputSender(socket: Socket) {
  const input = useRef<InputState>({ x: 0, y: 0, pass: false, shoot: false, cancel: false });
  const seq = useRef(Date.now() % 1e6); // monotonically increasing across reloads
  const lastSent = useRef(0);
  const pending = useRef<number | null>(null);

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

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (performance.now() - lastSent.current >= HEARTBEAT_MS) sendNow();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  return { input, send };
}

export interface KeyboardMouseHandlers {
  /** Movement from the keys, already normalised (diagonals are 0.71). */
  onMove: (x: number, y: number) => void;
  /** An action went down/up. Several keys/buttons can hold one action; this fires only when its state changes. */
  onButton: (which: 'pass' | 'shoot', down: boolean) => void;
}

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const ACTION: Record<string, 'pass' | 'shoot'> = { KeyJ: 'pass', KeyK: 'shoot', Space: 'shoot' };
const MOUSE: Record<number, 'pass' | 'shoot'> = { 0: 'pass', 2: 'shoot' };

/**
 * Keyboard + mouse play while mounted: WASD/arrows skate, left click (or J) = PASS/POKE,
 * right click (or K / Space) = SHOOT. Clicks on real buttons (help, pause, admin…) still work,
 * except inside `.ctl-body` (the phone controller's own on-screen buttons), which the mouse drives.
 */
export function useKeyboardMouse(handlers: KeyboardMouseHandlers) {
  const h = useRef(handlers);
  h.current = handlers;
  const api = useRef({ release: () => {} });

  useEffect(() => {
    const keys = new Set<string>();
    const held = { pass: new Set<string>(), shoot: new Set<string>() };

    const applyKeys = () => {
      let x = 0;
      let y = 0;
      for (const k of keys) {
        x += MOVE[k][0];
        y += MOVE[k][1];
      }
      x = Math.sign(x);
      y = Math.sign(y);
      const d = Math.hypot(x, y) || 1;
      h.current.onMove(Math.round((x / d) * 100) / 100, Math.round((y / d) * 100) / 100);
    };
    const press = (which: 'pass' | 'shoot', src: string, down: boolean) => {
      const set = held[which];
      const was = set.size > 0;
      if (down) set.add(src);
      else set.delete(src);
      if (set.size > 0 !== was) h.current.onButton(which, !was);
    };
    api.current.release = () => {
      keys.clear();
      held.pass.clear();
      held.shoot.clear();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      if (MOVE[e.code]) {
        e.preventDefault();
        if (!keys.has(e.code)) {
          keys.add(e.code);
          applyKeys();
        }
      } else if (ACTION[e.code]) {
        e.preventDefault();
        if (!e.repeat) press(ACTION[e.code], e.code, true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (MOVE[e.code]) {
        if (keys.delete(e.code)) applyKeys();
      } else if (ACTION[e.code]) press(ACTION[e.code], e.code, false);
    };
    // Mouse only: touch taps also fire mouse events, so ignore those right after a touch.
    let lastTouch = 0;
    const onTouch = () => {
      lastTouch = performance.now();
    };
    const isUi = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : null;
      if (!el) return false;
      return !!el.closest('button, a, input, select, label, .help-overlay, .tv-player-panel') && !el.closest('.ctl-body');
    };
    // Stop the phone controller's on-screen buttons/stick from also reacting to the mouse.
    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !isUi(e.target)) e.stopPropagation();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (performance.now() - lastTouch < 1000 || isUi(e.target) || !MOUSE[e.button]) return;
      e.preventDefault();
      press(MOUSE[e.button], `mouse${e.button}`, true);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (MOUSE[e.button]) press(MOUSE[e.button], `mouse${e.button}`, false);
    };
    const onContext = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('touchstart', onTouch, { capture: true, passive: true });
    window.addEventListener('pointerdown', onPointerDownCapture, true);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContext);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('touchstart', onTouch, true);
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContext);
    };
  }, []);

  /** Forget held keys/buttons (window lost focus etc.). */
  return { release: () => api.current.release() };
}
