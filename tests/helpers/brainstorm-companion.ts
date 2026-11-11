import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import path from 'node:path';
import { once } from 'node:events';

export const KEY = '0123456789abcdef0123456789abcdef'; // 合成テスト値
const ROOT = path.resolve('.');
const SCRIPT =
  process.env.BRAINSTORM_TEST_SCRIPT ??
  path.join(ROOT, '.agents/skills/brainstorming/scripts/server.cjs');

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

export async function startCompanion() {
  mkdirSync('/tmp/codex/issue785', { recursive: true });
  const dir = mkdtempSync('/tmp/codex/issue785/implement-');
  mkdirSync(path.join(dir, 'content'));
  writeFileSync(
    path.join(dir, 'content/screen.html'),
    '<h1>Test screen</h1><img src="/files/asset.txt"><button data-choice="yes">Choose</button>'
  );
  writeFileSync(path.join(dir, 'content/asset.txt'), 'synthetic asset');
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [SCRIPT], {
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith('BRAINSTORM_'))
      ),
      BRAINSTORM_DIR: dir,
      BRAINSTORM_HOST: '127.0.0.1',
      BRAINSTORM_PORT: String(port),
      BRAINSTORM_TOKEN: KEY,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr!.resume();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearInterval(poll);
        clearTimeout(timer);
        child.off('error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onError = () => finish(new Error('Companion process could not start'));
      const timer = setTimeout(() => finish(new Error('Companion startup timed out')), 5000);
      const poll = setInterval(() => {
        if (output.includes('server-started')) finish();
        else if (child.exitCode !== null) finish(new Error('Companion exited during startup'));
      }, 20);
      child.once('error', onError);
    });
  } catch (error) {
    child.kill();
    spawnSync('bash', [path.join(ROOT, 'scripts/rm-tmp.sh'), '-r', dir]);
    throw error;
  }
  const base = `http://127.0.0.1:${port}`;
  const events = () =>
    existsSync(path.join(dir, 'state/events'))
      ? readFileSync(path.join(dir, 'state/events'), 'utf8')
      : '';
  return {
    dir,
    port,
    base,
    events,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await once(child, 'exit');
      }
      const result = spawnSync('bash', [path.join(ROOT, 'scripts/rm-tmp.sh'), '-r', dir]);
      if (result.status !== 0) throw new Error('Temporary fixture cleanup failed');
    },
  };
}

// 実際の HTTP upgrade とマスク済み choice frame を使い、拒否時の切断を確認する。
export async function upgrade(port: number, target: string, headers: Record<string, string> = {}) {
  return new Promise<{ accepted: boolean }>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let response = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Upgrade produced no observable response'));
    }, 3000);
    const finish = (accepted: boolean) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ accepted });
    };
    socket.on('connect', () => {
      const extra = Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}\r\n`)
        .join('');
      const payload = Buffer.from(JSON.stringify({ choice: 'injected' }));
      const mask = Buffer.from([1, 2, 3, 4]);
      const encoded = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${extra}\r\n`
      );
      socket.once('data', () =>
        socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, encoded]))
      );
    });
    socket.on('data', (data) => {
      response += data.toString();
      if (response.includes('\r\n\r\n')) {
        if (response.startsWith('HTTP/1.1 101')) setTimeout(() => finish(true), 50);
        else finish(false);
      }
    });
    socket.on('end', () => finish(false));
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNRESET') finish(false);
      else {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}
