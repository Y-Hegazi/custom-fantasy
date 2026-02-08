import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

function H2HLeaderboard({ league, currentRound }) {
    const [standings, setStandings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const calculateStandings = async () => {
            if (!league || !league.fixtures) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // 1. Initialize Record for all members
                const records = {};
                
                // Fetch user names
                const userNames = {};
                const usersSnap = await getDocs(collection(db, "users"));
                usersSnap.forEach(doc => {
                    userNames[doc.id] = doc.data().displayName || "Unknown";
                });
                // Add Ghost
                userNames["AVERAGE"] = "👻 Average Bot";

                league.members.forEach(uid => {
                    records[uid] = { 
                        id: uid, 
                        name: userNames[uid], 
                        played: 0, 
                        w: 0, 
                        d: 0, 
                        l: 0, 
                        pts: 0,
                        pf: 0 // Points For (Tiebreaker)
                    };
                });
                
                // Add Ghost to records if present in fixtures
                records["AVERAGE"] = { id: "AVERAGE", name: "👻 Average Bot", played:0, w:0, d:0, l:0, pts:0, pf:0 };

                // 2. Iterate through PAST rounds
                const roundsToProcess = [];
                for (let r = 1; r < parseInt(currentRound); r++) {
                    roundsToProcess.push(r);
                }

                // Helper function to calculate points (same as leaderboard.jsx)
                const getMatchOutcome = (homeScore, awayScore) => {
                    if (homeScore > awayScore) return 'H';
                    if (awayScore > homeScore) return 'A'; 
                    return 'D';
                };
                const POINTS_EXACT_SCORE = 3;
                const POINTS_CORRECT_RESULT = 1;

                // Process each round
                for (const roundNum of roundsToProcess) {
                    const gwSnap = await getDoc(doc(db, "gameweeks", `gameweek_${roundNum}`));
                    
                    // Skip if gameweek not finalized - matches might not be complete
                    if (!gwSnap.exists() || !gwSnap.data().isFinalized) {
                        console.log(`[H2H] Round ${roundNum} not finalized, skipping`);
                        continue;
                    }

                    // 1. Fetch MATCH RESULTS from cache
                    const cacheSnap = await getDoc(doc(db, "matches_cache", `week_${roundNum}`));
                    if (!cacheSnap.exists()) {
                        console.log(`[H2H] No match cache for round ${roundNum}`);
                        continue;
                    }

                    const matchResults = {};
                    const cachedMatches = cacheSnap.data().matches || [];
                    cachedMatches.forEach(match => {
                        if (match.status === 'FINISHED' && match.score?.fullTime?.home !== null) {
                            matchResults[String(match.id)] = {
                                home: match.score.fullTime.home,
                                away: match.score.fullTime.away
                            };
                        }
                    });

                    // 2. Fetch PREDICTIONS and CALCULATE SCORES on-the-fly
                    const predsSnap = await getDocs(collection(db, "gameweeks", `gameweek_${roundNum}`, "predictions"));
                    const roundScores = {};
                    let totalScore = 0;
                    let count = 0;

                    predsSnap.forEach(predDoc => {
                        const playerData = predDoc.data();
                        let playerPoints = 0;

                        // Calculate points for this player using their predictions
                        for (const matchId in playerData.scores) {
                            const prediction = playerData.scores[matchId];
                            const result = matchResults[matchId];
                            
                            if (prediction && result) {
                                const predHome = parseInt(prediction.home, 10);
                                const predAway = parseInt(prediction.away, 10);
                                
                                // Exact score match
                                if (predHome === result.home && predAway === result.away) {
                                    playerPoints += POINTS_EXACT_SCORE;
                                } 
                                // Correct result (W/D/L)
                                else if (getMatchOutcome(predHome, predAway) === getMatchOutcome(result.home, result.away)) {
                                    playerPoints += POINTS_CORRECT_RESULT;
                                }
                            }
                        }

                        roundScores[predDoc.id] = playerPoints;
                        
                        // Track for average calculation (only league members)
                        if (league.members.includes(predDoc.id)) {
                            totalScore += playerPoints;
                            count++;
                        }
                    });

                    // Calculate Average for ghost player
                    const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
                    roundScores["AVERAGE"] = avgScore;

                    console.log(`[H2H] Round ${roundNum} scores:`, roundScores);

                    // 3. Process Matchups for this Round
                    const matchups = league.fixtures[String(roundNum)] || [];
                    
                    matchups.forEach(match => {
                        const p1 = match.player1;
                        const p2 = match.player2;
                        
                        const score1 = roundScores[p1] !== undefined ? roundScores[p1] : 0;
                        const score2 = roundScores[p2] !== undefined ? roundScores[p2] : 0;

                        // Update P1
                        if (records[p1]) {
                            records[p1].played++;
                            records[p1].pf += score1;
                            if (score1 > score2) { records[p1].w++; records[p1].pts += 3; }
                            else if (score1 === score2) { records[p1].d++; records[p1].pts += 1; }
                            else { records[p1].l++; }
                        }

                        // Update P2
                        if (records[p2]) {
                            records[p2].played++;
                            records[p2].pf += score2;
                            if (score2 > score1) { records[p2].w++; records[p2].pts += 3; }
                            else if (score2 === score1) { records[p2].d++; records[p2].pts += 1; }
                            else { records[p2].l++; }
                        }
                    });
                }

                // 4. Sort
                const sorted = Object.values(records)
                    .filter(r => r.id !== "AVERAGE" || r.played > 0) // Only show Average if it played
                    .sort((a,b) => b.pts - a.pts || b.pf - a.pf); // Points then Points For

                setStandings(sorted);

            } catch (e) {
                console.error("H2H Calc Error:", e);
                setError("Failed to calculate standings.");
            } finally {
                setLoading(false);
            }
        };

        calculateStandings();
    }, [league, currentRound]);

    if (loading) return <div className="loading-container">Calculating Head-to-Head Table...</div>;
    if (error) return <div className="error-message">{error}</div>;

    return (
        <div className="leaderboard-container">
            <h3>⚔️ H2H Standings</h3>
            <table className="leaderboard-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>P</th>
                        <th>W</th>
                        <th>D</th>
                        <th>L</th>
                        <th>Pts</th>
                    </tr>
                </thead>
                <tbody>
                    {standings.map((team, idx) => (
                        <tr key={team.id} className={team.id === "AVERAGE" ? "ghost-row" : ""}>
                            <td>{idx + 1}</td>
                            <td>
                                {team.name}
                                <div style={{fontSize:'0.7rem', color:'#aaa'}}>PF: {team.pf}</div>
                            </td>
                            <td>{team.played}</td>
                            <td>{team.w}</td>
                            <td>{team.d}</td>
                            <td>{team.l}</td>
                            <td style={{fontWeight:'bold', color:'#ffd166'}}>{team.pts}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* --- FIXTURES SECTION --- */}
            <h4 style={{marginTop:'30px', borderTop:'1px solid #444', paddingTop:'20px'}}>
                Gameweek {currentRound} Fixtures
            </h4>
            <div className="fixtures-list" style={{display:'flex', flexDirection:'column', gap:'10px', width:'100%'}}>
                {(() => {
                    const currentFixtures = league.fixtures && league.fixtures[String(currentRound)] 
                        ? league.fixtures[String(currentRound)] 
                        : [];
                    
                    // Helper to get name from standings (which has names populated)
                    const getName = (id) => {
                        const rec = standings.find(r => r.id === id);
                        return rec ? rec.name : (id === 'AVERAGE' ? '👻 Average Bot' : 'Unknown');
                    };

                    if (currentFixtures.length === 0) return <p style={{color:'#777'}}>No fixtures scheduled for this week.</p>;

                    return currentFixtures.map((match, i) => (
                        <div key={i} style={{
                            display:'flex', 
                            justifyContent:'space-between', 
                            alignItems:'center',
                            backgroundColor: '#2a2a2a',
                            padding: '10px 15px',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}>
                            <div style={{flex:1, textAlign:'right', fontWeight: match.player1 === 'AVERAGE' ? 'normal' : 'bold'}}>
                                {getName(match.player1)}
                            </div>
                            <div style={{margin:'0 15px', color:'#aaa', fontSize:'0.8rem', fontWeight:'bold'}}>VS</div>
                            <div style={{flex:1, textAlign:'left', fontWeight: match.player2 === 'AVERAGE' ? 'normal' : 'bold'}}>
                                {getName(match.player2)}
                            </div>
                        </div>
                    ));
                })()}
            </div>
        </div>
    );
}

export default H2HLeaderboard;
