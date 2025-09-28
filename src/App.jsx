import { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { doc, setDoc, getDoc } from "firebase/firestore";

const USER_ID = "user_hegazi";

// --- API DETAILS for TheSportsDB ---
const API_KEY = '3';
const LEAGUE_ID = '4328'; // English Premier League
// NOTE: Using a recent/current season is more reliable with the free API.
const SEASON = "2025-2026"; 
const ALL_SEASON_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`;

function App() {
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [predictions, setPredictions] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [apiError, setApiError] = useState('');
  const [currentRound, setCurrentRound] = useState(null);
  const [gameWeekId, setGameWeekId] = useState(null); // Dynamic ID for Firestore

  // Effect to fetch match data and determine the current gameweek
  useEffect(() => {
    const fetchCurrentGameweek = async () => {
      setIsLoading(true);
      setApiError(''); 
      
      try {
        // STEP 1: Fetch all season events to find the *next* round number.
        const seasonResponse = await fetch(ALL_SEASON_URL);
        const seasonData = await seasonResponse.json();

        let nextRound;
        if (seasonData.events) {
          const upcomingEvents = seasonData.events
            .filter(match => new Date(match.dateEvent) >= new Date())
            .sort((a, b) => new Date(a.dateEvent) - new Date(b.dateEvent));

          if (upcomingEvents.length > 0) {
            nextRound = upcomingEvents[0].intRound;
            setCurrentRound(nextRound);
            setGameWeekId(`gameweek_${nextRound}`); // Set the dynamic ID for this gameweek
          }
        }

        if (!nextRound) {
          setApiError(`No upcoming gameweeks found for the ${SEASON} season. It may be over.`);
          setIsLoading(false);
          return;
        }

        // STEP 2: Now fetch only the matches for that specific round.
        const roundUrl = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsround.php?id=${LEAGUE_ID}&r=${nextRound}&s=${SEASON}`;
        const roundResponse = await fetch(roundUrl);
        const roundData = await roundResponse.json();

        if (roundData.events && roundData.events.length > 0) {
          const gameweekMatches = roundData.events.map(match => ({
            id: match.idEvent,
            homeTeam: match.strHomeTeam,
            awayTeam: match.strAwayTeam,
            round: match.intRound,
          }));
          setMatches(gameweekMatches);
        } else {
          setApiError(`Could not fetch matches for gameweek ${nextRound}.`);
        }

      } catch (error) {
        console.error("Error fetching matches:", error);
        setApiError(`Could not load match data. ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentGameweek();
  }, []);

  // Effect to fetch predictions whenever the gameweek changes
  useEffect(() => {
    const fetchPredictions = async () => {
      if (!gameWeekId) return; // Don't run if we don't know the gameweek yet

      const docRef = doc(db, "gameweeks", gameWeekId, "predictions", USER_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setPredictions(docSnap.data().scores);
        setStatusMessage('Predictions loaded successfully!');
      } else {
        setPredictions({}); // Reset predictions for the new week
        setStatusMessage('No predictions for this gameweek. Make your picks!');
      }
    };

    fetchPredictions();
  }, [gameWeekId]); // This effect re-runs when gameWeekId changes

  const handleSavePredictions = async () => {
    if (!gameWeekId) {
      setStatusMessage('Error: Cannot save, gameweek not identified.');
      return;
    }
    try {
      setStatusMessage('Saving...');
      await setDoc(doc(db, "gameweeks", gameWeekId, "predictions", USER_ID), {
        scores: predictions
      });
      setStatusMessage('Predictions saved successfully!');
    } catch (e) {
      console.error("Error adding document: ", e);
      setStatusMessage('Error saving predictions.');
    }
  };

  const handleScoreChange = (matchId, team, score) => {
    const newPredictions = { ...predictions };
    if (!newPredictions[matchId]) {
      newPredictions[matchId] = { home: '', away: '' };
    }
    newPredictions[matchId][team] = score;
    setPredictions(newPredictions);
  };


  if (isLoading) {
    return <div className="loading-container"><h1>Finding Current Gameweek...</h1></div>;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Football Predictions</h1>
        {currentRound && <h2>Gameweek {currentRound}</h2>}
      </header>
      
      <div className="status-message">{statusMessage}</div>

      {apiError && <div className="error-message">{apiError}</div>}

      <div className="matches-container">
        {matches.map((match) => (
          <div key={match.id} className="match-card">
            <div className="team">
              <label>{match.homeTeam}</label>
              <input
                type="number"
                min="0"
                className="score-input"
                value={predictions[match.id]?.home || ''}
                onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
              />
            </div>
            <span className="vs-text">vs</span>
            <div className="team">
              <input
                type="number"
                min="0"
                className="score-input"
                value={predictions[match.id]?.away || ''}
                onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
              />
              <label>{match.awayTeam}</label>
            </div>
          </div>
        ))}
      </div>

      {matches.length > 0 && 
        <button className="save-button" onClick={handleSavePredictions}>Save Predictions</button>
      }
    </div>
  );
}

export default App;

