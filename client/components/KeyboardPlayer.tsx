// The player on the TV screen itself: keyboard + mouse input during a match, with a small HUD strip.
import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { ControlState, Team } from '../../shared/types';
import { useInputSender, useKeyboardMouse } from './keyboardInput';

const CHARGE_MS = 1500;

interface Props {
  socket: Socket;
  cs: ControlState | null;
  team: Team;
  name: string;
  number: number;
}

export function KeyboardPlayer({ socket, cs, team, name, number }: Props) {
  const { input, send } = useInputSender(socket);
  const [passDown, setPassDown] = useState(false);
  const [shootDown, setShootDown] = useState(false);
  const shootStart = useRef(0);
  const [charge, setCharge] = useState(0);

  const kb = useKeyboardMouse({
    onMove: (x, y) => {
      input.current.x = x;
      input.current.y = y;
      send(true);
    },
    onButton: (which, down) => {
      input.current[which] = down;
      if (which === 'pass') setPassDown(down);
      else {
        if (down) shootStart.current = performance.now();
        input.current.cancel = false;
        setShootDown(down);
      }
      send(true);
    },
  });

  // Let go of everything if the window loses focus (keys would otherwise stay "held").
  useEffect(() => {
    const release = () => {
      kb.release();
      const wasShoot = input.current.shoot;
      input.current = { x: 0, y: 0, pass: false, shoot: false, cancel: wasShoot };
      setPassDown(false);
      setShootDown(false);
      send(true);
    };
    const onVis = () => {
      if (document.visibilityState !== 'visible') release();
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVis);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const hasPuck = !!cs?.hasPuck;
  const charging = shootDown && (hasPuck || !!cs?.charging);
  const perfect = charge >= 0.8 && charge <= 0.95;
  const status = cs?.stumbling
    ? 'Whiff! 💫'
    : cs?.boosting
      ? 'BOOST! ⚡'
      : !hasPuck && cs?.catchHint
        ? 'Click to catch!'
        : hasPuck
          ? 'You have the puck'
          : '';

  return (
    <div className={`kb-hud ${team}`}>
      <span className={`num-badge ${team}`}>{number}</span>
      <b>{name}</b>
      <span className="kb-keys">
        <kbd>WASD</kbd> skate · <kbd className={passDown ? 'on' : ''}>Left click</kbd> {hasPuck ? 'PASS' : 'POKE'} ·{' '}
        <kbd className={shootDown ? 'on' : ''}>Right click</kbd> SHOOT
      </span>
      {charging ? (
        <span className="kb-charge">
          <span className="sweet" />
          <span
            className={`fill ${perfect ? 'perfect' : charge > 1 ? 'over' : ''}`}
            style={{ width: `${Math.round(Math.min(1, charge) * 100)}%` }}
          />
        </span>
      ) : null}
      {status ? <span className="kb-status">{status}</span> : null}
    </div>
  );
}
