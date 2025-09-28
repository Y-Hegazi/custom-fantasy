import { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { collection, query, getDocs, doc, runTransaction, getDoc, setDoc } from "firebase/firestore";

// --- Re-usable API details ---
const API_KEY = '3';
const LEAGUE_ID = '4328';

// --- Scoring Rules ---
const POINTS_EXACT_SCORE = 3;
const POINTS_CORRECT_RESULT = 1;

const getMatchOutcome = (homeScore, awayScore) => {
  if (homeScore > awayScore) return 'H';
  if (awayScore > homeScore) return 'A';
  return 'D';
};

function GameweekLeaderboard({ gameWeekId, currentRound, season }) {
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizeStatus, setFinalizeStatus] = useState('');

  useEffect(() => {
    const calculateAllScores = async () => {
      if (!gameWeekId || !currentRound || !season) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError('');
      
      try {
        // Check if the gameweek is already finalized
        const gameweekRef = doc(db, "gameweeks", gameWeekId);
        const gameweekSnap = await getDoc(gameweekRef);
        if (gameweekSnap.exists() && gameweekSnap.data().isFinalized) {
          setIsFinalized(true);
        }

        const resultsUrl = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsround.php?id=${LEAGUE_ID}&r=${currentRound}&s=${season}`;
        const resultsResponse = await fetch(resultsUrl);
        const resultsData = await resultsResponse.json();
        
        const matchResults = {};
        if (resultsData.events) {
          resultsData.events.forEach(match => {
            if (match.intHomeScore !== null && match.intAwayScore !== null) {
              matchResults[match.idEvent] = {
                home: parseInt(match.intHomeScore, 10),
                away: parseInt(match.intAwayScore, 10),
              };
            }
          });
        }

        if (Object.keys(matchResults).length === 0) {
          setError('No finished matches yet for this gameweek. Scores will be calculated once games are complete.');
        }

        const playersList = [];
        const predictionsRef = collection(db, "gameweeks", gameWeekId, "predictions");
        const predictionsSnapshot = await getDocs(query(predictionsRef));

        predictionsSnapshot.forEach((doc) => {
          const playerData = doc.data();
          let totalPoints = 0;
          for (const matchId in playerData.scores) {
            const prediction = playerData.scores[matchId];
            const result = matchResults[matchId];
            if (prediction && result) {
              const predHome = parseInt(prediction.home, 10);
              const predAway = parseInt(prediction.away, 10);
              if (predHome === result.home && predAway === result.away) {
                totalPoints += POINTS_EXACT_SCORE;
              } else if (getMatchOutcome(predHome, predAway) === getMatchOutcome(result.home, result.away)) {
                totalPoints += POINTS_CORRECT_RESULT;
              }
            }
          }
          playersList.push({ id: doc.id, name: playerData.userName || 'Anonymous', points: totalPoints });
        });
        
        playersList.sort((a, b) => b.points - a.points);
        setPlayers(playersList);

      } catch (err) {
        setError("Could not load leaderboard data.");
      } finally {
        setIsLoading(false);
      }
    };
    calculateAllScores();
  }, [gameWeekId, currentRound, season]);

  const handleFinalizeScores = async () => {
    setFinalizeStatus('Finalizing...');
    try {
      await runTransaction(db, async (transaction) => {
        const gameweekRef = doc(db, "gameweeks", gameWeekId);
        // First, check again in transaction to prevent race conditions
        const gwDoc = await transaction.get(gameweekRef);
        if (gwDoc.exists() && gwDoc.data().isFinalized) {
          throw new Error("Gameweek has already been finalized.");
        }

        for (const player of players) {
          const userRef = doc(db, "users", player.id);
          const userDoc = await transaction.get(userRef);
          if (userDoc.exists()) {
            const newTotalScore = (userDoc.data().totalScore || 0) + player.points;
            transaction.update(userRef, { totalScore: newTotalScore });
          }
        }
        
        // Mark the gameweek as finalized
        transaction.set(gameweekRef, { isFinalized: true }, { merge: true });
      });
      setIsFinalized(true);
      setFinalizeStatus('Scores finalized and added to overall leaderboard!');
    } catch (e) {
      console.error("Transaction failed: ", e);
      setFinalizeStatus(`Error: ${e.message}`);
    }
  };

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
      {players.length > 0 ? (
        <table className="leaderboard-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Points</th></tr></thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id}><td>{index + 1}</td><td>{player.name}</td><td>{player.points}</td></tr>
            ))}
          </tbody>
        </table>
      ) : ( !error && <p>No one has made predictions yet.</p> )}
      
      <div className="finalize-section">
        {players.length > 0 && (
          <button onClick={handleFinalizeScores} disabled={isFinalized} className="finalize-button">
            {isFinalized ? 'Gameweek Finalized' : 'Finalize & Update Overall Scores'}
          </button>
        )}
        {finalizeStatus && <p className="status-message">{finalizeStatus}</p>}
      </div>
    </div>
  );
}

export default GameweekLeaderboard;

