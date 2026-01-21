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

                // We need to fetch SCORES for these rounds
                // Optimization: Fetch all needed gameweeks in parallel
                const gwPromises = roundsToProcess.map(r => getDoc(doc(db, "gameweeks", `gameweek_${r}`)));
                const gwSnaps = await Promise.all(gwPromises);

                for (let i = 0; i < gwSnaps.length; i++) {
                    const gwSnap = gwSnaps[i];
                    const roundNum = roundsToProcess[i];
                    
                    if (!gwSnap.exists() || !gwSnap.data().isFinalized) continue; // Skip unfinalized

                    // Fetch individual scores for this week
                    // We need the 'predictions' subcollection effectively
                    const predsSnap = await getDocs(collection(db, "gameweeks", gwSnap.id, "predictions"));
                    const roundScores = {};
                    let totalScore = 0;
                    let count = 0;

                    predsSnap.forEach(doc => {
                        const pts = doc.data().points || 0;
                        roundScores[doc.id] = pts;
                        // For Average Calc (exclude AVERAGE bot obviously)
                        if (league.members.includes(doc.id)) {
                             totalScore += pts;
                             count++;
                        }
                    });

                    // Calculate Average
                    const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
                    roundScores["AVERAGE"] = avgScore;

                    // 3. Process Matchups for this Round
                    const matchups = league.fixtures[String(roundNum)] || [];
                    
                    matchups.forEach(match => {
                        const p1 = match.player1;
                        const p2 = match.player2;
                        
                        const score1 = roundScores[p1] !== undefined ? roundScores[p1] : 0; // Default 0 if no play
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
