import { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { collection, query, getDocs, doc, runTransaction, getDoc } from "firebase/firestore";
import PlayerPredictionsModal from './PlayerPredictionsModal';

const API_BASE_URL = "/api";
const COMPETITION_CODE = "PL";
// Note: Season is passed as prop, but we might want to ensure it's "2025" or passed correctly from App.

const POINTS_EXACT_SCORE = 3;
const POINTS_CORRECT_RESULT = 1;

const getMatchOutcome = (homeScore, awayScore) => {
  if (homeScore > awayScore) return 'H';
  if (awayScore > homeScore) return 'A'; 
  return 'D';
};

function GameweekLeaderboard({ gameWeekId, currentRound, season, leagueId }) {
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Modal State
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [matchesData, setMatchesData] = useState([]);

  useEffect(() => {
    const calculateAllScores = async () => {
      if (!gameWeekId || !currentRound || !season) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError('');
      setStatusMessage('');
      
      const apiKey = import.meta.env.VITE_FOOTBALL_DATA_ORG_KEY;
      if (!apiKey) {
          setError("API Key missing");
          setIsLoading(false);
          return;
      }
      
      try {
        // --- 1. FETCH LEAGUE MEMBERS (If Private League) ---
        let leagueMembers = null; // null means 'Global'
        if (leagueId) {
            const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
            if (leagueDoc.exists()) {
                leagueMembers = leagueDoc.data().members || [];
            } else {
                setError("League not found.");
                setIsLoading(false);
                return;
            }
        }

        // --- 2. FETCH MATCH OUTCOMES ---
        const gameweekRef = doc(db, "gameweeks", gameWeekId);
        const gameweekSnap = await getDoc(gameweekRef);
        // ... (existing finalized check)
        if (gameweekSnap.exists() && gameweekSnap.data().isFinalized) {
          setIsFinalized(true);
        } else {
          setIsFinalized(false);
        }

        const cacheRef = doc(db, "matches_cache", `week_${currentRound}`);
        const cacheSnap = await getDoc(cacheRef);
        
        const matchResults = {};
        
        if (cacheSnap.exists()) {
             const cachedMatches = cacheSnap.data().matches || [];
             setMatchesData(cachedMatches); // Store full match data for modal

             cachedMatches.forEach(match => {
                 if (match.status === 'FINISHED' && match.score.fullTime.home !== null) {
                     matchResults[String(match.id)] = {
                         home: match.score.fullTime.home,
                         away: match.score.fullTime.away
                     };
                 }
             });
        } else {
            console.warn(`No cached data for Leaderboard Week ${currentRound}`);
            setError('Waiting for Admin to update match data...');
            setMatchesData([]);
        }

        // --- 3. FETCH & CALCULATE PREDICTIONS ---
        const playersList = [];
        const predictionsRef = collection(db, "gameweeks", gameWeekId, "predictions");
        
        // Fetch all valid users first to filter out deleted ones
        const usersSnap = await getDocs(collection(db, "users"));
        const validUserIds = new Set(usersSnap.docs.map(u => u.id));

        const predictionsSnapshot = await getDocs(query(predictionsRef));

        predictionsSnapshot.forEach((doc) => {
          // FILTER: If Private League, skip non-members
          if (leagueMembers && !leagueMembers.includes(doc.id)) return;
          
          // FILTER: Skip deleted users (orphaned predictions)
          if (!validUserIds.has(doc.id)) return; 

          const playerData = doc.data();
          let totalPoints = 0;
          let exactCount = 0;
          let correctResultCount = 0;

          for (const matchId in playerData.scores) {
            const prediction = playerData.scores[matchId];
            const result = matchResults[matchId];
            if (prediction && result) {
              const predHome = parseInt(prediction.home, 10);
              const predAway = parseInt(prediction.away, 10);
              if (predHome === result.home && predAway === result.away) {
                totalPoints += POINTS_EXACT_SCORE;
                exactCount++;
              } else if (getMatchOutcome(predHome, predAway) === getMatchOutcome(result.home, result.away)) {
                totalPoints += POINTS_CORRECT_RESULT;
                correctResultCount++;
              }
            }
          }
          playersList.push({ 
            id: doc.id, 
            name: playerData.userName || 'Anonymous', 
            points: totalPoints,
            details: `(${exactCount} Exact, ${correctResultCount} Correct)` 
          });
        });
        
        playersList.sort((a, b) => b.points - a.points);
        setPlayers(playersList);

   // --- 4. AUTO-FINALIZE LOGIC ---
        const cachedMatches = cacheSnap.exists() ? (cacheSnap.data().matches || []) : [];
        const allMatchesFinished = cachedMatches.length > 0 && cachedMatches.every(m => m.status === 'FINISHED');

        // Check if we should auto-finalize
        if (!gameweekSnap.data()?.isFinalized && allMatchesFinished && cachedMatches.length > 0 && playersList.length > 0) {
            console.log("Auto-finalizing gameweek...");
            // ... (keep existing auto-finalize logic) ...
             try {
                await runTransaction(db, async (transaction) => {
                    const gwRefCheck = doc(db, "gameweeks", gameWeekId);
                    const gwDoc = await transaction.get(gwRefCheck);
                    
                    if (gwDoc.exists() && gwDoc.data().isFinalized) return; 

                    const userRefs = playersList.map(p => doc(db, "users", p.id));
                    const userDocs = await Promise.all(userRefs.map(ref => transaction.get(ref)));

                    userDocs.forEach((userDoc, index) => {
                        const player = playersList[index];
                        if (userDoc.exists()) {
                            // 1. Update Global Total Score
                            const currentTotal = userDoc.data().totalScore || 0;
                            const newTotalScore = currentTotal + player.points;
                            transaction.update(userDoc.ref, { totalScore: newTotalScore });

                            // 2. Persist Gameweek Score (Critical for H2H)
                            // We need to write to: gameweeks/{gwId}/predictions/{uid}
                            // Note: We already read from this collection to build playersList, 
                            // so we know the doc exists (player.id is the doc key).
                            const predRef = doc(db, "gameweeks", gameWeekId, "predictions", player.id);
                            transaction.update(predRef, { points: player.points });
                        }
                    });
                    
                    transaction.set(gwRefCheck, { isFinalized: true }, { merge: true });
                });
                
                setIsFinalized(true);
                setStatusMessage('✅ System Auto-Finalized scores for this week.');
            } catch (err) {
                console.error("Auto-finalize failed:", err);
            }
        }

      } catch (err) {
        console.error(err);
        setError("Could not load leaderboard data.");
      } finally {
        setIsLoading(false);
      }
    };
    calculateAllScores();
  }, [gameWeekId, currentRound, season, leagueId]);

  if (isLoading) {
    return <div className="loading-container"><h3>Calculating Scores...</h3></div>;
  }
  if (!gameWeekId) {
    return <div className="leaderboard-container"><p>Waiting for gameweek to be determined...</p></div>;
  }

  return (
    <div className="leaderboard-container">
      <h3>Gameweek Leaderboard</h3>
      {error && <p className="error-message">{error}</p>}
      {statusMessage && <div className="status-message" style={{marginBottom:'1rem', padding:'10px', backgroundColor:'rgba(46, 204, 113, 0.2)', borderRadius:'6px'}}>{statusMessage}</div>}
      
      {players.length > 0 ? (
        <table className="leaderboard-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Points</th></tr></thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id}>
                <td>{index + 1}</td>
                <td>
                  <span 
                    onClick={() => setSelectedPlayer(player)}
                    style={{ cursor: 'pointer', textDecoration: 'underline', color: '#ffd166' }}
                    title="View Picks"
                  >
                      {player.name}
                  </span>
                  <div style={{fontSize: '0.75rem', color: '#aaa'}}>{player.details}</div>
                </td>
                <td>{player.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : ( !error && <p>No one has made predictions yet.</p> )}
      
      {/* Predictions Modal */}
      <PlayerPredictionsModal 
          isOpen={!!selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          targetPlayerId={selectedPlayer?.id}
          targetPlayerName={selectedPlayer?.name}
          gameWeekId={gameWeekId}
          matches={matchesData}
      />
    </div>
  );
}

export default GameweekLeaderboard;

