import { useState, useEffect } from 'react';
import { db, auth } from './firebase.js';
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import GameweekLeaderboard from './leaderboard.jsx'; // Renamed for clarity
import OverallLeaderboard from './overallLeaderboard.jsx'; // Import the new component

// --- API DETAILS for TheSportsDB ---
const API_KEY = '3';
const LEAGUE_ID = '4328'; // English Premier League
const SEASON = "2025-2026"; 
const ALL_SEASON_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`;

function App() {
  const [user, setUser] = useState(null); 
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [predictions, setPredictions] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [apiError, setApiError] = useState('');
  const [currentRound, setCurrentRound] = useState(null);
  const [gameWeekId, setGameWeekId] = useState(null);
  
  // State to control which view is active
  const [view, setView] = useState('predictions'); // 'predictions', 'gameweek', or 'overall'

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // When user logs in, create their profile in the 'users' collection if it doesn't exist
        const userRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
          await setDoc(userRef, {
            displayName: currentUser.displayName,
            email: currentUser.email,
            createdAt: serverTimestamp(),
            totalScore: 0
          });
        }
        setUser(currentUser);
        fetchPredictions(gameWeekId, currentUser);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, [gameWeekId]);

  useEffect(() => {
    const fetchCurrentGameweek = async () => {
      setIsLoading(true);
      setApiError(''); 
      try {
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
            setGameWeekId(`gameweek_${nextRound}`);
          }
        }
        if (!nextRound) {
          setApiError(`No upcoming gameweeks found for the ${SEASON} season.`);
          setIsLoading(false);
          return;
        }
        const roundUrl = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsround.php?id=${LEAGUE_ID}&r=${nextRound}&s=${SEASON}`;
        const roundResponse = await fetch(roundUrl);
        const roundData = await roundResponse.json();
        if (roundData.events && roundData.events.length > 0) {
          setMatches(roundData.events.map(match => ({
            id: match.idEvent,
            homeTeam: match.strHomeTeam,
            awayTeam: match.strAwayTeam,
            round: match.intRound,
          })));
        } else {
          setApiError(`Could not fetch matches for gameweek ${nextRound}.`);
        }
      } catch (error) {
        setApiError(`Could not load match data. ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCurrentGameweek();
  }, []);

  const fetchPredictions = async (gwId, currentUser) => {
    if (!gwId || !currentUser) return;
    const docRef = doc(db, "gameweeks", gwId, "predictions", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setPredictions(docSnap.data().scores);
      setStatusMessage('Predictions loaded successfully!');
    } else {
      setPredictions({});
      setStatusMessage('Make your picks for the new gameweek!');
    }
  };

  const handleSavePredictions = async () => {
    if (!gameWeekId || !user) return;
    try {
      setStatusMessage('Saving...');
      await setDoc(doc(db, "gameweeks", gameWeekId, "predictions", user.uid), {
        scores: predictions,
        userName: user.displayName
      });
      setStatusMessage('Predictions saved successfully!');
    } catch (e) {
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
  
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOutUser = async () => await signOut(auth);

  if (!user) {
    return (
      <div className="login-container">
        <h1>Welcome to Football Predictions</h1>
        <p>Please sign in to continue</p>
        <button className="login-button" onClick={signInWithGoogle}>Sign in with Google</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Football Predictions</h1>
        <div className="user-info">
          <span>Welcome, {user.displayName}!</span>
          <button className="logout-button" onClick={signOutUser}>Sign Out</button>
        </div>
        {currentRound && <h2>Gameweek {currentRound}</h2>}
      </header>

      <div className="view-toggle">
        <button onClick={() => setView('predictions')} className={view === 'predictions' ? 'active' : ''}>Predictions</button>
        <button onClick={() => setView('gameweek')} className={view === 'gameweek' ? 'active' : ''}>Gameweek Leaderboard</button>
        <button onClick={() => setView('overall')} className={view === 'overall' ? 'active' : ''}>Overall Leaderboard</button>
      </div>

      {view === 'predictions' && (
        <>
          {isLoading ? (
             <div className="loading-container"><h1>Finding Current Gameweek...</h1></div>
          ) : (
            <>
              <div className="status-message">{statusMessage}</div>
              {apiError && <div className="error-message">{apiError}</div>}
              <div className="matches-container">
                {matches.map((match) => (
                  <div key={match.id} className="match-card">
                    <div className="team"><label>{match.homeTeam}</label><input type="number" min="0" className="score-input" value={predictions[match.id]?.home || ''} onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)} /></div>
                    <span className="vs-text">vs</span>
                    <div className="team"><input type="number" min="0" className="score-input" value={predictions[match.id]?.away || ''} onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)} /><label>{match.awayTeam}</label></div>
                  </div>
                ))}
              </div>
              {matches.length > 0 && <button className="save-button" onClick={handleSavePredictions}>Save Predictions</button>}
            </>
          )}
        </>
      )}
      {view === 'gameweek' && <GameweekLeaderboard gameWeekId={gameWeekId} currentRound={currentRound} season={SEASON} />}
      {view === 'overall' && <OverallLeaderboard />}
    </div>
  );
}

export default App;

