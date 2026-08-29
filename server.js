import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const API_KEY = process.env.FOOTBALL_DATA_ORG_KEY || process.env.VITE_FOOTBALL_DATA_ORG_KEY || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SEASON = '2026';

// --- Web Push VAPID Configuration ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (e) {
    console.warn('[VAPID Config Warning]:', e.message);
  }
}

// In-Memory Push Subscriptions & Alert Deduplication Store
const pushSubscriptions = new Map(); // userId -> PushSubscription
const notifiedAlerts = new Set(); // Set of "matchId_userId"

const DATA_DIR = path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push_subs.json');

// Load stored push subscriptions from disk if available
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SUBS_FILE)) {
    const raw = fs.readFileSync(SUBS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    for (const [uid, sub] of Object.entries(parsed)) {
      pushSubscriptions.set(uid, sub);
    }
    console.log(`[Push] Loaded ${pushSubscriptions.size} push subscriptions.`);
  }
} catch (e) {
  console.warn('[Push] Error loading saved subscriptions:', e.message);
}

function saveSubscriptionsToDisk() {
  try {
    const obj = {};
    for (const [uid, sub] of pushSubscriptions.entries()) {
      obj[uid] = sub;
    }
    fs.writeFileSync(SUBS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn('[Push] Error saving subscriptions:', e.message);
  }
}

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

// Supabase REST Helper
async function supabaseRest(endpoint, method = 'GET', body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' || method === 'PUT' ? 'resolution=merge-duplicates' : 'return=representation'
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase REST Error [${res.status}]: ${errText}`);
  }
  return res.json();
}

// --- BACKGROUND WORKER 1: LIVE MATCHDAY SYNC ---
let hasLiveMatchesActive = false;

async function syncLiveMatches() {
  if (!API_KEY) return;
  try {
    const upstreamRes = await fetch(`https://api.football-data.org/v4/competitions/PL/matches?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'X-Auth-Token': API_KEY,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!upstreamRes.ok) {
      console.warn(`[Match Sync] Upstream API returned status ${upstreamRes.status}`);
      return;
    }

    const data = await upstreamRes.json();
    const matches = data.matches || [];
    if (matches.length === 0) return;

    let anyLiveFound = false;

    // Group matches by gameweek (matchday)
    const byGameweek = {};
    matches.forEach(m => {
      const gw = m.matchday;
      if (!gw) return;
      if (!byGameweek[gw]) byGameweek[gw] = [];

      if (m.status === 'IN_PLAY' || m.status === 'PAUSED') {
        anyLiveFound = true;
      }

      byGameweek[gw].push({
        id: String(m.id),
        homeTeam: m.homeTeam?.name || 'Home',
        awayTeam: m.awayTeam?.name || 'Away',
        homeLogo: m.homeTeam?.crest || '',
        awayLogo: m.awayTeam?.crest || '',
        date: new Date(m.utcDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        timestamp: new Date(m.utcDate).getTime(),
        status: m.status,
        minute: m.minute || (m.status === 'PAUSED' ? 'HT' : (m.status === 'IN_PLAY' ? 'LIVE' : null)),
        score: {
          fullTime: {
            home: m.score?.fullTime?.home ?? null,
            away: m.score?.fullTime?.away ?? null
          }
        }
      });
    });

    hasLiveMatchesActive = anyLiveFound;

    // Update active/recent gameweeks in Supabase matches_cache
    for (const [gwStr, gwMatches] of Object.entries(byGameweek)) {
      const gwNum = parseInt(gwStr, 10);
      const cacheId = `${SEASON}_week_${gwNum}`;

      // Check if this gameweek has matches in play or recently updated
      const hasLiveOrRecent = gwMatches.some(m => 
        m.status === 'IN_PLAY' || 
        m.status === 'PAUSED' || 
        m.status === 'FINISHED' ||
        m.status === 'TIMED'
      );

      if (hasLiveOrRecent) {
        await supabaseRest('matches_cache', 'POST', {
          id: cacheId,
          season: SEASON,
          gameweek: gwNum,
          matches: gwMatches,
          last_updated: new Date().toISOString()
        }).catch(err => console.warn(`[Match Sync] Supabase save note for GW${gwNum}:`, err.message));
      }
    }

    console.log(`[Match Sync] Synced ${matches.length} matches across ${Object.keys(byGameweek).length} GWs. Live in-play: ${anyLiveFound}`);
  } catch (err) {
    console.error('[Match Sync Worker Error]:', err.message);
  }
}

// --- BACKGROUND WORKER 2: SMART 30-MIN DEADLINE NOTIFIER ---
async function checkKickoffDeadlinesAndNotify() {
  if (pushSubscriptions.size === 0) return;

  try {
    const now = Date.now();
    const windowStart = now + (20 * 60 * 1000); // 20 mins from now
    const windowEnd = now + (35 * 60 * 1000);   // 35 mins from now

    // Fetch match caches from Supabase
    const cacheRows = await supabaseRest('matches_cache?select=*').catch(() => []);
    if (!cacheRows || cacheRows.length === 0) return;

    for (const row of cacheRows) {
      const matches = row.matches || [];
      for (const match of matches) {
        if (!match.utcDate || match.status === 'FINISHED' || match.status === 'IN_PLAY') continue;

        const kickoffTime = new Date(match.utcDate).getTime();
        
        // Match starts in ~30 minutes
        if (kickoffTime >= windowStart && kickoffTime <= windowEnd) {
          const matchId = String(match.id);
          const homeTeam = match.homeTeam?.shortName || match.homeTeam?.name || 'Home';
          const awayTeam = match.awayTeam?.shortName || match.awayTeam?.name || 'Away';
          const gwNum = row.gameweek || match.matchday || 1;

          // Fetch existing predictions for this match in Supabase
          const existingPreds = await supabaseRest(`predictions?select=user_id&match_id=eq.${matchId}`).catch(() => []);
          const predictedUserIds = new Set((existingPreds || []).map(p => p.user_id));

          // Find subscribed managers who have NOT predicted this match
          for (const [userId, sub] of pushSubscriptions.entries()) {
            const alertKey = `${matchId}_${userId}`;
            if (notifiedAlerts.has(alertKey)) continue;

            if (!predictedUserIds.has(userId)) {
              // Send 30-min deadline push notification!
              const payload = JSON.stringify({
                title: `⏰ Kickoff in 30 Mins: ${homeTeam} vs ${awayTeam}`,
                body: `You haven't locked in your prediction yet! Tap here to submit your picks before kickoff.`,
                url: `/?gw=${gwNum}`
              });

              try {
                await webpush.sendNotification(sub, payload);
                notifiedAlerts.add(alertKey);
                console.log(`[Push Notification Sent] Alerted user ${userId} for match ${homeTeam} vs ${awayTeam}`);
              } catch (pushErr) {
                if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                  // Subscription expired or unsubscribed
                  pushSubscriptions.delete(userId);
                  saveSubscriptionsToDisk();
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Deadline Notifier Error]:', err.message);
  }
}

// Start adaptive background cron timer
// Checks live scores every 30s during live matches, or every 60s otherwise
async function matchSyncLoop() {
  try {
    await syncLiveMatches();
  } catch (e) {
    console.warn('[Sync Loop Warning]:', e.message);
  }
  const nextInterval = hasLiveMatchesActive ? 30 * 1000 : 60 * 1000;
  setTimeout(matchSyncLoop, nextInterval);
}

// Start 30-minute deadline push checks every 2 minutes
setInterval(checkKickoffDeadlinesAndNotify, 2 * 60 * 1000);

// Run initial sync after server startup
setTimeout(matchSyncLoop, 2000);

// --- HTTP SERVER ---
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Health check
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  // Push Public Key Endpoint
  if (pathname === '/api/push/public-key' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ publicKey: VAPID_PUBLIC_KEY }));
  }

  // Push Subscribe Endpoint
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 32768) { // 32 KB limit
        tooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const { userId, subscription } = JSON.parse(body);
        if (userId && subscription) {
          pushSubscriptions.set(userId, subscription);
          saveSubscriptionsToDisk();
          console.log(`[Push] Registered push subscription for manager ${userId}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, registered: true }));
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing userId or subscription payload' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Football API Proxy with Guaranteed Zero-Cache for Live Scores & VAR Corrections
  if (pathname.startsWith('/api/football-proxy')) {
    const targetPath = parsedUrl.searchParams.get('targetPath');
    if (!targetPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing targetPath query parameter' }));
    }

    const queryParams = new URLSearchParams(parsedUrl.searchParams);
    queryParams.delete('targetPath');
    queryParams.set('_t', String(Date.now())); // Cache buster
    const queryString = queryParams.toString();
    const targetUrl = `https://api.football-data.org/v4/${targetPath}${queryString ? '?' + queryString : ''}`;

    try {
      const upstreamRes = await fetch(targetUrl, {
        cache: 'no-store',
        headers: {
          'X-Auth-Token': API_KEY,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      const data = await upstreamRes.json();
      res.writeHead(upstreamRes.status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Failed to fetch upstream match data' }));
    }
  }

  // Static File Serving with SPA Fallback
  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

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
      const gzip = zlib.createGzip();
      rawStream.pipe(gzip).pipe(res);
    } else {
      rawStream.pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Prediction Fantasy Production Server] Listening on port ${PORT}`);
});
