import { io, type Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
import type { RoomState } from '../../shared/types';

export function makeSocket(role: 'tv' | 'phone'): Socket {
  return io({
    auth: { role },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 2000,
  });
}

export function useConnected(socket: Socket) {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, [socket]);
  return connected;
}

export function useRoomState(socket: Socket) {
  const [state, setState] = useState<RoomState | null>(null);
  useEffect(() => {
    const h = (s: RoomState) => setState(s);
    socket.on('room:state', h);
    return () => {
      socket.off('room:state', h);
    };
  }, [socket]);
  return state;
}

export const fmtClock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode etc. */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
