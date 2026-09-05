import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import nodemailer from 'nodemailer';

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

// --- Email Configuration (Resend API or SMTP/Nodemailer) ---
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || (SMTP_USER ? `"Premier League Fantasy" <${SMTP_USER}>` : '"Premier League Fantasy" <alerts@custom-fantasy.com>');

let smtpTransporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  try {
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    console.log(`[Email] Configured SMTP transporter for ${SMTP_HOST}:${SMTP_PORT}`);
  } catch (err) {
    console.warn('[Email] Error initializing SMTP transporter:', err.message);
  }
} else if (RESEND_API_KEY) {
  console.log('[Email] Configured Resend HTTP API email delivery.');
} else {
  console.log('[Email] Note: Neither RESEND_API_KEY nor SMTP_HOST configured yet. Set RESEND_API_KEY or SMTP credentials in Fly secrets to enable live email delivery.');
}

// In-Memory Push Subscriptions & Alert Deduplication Store
const pushSubscriptions = new Map(); // userId -> PushSubscription
const notifiedAlerts = new Set(); // Set of "matchId_userId_3h"

const DATA_DIR = path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push_subs.json');
const ALERTS_FILE = path.join(DATA_DIR, 'notified_alerts.json');

// Load stored push subscriptions and alerts from disk if available
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
  if (fs.existsSync(ALERTS_FILE)) {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, 'utf-8');
    const parsedAlerts = JSON.parse(rawAlerts);
    for (const key of parsedAlerts) {
      notifiedAlerts.add(key);
    }
    console.log(`[Push] Loaded ${notifiedAlerts.size} historical alert keys.`);
  }
} catch (e) {
  console.warn('[Push] Error loading saved subscriptions/alerts:', e.message);
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

function saveNotifiedAlertsToDisk() {
  try {
    const arr = Array.from(notifiedAlerts.values());
    // Keep at most 2000 recent alert keys to prevent file bloat
    const trimmed = arr.slice(-2000);
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    console.warn('[Push] Error saving notified alerts:', e.message);
  }
}

// --- HTML EMAIL SENDER ---
async function sendKickoffEmailReminder({ toEmail, userName, homeTeam, awayTeam, kickoffTime, gameweek }) {
  if (!toEmail) return false;

  const dateStr = new Date(kickoffTime).toLocaleString('en-GB', { 
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' 
  });
  const appUrl = 'https://custom-fantasy-hegazi.fly.dev';
  const predictUrl = `${appUrl}/?gw=${gameweek || 1}`;

  const subject = `⏰ 3-Hour Kickoff Alert: ${homeTeam} vs ${awayTeam}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 30px 15px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" style="max-width: 540px; background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
              <!-- Header Banner -->
              <tr>
                <td style="padding: 24px 28px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); border-bottom: 1px solid #374151;">
                  <div style="font-size: 12px; font-weight: 800; color: #a5b4fc; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">
                    ⚽ Premier League Fantasy Alarm
                  </div>
                  <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">
                    Kickoff in 3 Hours! ⏰
                  </h1>
                </td>
              </tr>

              <!-- Match Card -->
              <tr>
                <td style="padding: 24px 28px;">
                  <p style="font-size: 14px; color: #d1d5db; margin: 0 0 16px 0; line-height: 1.5;">
                    Hey <strong style="color: #60a5fa;">${userName || 'Manager'}</strong>,
                  </p>
                  <p style="font-size: 14px; color: #9ca3af; margin: 0 0 20px 0; line-height: 1.5;">
                    You have <strong style="color: #f87171;">not submitted your prediction yet</strong> for this upcoming fixture. Lock in your score pick before kickoff to stay in the title race!
                  </p>

                  <!-- Fixture Box -->
                  <div style="background-color: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
                      Gameweek ${gameweek || 1} • Kickoff ${dateStr}
                    </div>
                    <div style="font-size: 18px; font-weight: 800; color: #ffffff; margin-bottom: 6px;">
                      ${homeTeam} <span style="color: #ef4444; margin: 0 6px;">vs</span> ${awayTeam}
                    </div>
                    <div style="display: inline-block; background-color: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-top: 6px;">
                      ⚠️ Unpredicted • Deadline Approaching
                    </div>
                  </div>

                  <!-- CTA Button -->
                  <div style="text-align: center; margin-bottom: 20px;">
                    <a href="${predictUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 800; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                      Submit Prediction Now →
                    </a>
                  </div>
                  <div style="text-align: center; font-size: 12px; color: #6b7280;">
                    Direct link: <a href="${predictUrl}" style="color: #60a5fa; text-decoration: none;">${predictUrl}</a>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 16px 28px; background-color: #0f172a; border-top: 1px solid #1f2937; text-align: center; font-size: 11px; color: #64748b;">
                  Custom Premier League Fantasy • Automated 3-Hour Kickoff Reminders
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  // 1. Attempt Resend if API key is present
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [toEmail],
          subject,
          html
        })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`[Email Sent via Resend] Sent 3h reminder to ${toEmail} (ID: ${data.id})`);
        return true;
      } else {
        console.warn(`[Resend Error] Status ${res.status}:`, JSON.stringify(data));
      }
    } catch (err) {
      console.warn('[Resend Fetch Error]:', err.message);
    }
  }

  // 2. Attempt SMTP / Nodemailer if configured
  if (smtpTransporter) {
    try {
      await smtpTransporter.sendMail({
        from: EMAIL_FROM,
        to: toEmail,
        subject,
        html
      });
      console.log(`[Email Sent via SMTP] Sent 3h reminder to ${toEmail}`);
      return true;
    } catch (err) {
      console.warn('[SMTP Send Error]:', err.message);
    }
  }

  // 3. Fallback log if neither email provider is active
  console.log(`[Email Alert Ready] Prepared 3h alert email for ${userName} (${toEmail}) for ${homeTeam} vs ${awayTeam}. Add RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS to Fly secrets to deliver live emails.`);
  return false;
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

// --- IN-MEMORY RATE-LIMIT PROTECTED MATCH CACHE (Max 1 upstream fetch per 45s) ---
let inMemoryMatchData = null;
let lastUpstreamFetchTime = 0;
let ongoingFetchPromise = null;
let hasLiveMatchesActive = false;
const CACHE_TTL_MS = 45 * 1000;

async function getOrFetchUpstreamMatches(force = false) {
  const now = Date.now();
  if (inMemoryMatchData && !force && (now - lastUpstreamFetchTime < CACHE_TTL_MS)) {
    return inMemoryMatchData;
  }

  if (ongoingFetchPromise) {
    return ongoingFetchPromise;
  }

  ongoingFetchPromise = (async () => {
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
        console.warn(`[Upstream API] Returned status ${upstreamRes.status}`);
        return inMemoryMatchData;
      }

      const data = await upstreamRes.json();
      if (data && data.matches) {
        inMemoryMatchData = data;
        lastUpstreamFetchTime = Date.now();
        console.log(`[Match Ingestion] Freshly fetched ${data.matches.length} matches from upstream API.`);
        // Save to Supabase in background
        saveMatchesToSupabase(data.matches).catch(e => console.warn('[Supabase Sync Note]:', e.message));
      }
      return inMemoryMatchData || data;
    } catch (err) {
      console.error('[Upstream Fetch Error]:', err.message);
      return inMemoryMatchData;
    } finally {
      ongoingFetchPromise = null;
    }
  })();

  return ongoingFetchPromise;
}

async function saveMatchesToSupabase(matches) {
  if (!matches || matches.length === 0) return;
  const byGameweek = {};
  matches.forEach(m => {
    const gw = m.matchday;
    if (!gw) return;
    if (!byGameweek[gw]) byGameweek[gw] = [];
    byGameweek[gw].push({
      id: String(m.id),
      homeTeam: typeof m.homeTeam === 'string' ? m.homeTeam : (m.homeTeam?.name || 'Home'),
      awayTeam: typeof m.awayTeam === 'string' ? m.awayTeam : (m.awayTeam?.name || 'Away'),
      homeLogo: m.homeTeam?.crest || '',
      awayLogo: m.awayTeam?.crest || '',
      date: new Date(m.utcDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
      timestamp: new Date(m.utcDate).getTime(),
      utcDate: m.utcDate,
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

  for (const [gwStr, gwMatches] of Object.entries(byGameweek)) {
    const gwNum = parseInt(gwStr, 10);
    const cacheId = `${SEASON}_week_${gwNum}`;

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
}

async function syncLiveMatches() {
  await getOrFetchUpstreamMatches(true);
}

// --- BACKGROUND WORKER 2: SMART 3-HOUR DUAL ALARM (WEB PUSH + EMAIL) ---
// Notifies managers 3 hours before kickoff ONLY if they haven't submitted predictions yet!
async function checkKickoffDeadlinesAndNotify() {
  try {
    const now = Date.now();
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000; // 3 hours in ms
    const BUFFER_MS = 25 * 60 * 1000; // 25-min buffer window

    // 1. Fetch match caches from Supabase
    const cacheRows = await supabaseRest('matches_cache?select=*').catch(() => []);
    if (!cacheRows || cacheRows.length === 0) return;

    // 2. Fetch all registered manager profiles (for emails and display names)
    const profiles = await supabaseRest('profiles?select=id,email,display_name').catch(() => []);
    if (!profiles || profiles.length === 0) return;

    const profileMap = new Map();
    for (const p of profiles) {
      if (p.id) profileMap.set(p.id, p);
    }

    let alertCountThisCycle = 0;

    for (const row of cacheRows) {
      const matches = row.matches || [];
      for (const match of matches) {
        // Skip finished or currently live matches
        if (match.status === 'FINISHED' || match.status === 'IN_PLAY' || match.status === 'PAUSED') continue;

        const kickoffTime = match.timestamp || (match.utcDate ? new Date(match.utcDate).getTime() : 0);
        if (!kickoffTime) continue;

        const timeUntilKickoff = kickoffTime - now;

        // Match kicks off in <= 3 hours (and is still in the future)
        if (timeUntilKickoff > 0 && timeUntilKickoff <= (THREE_HOURS_MS + BUFFER_MS)) {
          const matchId = String(match.id);
          const homeTeam = typeof match.homeTeam === 'string' ? match.homeTeam : (match.homeTeam?.name || 'Home');
          const awayTeam = typeof match.awayTeam === 'string' ? match.awayTeam : (match.awayTeam?.name || 'Away');
          const gwNum = row.gameweek || match.matchday || 1;

          // Fetch existing predictions for this match in Supabase
          const existingPreds = await supabaseRest(`predictions?select=user_id&match_id=eq.${matchId}`).catch(() => []);
          const predictedUserIds = new Set((existingPreds || []).map(p => p.user_id));

          // Check every manager in the league
          for (const [userId, profile] of profileMap.entries()) {
            // ONLY alert if the manager has NOT predicted this match yet!
            if (predictedUserIds.has(userId)) continue;

            const alertKey = `${matchId}_${userId}_3h`;
            if (notifiedAlerts.has(alertKey)) continue;

            const userName = profile.display_name || 'Manager';
            const userEmail = profile.email;
            const hoursRemaining = Math.max(1, Math.round(timeUntilKickoff / (60 * 60 * 1000)));

            console.log(`[3h Alarm Triggered] Match ${homeTeam} vs ${awayTeam} kicks off in ~${hoursRemaining}h. Manager ${userName} has not predicted yet.`);

            // 1. Send Web Push Notification (if subscribed)
            const sub = pushSubscriptions.get(userId);
            if (sub) {
              const payload = JSON.stringify({
                title: `⏰ 3 Hours to Kickoff: ${homeTeam} vs ${awayTeam}`,
                body: `Hey ${userName}! Match kicks off in ~${hoursRemaining}h. You haven't made your prediction yet — tap to submit your picks!`,
                url: `/?gw=${gwNum}`,
                tag: `3h-alarm-${matchId}`
              });

              try {
                await webpush.sendNotification(sub, payload);
                console.log(`[Web Push Sent] 3h alert delivered to ${userName} for ${homeTeam} vs ${awayTeam}`);
              } catch (pushErr) {
                if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                  pushSubscriptions.delete(userId);
                  saveSubscriptionsToDisk();
                } else {
                  console.warn(`[Web Push Error] Failed to send to ${userName}:`, pushErr.message);
                }
              }
            }

            // 2. Send Email Reminder (if email address exists)
            if (userEmail) {
              try {
                await sendKickoffEmailReminder({
                  toEmail: userEmail,
                  userName,
                  homeTeam,
                  awayTeam,
                  kickoffTime,
                  gameweek: gwNum
                });
              } catch (emailErr) {
                console.warn(`[Email Alert Error] Failed to send to ${userEmail}:`, emailErr.message);
              }
            }

            // Mark alerted to avoid duplicate spam
            notifiedAlerts.add(alertKey);
            alertCountThisCycle++;
          }
        }
      }
    }

    if (alertCountThisCycle > 0) {
      saveNotifiedAlertsToDisk();
      console.log(`[3h Kickoff Alarm Worker] Sent ${alertCountThisCycle} alarms across Web Push & Email.`);
    }
  } catch (err) {
    console.error('[3h Kickoff Alarm Worker Error]:', err.message);
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

// Check 3-hour kickoff deadlines every 2 minutes
setInterval(checkKickoffDeadlinesAndNotify, 2 * 60 * 1000);

// Run initial sync after server startup
setTimeout(matchSyncLoop, 2000);
setTimeout(checkKickoffDeadlinesAndNotify, 5000);

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

  // Alert System Status Endpoint
  if (pathname === '/api/alerts/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({
      pushSubscribers: pushSubscriptions.size,
      vapidReady: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
      emailProvider: RESEND_API_KEY ? 'Resend API' : (smtpTransporter ? `SMTP (${SMTP_HOST})` : 'Not Configured (Logs only)'),
      notifiedAlertsCount: notifiedAlerts.size
    }));
  }

  // Test 3-Hour Alarm Endpoint (Web Push & Email)
  if (pathname === '/api/alerts/test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { userId, email } = JSON.parse(body || '{}');
        const targetUserId = userId || Array.from(pushSubscriptions.keys())[0];
        let webPushResult = false;
        let emailResult = false;
        let targetEmail = email;

        // 1. Test Web Push
        if (targetUserId && pushSubscriptions.has(targetUserId)) {
          const sub = pushSubscriptions.get(targetUserId);
          try {
            await webpush.sendNotification(sub, JSON.stringify({
              title: '⏰ [TEST] 3-Hour Kickoff Alarm',
              body: 'Test alarm successful! You will receive this 3 hours before kickoff whenever you haven\'t predicted a match.',
              url: '/'
            }));
            webPushResult = true;
          } catch (e) {
            webPushResult = e.message;
          }
        }

        // 2. Resolve email if not provided
        if (!targetEmail && targetUserId) {
          const p = await supabaseRest(`profiles?select=email,display_name&id=eq.${targetUserId}`).catch(() => []);
          if (p && p[0]?.email) targetEmail = p[0].email;
        }

        // 3. Test Email
        if (targetEmail) {
          emailResult = await sendKickoffEmailReminder({
            toEmail: targetEmail,
            userName: 'Manager',
            homeTeam: 'Arsenal FC',
            awayTeam: 'Brighton & Hove Albion FC',
            kickoffTime: Date.now() + (3 * 60 * 60 * 1000),
            gameweek: 1
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({
          success: true,
          webPushDelivered: webPushResult,
          emailDelivered: emailResult,
          targetEmail: targetEmail || 'No email registered',
          emailProvider: RESEND_API_KEY ? 'Resend' : (smtpTransporter ? 'SMTP' : 'None (Set RESEND_API_KEY or SMTP_HOST on Fly)'),
          activeWebSubscribers: pushSubscriptions.size
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Football API Proxy with Guaranteed Rate-Limit Protection & Zero Client-Side Stale Caching
  if (pathname.startsWith('/api/football-proxy')) {
    try {
      const matchdayParam = parsedUrl.searchParams.get('matchday');
      const allData = await getOrFetchUpstreamMatches();

      if (!allData || !allData.matches) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Match data temporarily unavailable' }));
      }

      let filteredMatches = allData.matches;
      if (matchdayParam) {
        filteredMatches = allData.matches.filter(m => String(m.matchday) === String(matchdayParam));
      }

      const responsePayload = {
        ...allData,
        matches: filteredMatches
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(responsePayload));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Failed to fetch upstream match data: ' + error.message }));
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
