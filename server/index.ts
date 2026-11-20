// Entry point. `npm run dev` (Vite middleware, dev hooks) or `npm start` (built client).
import readline from 'node:readline';
import { createPartyServer } from './app';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const port = Number(process.env.PORT) || 3000;

async function main() {
  let server;
  try {
    server = await createPartyServer({
      port,
      devHooks: dev || process.env.PARTY_DEV === '1',
      client: dev ? 'vite' : 'static',
      lanIp: process.env.LAN_IP,
    });
  } catch (e: any) {
    if (e?.code === 'EADDRINUSE') {
      console.error(`\n  Port ${port} is already in use. Close the other Party Rink window, or run with another port:`);
      console.error(`    PowerShell:  $env:PORT=3001; npm start\n`);
    } else {
      console.error('\n  Failed to start:', e?.message ?? e, '\n');
    }
    process.exit(1);
  }

  const info = await server.info();
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  PARTY RINK is running${dev ? '  (dev mode)' : ''}\n${line}`);
  console.log(`  TV (open on this laptop):  http://localhost:${server.port}/tv`);
  if (info.urls.length) {
    console.log(`  Phones join at:            ${info.urls[0].url}`);
    for (const u of info.urls.slice(1)) console.log(`     other address:          ${u.url}   (${u.iface})`);
  } else {
    console.log(`  ! ${info.warning}`);
  }
  console.log(`  Health check:              http://localhost:${server.port}/health`);
  console.log(`${line}\n  Keys: [l] back to lobby  [r] full reset  [e] end match  [s] status  [q] quit\n${line}\n`);

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (_s, key) => {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        void server!.close().then(() => process.exit(0));
        return;
      }
      const room = server!.room;
      if (key.name === 'l') {
        server!.adminReset(true);
      } else if (key.name === 'r') {
        server!.adminReset(false);
      } else if (key.name === 'e') {
        room.endMatch();
        console.log('[admin] match ended');
      } else if (key.name === 's') {
        console.log(
          `[status] phase=${room.phase} players=${room.players
            .map((p) => `#${p.number}${p.name}${p.connected ? '' : '(off)'}${p.team ? '/' + p.team[0] : ''}`)
            .join(' ')}`,
        );
      }
    });
  }

  const shutdown = () => void server!.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
