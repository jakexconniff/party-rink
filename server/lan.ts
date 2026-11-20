import os from 'node:os';

export interface LanAddress {
  ip: string;
  iface: string;
  score: number;
}

const VIRTUAL = /(vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|bluetooth|tailscale|zerotier|vpn|tap|tun|utun|hamachi)/i;

function privateRank(ip: string): number {
  if (ip.startsWith('192.168.')) return 30;
  if (ip.startsWith('10.')) return 20;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && +m[1] >= 16 && +m[1] <= 31) return 10;
  if (ip.startsWith('169.254.')) return -50; // link-local: almost never what we want
  return 0;
}

/** Candidate LAN IPv4 addresses, best first. */
export function lanAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  const ifs = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifs)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let score = privateRank(a.address);
      if (VIRTUAL.test(name)) score -= 40;
      if (/wi-?fi|wlan|wireless/i.test(name)) score += 5;
      out.push({ ip: a.address, iface: name, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** All IPv4/IPv6 addresses belonging to this machine (used to recognize laptop-local admin clients). */
export function localAddresses(): Set<string> {
  const set = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      set.add(a.address);
      if (a.family === 'IPv4') set.add(`::ffff:${a.address}`);
    }
  }
  return set;
}

export function isLocalAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  return localAddresses().has(addr);
}
