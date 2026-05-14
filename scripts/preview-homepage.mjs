#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 9765;
const DEFAULT_DATA_DIR = path.join(os.homedir(), '.cc-connect');
const DEFAULT_TOKEN_FILE = path.join(os.homedir(), '.cc-connect', 'homepage-preview.token');
const DEFAULT_QUEUE_DIR = path.join(ROOT, '.cc-connect', 'homepage-preview-requests');
const DEFAULT_OUT = '/tmp/homepage-preview.png';
const DEFAULT_PROJECT = 'homepage';
const OUTPUT_PREFIX = '/tmp/homepage-preview';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function parseArgs(argv) {
  const options = {
    mode: 'direct',
    port: DEFAULT_PORT,
    tokenFile: DEFAULT_TOKEN_FILE,
    queueDir: DEFAULT_QUEUE_DIR,
    out: DEFAULT_OUT,
    project: DEFAULT_PROJECT,
    send: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--serve') {
      options.mode = 'serve';
    } else if (arg === '--request') {
      options.mode = 'request';
    } else if (arg === '--queue' || arg === '--enqueue') {
      options.mode = 'queue';
    } else if (arg === '--send') {
      options.send = true;
    } else if (arg === '--port') {
      options.port = Number(argv[++i]);
    } else if (arg === '--token-file') {
      options.tokenFile = argv[++i];
    } else if (arg === '--queue-dir') {
      options.queueDir = argv[++i];
    } else if (arg === '--out') {
      options.out = argv[++i];
    } else if (arg === '--project') {
      options.project = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function normalizeOutputPath(outPath) {
  const resolved = path.resolve(outPath);
  if (!resolved.startsWith(OUTPUT_PREFIX) || path.extname(resolved).toLowerCase() !== '.png') {
    throw new Error(`Output path must be a PNG under ${OUTPUT_PREFIX}*.png`);
  }
  return resolved;
}

function normalizeProject(project) {
  if (project !== DEFAULT_PROJECT) {
    throw new Error(`Preview send-back is restricted to project "${DEFAULT_PROJECT}"`);
  }
  return project;
}

function printHelp() {
  console.log(`Usage:
  node scripts/preview-homepage.mjs [--send] [--out /tmp/homepage-preview.png]
  node scripts/preview-homepage.mjs --serve [--port 9765]
  node scripts/preview-homepage.mjs --queue [--send] [--project homepage]
  node scripts/preview-homepage.mjs --request [--send] [--project homepage]

Direct mode starts a temporary static server, captures the homepage with
Playwright, and optionally sends the image back through cc-connect.
Queue mode writes a preview request file that the local preview service
processes outside the Codex sandbox without opening a local socket.
Request mode asks the local preview service to do that work outside the
Codex sandbox through localhost when that is allowed.`);
}

function ensureToken(tokenFile) {
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  }

  fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  return token;
}

function readToken(tokenFile) {
  return fs.readFileSync(tokenFile, 'utf8').trim();
}

function isAuthorized(request, token) {
  const auth = request.headers.authorization || '';
  const headerToken = request.headers['x-preview-token'] || '';
  return auth === `Bearer ${token}` || headerToken === token;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 8192) {
        reject(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function safeStaticPath(urlPath) {
  const parsedPath = decodeURIComponent(urlPath.split('?')[0]);
  const relativePath = parsedPath === '/' ? 'index.html' : parsedPath.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(`${ROOT}${path.sep}`) && resolved !== ROOT) {
    return null;
  }
  return resolved;
}

function createStaticServer() {
  return http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end('Method not allowed');
      return;
    }

    const filePath = safeStaticPath(request.url || '/');
    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      fs.createReadStream(filePath).pipe(response);
    });
  });
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with ${code}\n${stdout}${stderr}`));
      }
    });
  });
}

function resolveCcConnectBin() {
  return process.env.CC_CONNECT_BIN || 'cc-connect';
}

function resolveSessionKey(project) {
  if (process.env.CC_CONNECT_SESSION_KEY) {
    return process.env.CC_CONNECT_SESSION_KEY;
  }

  const dataDir = process.env.CC_CONNECT_DATA_DIR || DEFAULT_DATA_DIR;
  const sessionsDir = path.join(dataDir, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    return '';
  }

  const sessionFile = fs.readdirSync(sessionsDir)
    .filter((file) => file.startsWith(`${project}_`) && file.endsWith('.json'))
    .sort()
    .at(-1);

  if (!sessionFile) {
    return '';
  }

  const state = JSON.parse(fs.readFileSync(path.join(sessionsDir, sessionFile), 'utf8'));
  const activeEntries = Object.entries(state.active_session || {});
  const feishuEntry = activeEntries.find(([key]) => key.startsWith('feishu:'));
  return (feishuEntry || activeEntries[0] || [])[0] || '';
}

async function captureScreenshot(outPath) {
  const server = createStaticServer();
  const address = await listen(server, '127.0.0.1', 0);
  const url = `http://127.0.0.1:${address.port}/`;

  try {
    await runCommand('playwright', [
      'screenshot',
      '--browser=chromium',
      '--full-page',
      '--wait-for-selector=.profile-name',
      '--wait-for-timeout=500',
      '--viewport-size=1365,900',
      url,
      outPath,
    ]);
  } finally {
    await close(server);
  }
}

async function sendImage(outPath, project) {
  const ccConnect = resolveCcConnectBin();
  const args = [
    'send',
    '-p',
    project,
  ];
  const sessionKey = resolveSessionKey(project);
  if (sessionKey) {
    args.push('-s', sessionKey);
  }
  if (process.env.CC_CONNECT_DATA_DIR) {
    args.push('--data-dir', process.env.CC_CONNECT_DATA_DIR);
  }
  args.push(
    '--message',
    'Homepage preview screenshot',
    '--image',
    outPath,
  );
  await runCommand(ccConnect, args);
}

async function runPreview(options) {
  const outPath = normalizeOutputPath(options.out);
  const project = normalizeProject(options.project);
  await captureScreenshot(outPath);
  if (options.send) {
    await sendImage(outPath, project);
  }
  return { ok: true, image: outPath, sent: options.send, project };
}

function ensureQueueDirs(queueDir) {
  const resolved = path.resolve(queueDir);
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  for (const child of ['running', 'done', 'failed']) {
    fs.mkdirSync(path.join(resolved, child), { recursive: true, mode: 0o700 });
  }
  return resolved;
}

function queuedRunOptions(input, defaults) {
  return {
    out: typeof input.out === 'string' ? input.out : defaults.out,
    project: typeof input.project === 'string' ? input.project : defaults.project,
    send: Boolean(input.send),
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function queuePreview(options) {
  const queueDir = ensureQueueDirs(options.queueDir);
  const outPath = normalizeOutputPath(options.out);
  const project = normalizeProject(options.project);
  const requestId = `${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const requestPath = path.join(queueDir, `${requestId}.json`);
  const tempPath = path.join(queueDir, `${requestId}.tmp`);
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    send: Boolean(options.send),
    out: outPath,
    project,
  };

  writeJson(tempPath, payload);
  fs.renameSync(tempPath, requestPath);
  return {
    ok: true,
    queued: true,
    request: requestPath,
    queueDir,
    send: payload.send,
    project,
  };
}

function listQueuedRequests(queueDir) {
  if (!fs.existsSync(queueDir)) {
    return [];
  }
  return fs.readdirSync(queueDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(queueDir, entry.name))
    .sort();
}

async function processQueuedRequest(filePath, options, schedulePreview) {
  const queueDir = path.resolve(options.queueDir);
  const name = path.basename(filePath);
  const runningPath = path.join(queueDir, 'running', name);
  const startedAt = new Date().toISOString();

  try {
    fs.renameSync(filePath, runningPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  try {
    const input = JSON.parse(fs.readFileSync(runningPath, 'utf8'));
    const runOptions = queuedRunOptions(input, options);
    console.log(`[${startedAt}] processing preview request ${name}`);
    const result = await schedulePreview(runOptions);
    const completedAt = new Date().toISOString();
    writeJson(path.join(queueDir, 'done', `${name}.result.json`), {
      ok: true,
      request: input,
      result,
      startedAt,
      completedAt,
    });
    fs.unlinkSync(runningPath);
    console.log(`[${completedAt}] completed preview request ${name}`);
  } catch (error) {
    const failedAt = new Date().toISOString();
    writeJson(path.join(queueDir, 'failed', `${name}.error.json`), {
      ok: false,
      error: error.message,
      startedAt,
      failedAt,
    });
    try {
      fs.renameSync(runningPath, path.join(queueDir, 'failed', name));
    } catch (renameError) {
      if (renameError.code !== 'ENOENT') {
        throw renameError;
      }
    }
    console.error(`[${failedAt}] failed preview request ${name}: ${error.message}`);
  }
}

function startQueueWatcher(options, schedulePreview) {
  const queueDir = ensureQueueDirs(options.queueDir);
  let polling = false;

  const pollQueue = async () => {
    if (polling) {
      return;
    }
    polling = true;
    try {
      const requestFiles = listQueuedRequests(queueDir);
      for (const filePath of requestFiles) {
        await processQueuedRequest(filePath, { ...options, queueDir }, schedulePreview);
      }
    } catch (error) {
      console.error(`preview queue poll failed: ${error.message}`);
    } finally {
      polling = false;
    }
  };

  const timer = setInterval(pollQueue, 1000);
  void pollQueue();
  return { queueDir, stop: () => clearInterval(timer) };
}

async function requestPreview(options) {
  const token = readToken(options.tokenFile);
  const payload = JSON.stringify({
    send: options.send,
    out: options.out,
    project: options.project,
  });

  const response = await new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: options.port,
      path: '/preview',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 120000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error('Preview request timed out'));
    });
    request.write(payload);
    request.end();
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Preview service returned ${response.statusCode}: ${response.body}`);
  }

  return JSON.parse(response.body);
}

async function serve(options) {
  const token = ensureToken(options.tokenFile);
  let activeRun = Promise.resolve();
  const schedulePreview = (runOptions) => {
    activeRun = activeRun.catch(() => undefined).then(() => runPreview(runOptions));
    return activeRun;
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/preview') {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'Not found' }));
        return;
      }

      if (!isAuthorized(request, token)) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
        return;
      }

      const body = await readBody(request);
      const input = body ? JSON.parse(body) : {};
      const runOptions = {
        out: input.out || options.out,
        project: input.project || options.project,
        send: Boolean(input.send),
      };

      const result = await schedulePreview(runOptions);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });

  const address = await listen(server, '127.0.0.1', options.port);
  const watcher = startQueueWatcher(options, schedulePreview);
  console.log(`homepage preview service listening on 127.0.0.1:${address.port}`);
  console.log(`token file: ${options.tokenFile}`);
  console.log(`queue directory: ${watcher.queueDir}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'serve') {
    await serve(options);
  } else if (options.mode === 'queue') {
    console.log(JSON.stringify(queuePreview(options), null, 2));
  } else if (options.mode === 'request') {
    console.log(JSON.stringify(await requestPreview(options), null, 2));
  } else {
    console.log(JSON.stringify(await runPreview(options), null, 2));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
