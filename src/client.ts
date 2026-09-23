import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'ayesh.proto');
const HOST = process.env.AYESH_GRPC_HOST || 'localhost:50051';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getClient(): any {
  if (cachedClient) return cachedClient;
  const definition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = grpc.loadPackageDefinition(definition) as any;
  const ayesh = root.ayesh;
  cachedClient = new ayesh.AyeshService(HOST, grpc.credentials.createInsecure());
  return cachedClient;
}

export function call<T>(method: string, request: Record<string, unknown>, timeoutMs = 90000): Promise<T> {
  return new Promise((resolve, reject) => {
    getClient()[method](request, { deadline: Date.now() + timeoutMs }, (err: Error | null, res: T) => {
      err ? reject(err) : resolve(res);
    });
  });
}

export interface StreamResult {
  tokens: string;
  chunks: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  last: any;
}

export function chatStream(
  message: string,
  sessionId: string | undefined,
  onToken: (token: string) => void
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const stream = getClient().ChatStream();
    let tokens = '';
    let chunks = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let last: any = null;

    stream.on('data', (chunk: { token?: string; done?: boolean }) => {
      chunks++;
      last = chunk;
      if (chunk.token) {
        tokens += chunk.token;
        onToken(chunk.token);
      }
      if (chunk.done) {
        stream.end();
        resolve({ tokens, chunks, last });
      }
    });
    stream.on('error', reject);
    stream.write({ message, session_id: sessionId ?? '', interrupt: false });
  });
}
