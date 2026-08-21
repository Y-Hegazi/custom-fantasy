import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const API_KEY = process.env.FOOTBALL_DATA_ORG_KEY || process.env.VITE_FOOTBALL_DATA_ORG_KEY;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json'
};

async function handleApiProxy(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const targetPath = parsedUrl.searchParams.get('targetPath');
  if (!targetPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing targetPath query parameter' }));
  }

  if (!API_KEY) {
    console.error('[Error] Missing FOOTBALL_DATA_ORG_KEY environment variable.');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Server configuration error: Missing API Key' }));
  }

  // Clone search params and remove targetPath
  const queryParams = new URLSearchParams(parsedUrl.searchParams);
  queryParams.delete('targetPath');
  const queryString = queryParams.toString();

  const targetUrl = `https://api.football-data.org/v4/${targetPath}${queryString ? '?' + queryString : ''}`;

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'X-Auth-Token': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    const data = await upstreamRes.json();
    res.writeHead(upstreamRes.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  } catch (error) {
    console.error('[API Proxy Error]:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch upstream match data' }));
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Health check for Container Orchestration (Docker, Kubernetes, Fly.io)
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  // API Proxy Handler
  if (pathname.startsWith('/api/football-proxy') || pathname.startsWith('/api')) {
    return handleApiProxy(req, res, parsedUrl);
  }

  // Static File Serving with SPA Fallback
  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for React SPA Routing
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Immutable caching for hashed assets, revalidate for HTML
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    res.setHeader('Content-Type', contentType);

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const rawStream = fs.createReadStream(filePath);

    if (acceptEncoding.includes('gzip') && (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || ext === '.svg')) {
      res.setHeader('Content-Encoding', 'gzip');
      res.writeHead(200);
      rawStream.pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200);
      rawStream.pipe(res);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Containerized Server running at http://0.0.0.0:${PORT}`);
  console.log(`⚽ Football API Proxy enabled at /api/football-proxy`);
});
