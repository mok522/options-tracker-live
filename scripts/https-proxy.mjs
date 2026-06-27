// Minimal HTTPS → HTTP dev proxy (built-in modules only, no dependencies).
//
// Next's `--experimental-https` hangs on some machines, but Schwab's OAuth
// callback requires an HTTPS redirect URI. This terminates TLS on the port
// Schwab calls back to and forwards everything to the plain-HTTP dev server,
// reusing the self-signed cert Next already generated in ./certificates.
//
//   Terminal 1:  npm run dev        (Next on http://127.0.0.1:3000)
//   Terminal 2:  npm run dev:tls    (this proxy on https://127.0.0.1:3001)
//   Browse:      https://127.0.0.1:3001   (accept the self-signed warning once)

import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';

const SOURCE_PORT = Number(process.env.PROXY_SOURCE_PORT ?? 3001);
const TARGET_PORT = Number(process.env.PROXY_TARGET_PORT ?? 3000);
const TARGET_HOST = '127.0.0.1';

const tlsOptions = {
  key: readFileSync(new URL('../certificates/localhost-key.pem', import.meta.url)),
  cert: readFileSync(new URL('../certificates/localhost.pem', import.meta.url)),
};

const server = https.createServer(tlsOptions, (req, res) => {
  const proxyReq = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Dev proxy: target http://${TARGET_HOST}:${TARGET_PORT} not reachable (${err.message}). Is "npm run dev" running?`);
  });
  req.pipe(proxyReq);
});

// Forward WebSocket upgrades (Next.js HMR / fast refresh) to the dev server.
server.on('upgrade', (req, clientSocket, head) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers).map(([k, v]) => `${k}: ${v}\r\n`).join('') +
        '\r\n'
    );
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => upstream.destroy());
});

server.listen(SOURCE_PORT, '127.0.0.1', () => {
  console.log(`\n  HTTPS dev proxy ready`);
  console.log(`  → https://127.0.0.1:${SOURCE_PORT}  (forwarding to http://${TARGET_HOST}:${TARGET_PORT})\n`);
});
