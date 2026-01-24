import { db } from '../firebase';
import { doc, setDoc, writeBatch, getDoc, runTransaction } from "firebase/firestore";

const API_BASE_URL = "/api"; 
const COMPETITION_CODE = "PL";
const SEASON = "2025";

export const processMatchUpdate = async (setStatusCallback) => {
    setStatusCallback('Fetching data from Football-Data.org...');
    const apiKey = import.meta.env.VITE_FOOTBALL_DATA_ORG_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const headers = { "X-Auth-Token": apiKey };
    const response = await fetch(`${API_BASE_URL}/competitions/${COMPETITION_CODE}/matches?season=${SEASON}`, { headers });
    const data = await response.json();

    if (!data.matches) throw new Error('No matches found in API response');

    setStatusCallback(`Fetched ${data.matches.length} matches. Grouping...`);

    const matchesByGameweek = {};
    data.matches.forEach(match => {
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
             score: {
                 fullTime: {
                     home: match.score.fullTime.home,
                     away: match.score.fullTime.away
                 }
             }
        });
    });

    setStatusCallback('Saving to Firestore (matches_cache)...');
    const batch = writeBatch(db);
    
    Object.keys(matchesByGameweek).forEach(gw => {
        const matches = matchesByGameweek[gw].sort((a, b) => a.timestamp - b.timestamp);
        const docRef = doc(db, "matches_cache", `week_${gw}`);
        batch.set(docRef, { matches: matches, lastUpdated: new Date().toISOString() });
    });
    
    await batch.commit();

    // Detect Current Gameweek
    const sortedMatches = [...data.matches].sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    let nextMatchday = 1;
    const upcomingMatch = sortedMatches.find(m => m.status === 'TIMED' || m.status === 'SCHEDULED');
    
    if (upcomingMatch) {
         nextMatchday = upcomingMatch.matchday;
    } else {
         nextMatchday = 38; 
    }
      
    const systemRef = doc(db, "system", "status");
    await setDoc(systemRef, { currentRound: String(nextMatchday), lastUpdated: new Date().toISOString() });

    // --- NEW: Fetch Standings (for Form) ---
    setStatusCallback('Fetching Standings (Team Form)...');
    try {
        const standingsResponse = await fetch(`${API_BASE_URL}/competitions/${COMPETITION_CODE}/standings?season=${SEASON}`, { headers });
        const standingsData = await standingsResponse.json();
        
        if (standingsData.standings) {
            const formMap = {};
            const totalTable = standingsData.standings.find(s => s.type === 'TOTAL');
            if (totalTable && totalTable.table) {
                totalTable.table.forEach(entry => {
                    // entry.form is usually "W,L,D,W,W" (comma separate?)
                    // The API actually returns "W,L,D,W,W" as a string usually, but let's check format 
                    // commonly it's comma separated, but sometimes just "WLDWW"
                    formMap[entry.team.name] = entry.form; 
                });
                
                const standingsRef = doc(db, "system", "standings");
                await setDoc(standingsRef, { 
                    forms: formMap, 
                    lastUpdated: new Date().toISOString() 
                });
                console.log("Standings (Form) updated.");
            }
        }
    } catch (err) {
        console.error("Failed to update standings:", err);
        // Don't fail the whole process if just standings fail
        setStatusCallback(`Warning: Standings update failed (${err.message})`);
    }

    setStatusCallback(`Success! Detected Current Gameweek: ${nextMatchday}`);
    return nextMatchday;
};

export const checkForAutoUpdate = async () => {
    try {
        const systemRef = doc(db, "system", "status");
        const systemSnap = await getDoc(systemRef);
        
        let shouldUpdate = false;

        if (!systemSnap.exists()) {
            shouldUpdate = true;
        } else {
            const data = systemSnap.data();
            const lastUpdated = new Date(data.lastUpdated).getTime();
            const now = new Date().getTime();
            const HOURS_24 = 24 * 60 * 60 * 1000;

            // Simple 24h check, but can be smarter (e.g., check if it's past 2am)
            if (now - lastUpdated > HOURS_24) {
                 shouldUpdate = true;
            }
        }

        if (shouldUpdate) {
            console.log("Auto-Update Triggered: Data is stale.");
            await processMatchUpdate((msg) => console.log(`[Auto-Update]: ${msg}`));
        } else {
            console.log("Auto-Update Skipped: Data is fresh.");
        }
    } catch (e) {
        console.error("Auto-Update Failed:", e);
    }
};

export const tryTriggerLiveUpdate = async (gameweekId) => {
    try {
        const docId = `week_${gameweekId}`;
        const docRef = doc(db, "matches_cache", docId);
        
        // 1. Transaction to check and lock
        let shouldFetch = false;
        
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            if (!docSnap.exists()) return; // Should exist if we are viewing it
            
            const data = docSnap.data();
            const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).getTime() : 0;
            const now = new Date().getTime();
            
            // Check if stale (> 60s)
            if (now - lastUpdated > 60000) {
                shouldFetch = true;
                // Optimistic lock: update timestamp immediately so others don't try
                transaction.update(docRef, { lastUpdated: new Date().toISOString() });
            }
        });

        if (!shouldFetch) {
            console.log(`[Live Update] Skipped. Data is fresh for GW ${gameweekId}.`);
            return;
        }

        console.log(`[Live Update] acting as LEADER for GW ${gameweekId}. Fetching...`);

        // 2. Fetch specific gameweek (Save data)
        const apiKey = import.meta.env.VITE_FOOTBALL_DATA_ORG_KEY;
        if (!apiKey) throw new Error("API Key missing");
        
        const headers = { "X-Auth-Token": apiKey };
        const response = await fetch(`${API_BASE_URL}/competitions/${COMPETITION_CODE}/matches?season=${SEASON}&matchday=${gameweekId}`, { headers });
        const data = await response.json();
        
        if (!data.matches) throw new Error("No matches found");

        const matches = data.matches.map(match => ({
             id: String(match.id),
             homeTeam: match.homeTeam.name,
             awayTeam: match.awayTeam.name,
             homeLogo: match.homeTeam.crest,
             awayLogo: match.awayTeam.crest,
             date: new Date(match.utcDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
             timestamp: new Date(match.utcDate).getTime(),
             status: match.status,
             score: {
                 fullTime: {
                     home: match.score.fullTime.home,
                     away: match.score.fullTime.away
                 }
             }
        })).sort((a, b) => a.timestamp - b.timestamp);

        // 3. Write real data to Firestore
        await setDoc(docRef, { matches: matches, lastUpdated: new Date().toISOString() });
        console.log(`[Live Update] Success. Firestore updated for GW ${gameweekId}.`);

    } catch (e) {
        console.error("[Live Update] Failed:", e);
    }
};
