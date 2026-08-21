import { supabase } from '../supabase';
import { SEASON, COMPETITION_CODE, API_BASE_URL } from '../config';
import { generateMatchOdds } from './oddsEngine';

export const processMatchUpdate = async (setStatusCallback: (msg: string) => void) => {
    setStatusCallback('Fetching data from Premier League API proxy...');
    
    const response = await fetch(`${API_BASE_URL}?targetPath=competitions/${COMPETITION_CODE}/matches&season=${SEASON}`);
    const data = await response.json();

    if (!data.matches) throw new Error('No matches found in API response');

    setStatusCallback(`Fetched ${data.matches.length} matches. Grouping by gameweek...`);

    const matchesByGameweek: Record<number, any[]> = {};
    data.matches.forEach((match: any) => {
        const gw = match.matchday;
        if (!matchesByGameweek[gw]) matchesByGameweek[gw] = [];
        
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
                     home: match.score.fullTime.home,
                     away: match.score.fullTime.away
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

    // Detect Current Gameweek
    const sortedAll = [...data.matches].sort((a: any, b: any) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    let nextMatchday = 1;
    const upcomingMatch = sortedAll.find((m: any) => m.status === 'TIMED' || m.status === 'SCHEDULED');
    
    if (upcomingMatch) {
         nextMatchday = upcomingMatch.matchday;
    } else {
         nextMatchday = 38; 
    }

    setStatusCallback(`✅ Success! Synced ${upsertRows.length} gameweeks to PostgreSQL. Current: GW ${nextMatchday}`);
    return nextMatchday;
};

export const checkForAutoUpdate = async () => {
    // Automated background worker on server handles live sync every 3m
};

export const tryTriggerLiveUpdate = async (_gameweekId: string | number) => {
    // Automated background worker on server handles live sync every 3m
};
