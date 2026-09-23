#!/usr/bin/env bun
import { call, chatStream } from './client';

const USAGE = `ayesh — CLI untuk server Ayesh (gRPC ${process.env.AYESH_GRPC_HOST || 'localhost:50051'})

Penggunaan:
  ayesh health                      Cek kesehatan server
  ayesh chat <pesan> [--session ID] Chat streaming (token realtime)
  ayesh skills                      Daftar skill
  ayesh files [path]                List file (default: root project)
  ayesh read <path>                 Baca file
  ayesh config                      Lihat config LLM aktif
  ayesh help                        Bantuan

Env:
  AYESH_GRPC_HOST   default localhost:50051`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function out(v: unknown) {
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

async function main() {
  const [, , cmd, ...rest] = process.argv;

  switch (cmd) {
    case 'health': {
      const h = await call<{ healthy: boolean; version: string; postgres_connected: boolean; redis_connected: boolean }>('HealthCheck', {});
      out(h);
      process.exit(h.healthy ? 0 : 1);
      break;
    }

    case 'chat': {
      const flags = rest.filter((a) => a.startsWith('--'));
      const positional = rest.filter((a) => !a.startsWith('--'));
      const sIdx = flags.findIndex((f) => f.startsWith('--session'));
      let sessionId: string | undefined;
      if (sIdx !== -1) sessionId = flags[sIdx].split('=')[1] ?? flags[sIdx + 1];
      const message = positional.join(' ');
      if (!message) {
        console.error('Pesan kosong. Contoh: ayesh chat "halo, siapa kamu?"');
        process.exit(2);
      }
      const res = await chatStream(message, sessionId, (t) => process.stdout.write(t));
      console.log(`\n---\nchunks=${res.chunks} usage=${JSON.stringify(res.last?.usage ?? null)}`);
      process.exit(0);
      break;
    }

    case 'skills': {
      const s = await call<{ skills: Array<{ name: string; description?: string }> }>('ListSkills', {});
      for (const sk of s.skills) out(`${sk.name}${sk.description ? ` — ${sk.description}` : ''}`);
      process.exit(0);
      break;
    }

    case 'files': {
      const f = await call<{ files: Array<{ name: string; is_dir: boolean; size: number }> }>('ListFiles', {
        path: rest[0] ?? '.',
      });
      if (f.files.length === 0) console.log('(kosong)');
      for (const file of f.files) out(`${file.is_dir ? 'd' : '-'} ${String(file.size).padStart(10)} ${file.name}`);
      process.exit(0);
      break;
    }

    case 'read': {
      if (!rest[0]) {
        console.error('Butuh path: ayesh read <path>');
        process.exit(2);
      }
      const r = await call<{ content: string }>('ReadFile', { path: rest[0] });
      process.stdout.write(r.content);
      process.exit(0);
      break;
    }

    case 'config': {
      out(await call<Record<string, unknown>>('GetConfig', {}));
      process.exit(0);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(USAGE);
      process.exit(cmd ? 0 : 2);
      break;

    default:
      console.error(`Perintah tidak dikenal: ${cmd}\n\n${USAGE}`);
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`ERROR: ${(e as Error).message}`);
  process.exit(1);
});
