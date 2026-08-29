import { supabase } from '../supabase';
import { SEASON, COMPETITION_CODE, API_BASE_URL } from '../config';
import { generateMatchOdds } from './oddsEngine';
import { settleGameweekScores } from './scoringEngine';

/**
 * Calculates 5-match form string (e.g. "WWDLW") for every team across all finished matches.
 */
export const calculateAllTeamForms = (allMatches: any[]): Record<string, string> => {
  const teamHistory: Record<string, Array<{ timestamp: number; result: 'W' | 'D' | 'L' }>> = {};

  (allMatches || []).forEach((m: any) => {
    if (m.status === 'FINISHED' && m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null) {
      const hTeam = typeof m.homeTeam === 'string' ? m.homeTeam : m.homeTeam?.name;
      const aTeam = typeof m.awayTeam === 'string' ? m.awayTeam : m.awayTeam?.name;
      const hScore = Number(m.score.fullTime.home);
      const aScore = Number(m.score.fullTime.away);
      const ts = m.timestamp || (m.utcDate ? new Date(m.utcDate).getTime() : 0);

      if (hTeam && aTeam && !isNaN(hScore) && !isNaN(aScore)) {
        if (!teamHistory[hTeam]) teamHistory[hTeam] = [];
        if (!teamHistory[aTeam]) teamHistory[aTeam] = [];

        if (hScore > aScore) {
          teamHistory[hTeam].push({ timestamp: ts, result: 'W' });
          teamHistory[aTeam].push({ timestamp: ts, result: 'L' });
        } else if (hScore < aScore) {
          teamHistory[hTeam].push({ timestamp: ts, result: 'L' });
          teamHistory[aTeam].push({ timestamp: ts, result: 'W' });
        } else {
          teamHistory[hTeam].push({ timestamp: ts, result: 'D' });
          teamHistory[aTeam].push({ timestamp: ts, result: 'D' });
        }
      }
    }
  });

  const forms: Record<string, string> = {};
  for (const [team, matches] of Object.entries(teamHistory)) {
    const sorted = matches.sort((a, b) => a.timestamp - b.timestamp);
    forms[team] = sorted.slice(-5).map(m => m.result).join('');
  }
  return forms;
};

export const processMatchUpdate = async (setStatusCallback: (msg: string) => void) => {
    setStatusCallback('Fetching data from Premier League API proxy...');
    
    const response = await fetch(`${API_BASE_URL}?targetPath=competitions/${COMPETITION_CODE}/matches&season=${SEASON}`);
    const data = await response.json();

    if (!data.matches) throw new Error('No matches found in API response');

    setStatusCallback(`Fetched ${data.matches.length} matches. Grouping by gameweek...`);

    const matchesByGameweek: Record<number, any[]> = {};
    const gameweeksWithFinishedMatches = new Set<number>();

    data.matches.forEach((match: any) => {
        const gw = match.matchday;
        if (!gw) return;
        if (!matchesByGameweek[gw]) matchesByGameweek[gw] = [];

        if (match.status === 'FINISHED') {
          gameweeksWithFinishedMatches.add(gw);
        }
        
        matchesByGameweek[gw].push({
             id: String(match.id),
             homeTeam: match.homeTeam.name,
             awayTeam: match.awayTeam.name,
             homeLogo: match.homeTeam.crest,
             awayLogo: match.awayTeam.crest,
             date: new Date(match.utcDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
             timestamp: new Date(match.utcDate).getTime(),
             status: match.status,
             odds: generateMatchOdds(match.homeTeam.name, match.awayTeam.name, String(match.id)),
             score: {
                 fullTime: {
                     home: match.score?.fullTime?.home ?? null,
                     away: match.score?.fullTime?.away ?? null
                 }
             }
        });
    });

    setStatusCallback('Saving to Supabase PostgreSQL (matches_cache)...');
    
    const upsertRows = Object.keys(matchesByGameweek).map(gwStr => {
        const gw = Number(gwStr);
        const sortedMatches = matchesByGameweek[gw].sort((a, b) => a.timestamp - b.timestamp);
        return {
            id: `${SEASON}_week_${gw}`,
            season: SEASON,
            gameweek: gw,
            matches: sortedMatches,
            last_updated: new Date().toISOString()
        };
    });

    const { error: upsertErr } = await supabase
        .from('matches_cache')
        .upsert(upsertRows, { onConflict: 'id' });

    if (upsertErr) throw upsertErr;

    // Settle prediction scores for gameweeks that have completed matches
    if (gameweeksWithFinishedMatches.size > 0) {
      setStatusCallback(`Settling prediction scores for ${gameweeksWithFinishedMatches.size} gameweeks...`);
      for (const gw of gameweeksWithFinishedMatches) {
        try {
          await settleGameweekScores(gw, SEASON);
        } catch (sErr: any) {
          console.warn(`[Auto-Settle Note GW${gw}]:`, sErr.message);
        }
      }
    }

    // Detect Current Gameweek
    const sortedAll = [...data.matches].sort((a: any, b: any) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    let nextMatchday = 1;
    const upcomingMatch = sortedAll.find((m: any) => m.status === 'TIMED' || m.status === 'SCHEDULED' || m.status === 'IN_PLAY');
    
    if (upcomingMatch) {
         nextMatchday = upcomingMatch.matchday;
    } else {
         nextMatchday = 38; 
    }

    setStatusCallback(`✅ Success! Synced ${upsertRows.length} gameweeks and settled active scores. Current: GW ${nextMatchday}`);
    return nextMatchday;
};

export const checkForAutoUpdate = async () => {
    // Automated background worker on server handles live sync
};

/**
 * Active client-side live score trigger:
 * Bypasses all browser/HTTP caches with cache: 'no-store' & timestamp to guarantee fresh scores
 * for goals, VAR cancellations, cards, and full-time results.
 */
export const tryTriggerLiveUpdate = async (gameweekId: string | number): Promise<any[] | null> => {
    const gwNum = String(gameweekId || "1");
    try {
        const proxyUrl = `${API_BASE_URL}?targetPath=competitions/${COMPETITION_CODE}/matches&season=${SEASON}&matchday=${gwNum}&_t=${Date.now()}`;
        const response = await fetch(proxyUrl, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (!data?.matches || data.matches.length === 0) return null;

        const formattedMatches = data.matches.map((match: any) => ({
            id: String(match.id),
            homeTeam: match.homeTeam?.name || 'Home',
            awayTeam: match.awayTeam?.name || 'Away',
            homeLogo: match.homeTeam?.crest || '',
            awayLogo: match.awayTeam?.crest || '',
            date: new Date(match.utcDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
            timestamp: new Date(match.utcDate).getTime(),
            status: match.status,
            minute: match.minute || (match.status === 'PAUSED' ? 'HT' : (match.status === 'IN_PLAY' ? 'LIVE' : null)),
            odds: generateMatchOdds(match.homeTeam?.name || '', match.awayTeam?.name || '', String(match.id)),
            score: {
                fullTime: {
                    home: match.score?.fullTime?.home ?? null,
                    away: match.score?.fullTime?.away ?? null
                }
            }
        })).sort((a: any, b: any) => a.timestamp - b.timestamp);

        // Update Supabase cache in background
        try {
            await supabase.from('matches_cache').upsert({
                id: `${SEASON}_week_${gwNum}`,
                season: SEASON,
                gameweek: parseInt(gwNum, 10),
                matches: formattedMatches,
                last_updated: new Date().toISOString()
            });
        } catch {
            // Non-blocking
        }

        // If any match is finished, trigger score settlement
        const hasFinished = formattedMatches.some((m: any) => m.status === 'FINISHED');
        if (hasFinished) {
            settleGameweekScores(parseInt(gwNum, 10), SEASON).catch((e) => console.warn('[Auto-Settle Note]:', e.message));
        }

        return formattedMatches;
    } catch (err: any) {
        console.warn('[Live Score Refresh Warning]:', err.message);
        return null;
    }
};
