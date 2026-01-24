import { useState, useEffect } from 'react';
import './App.css';
import { db, auth } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
// Add onSnapshot to imports
import { doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import GameweekLeaderboard from './leaderboard.jsx';
import OverallLeaderboard from './overallLeaderboard.jsx';
import Admin from './Admin.jsx';
import ProfileSetup from './ProfileSetup.jsx';
import LeaguesView from './LeaguesView.jsx';
import H2HLeaderboard from './H2HLeaderboard.jsx';
import { checkForAutoUpdate, tryTriggerLiveUpdate } from './utils/dataUpdater.js';
import { getMatchGradient, getTeamColor } from './utils/teamColors.js';
import TeamForm from './TeamForm.jsx';

// ...

// --- API DETAILS for TheSportsDB ---
const API_KEY = '3';
const API_BASE_URL = "/api";
const COMPETITION_CODE = "PL";
const SEASON = "2025";
const ADMIN_EMAILS = ["yousefhegazi74@gmail.com"];

function App() {
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [predictions, setPredictions] = useState({});
  const [apiError, setApiError] = useState('');
  const [currentRound, setCurrentRound] = useState(null);
  const [gameWeekId, setGameWeekId] = useState(null);
  const [user, setUser] = useState(null);
  const [activeView, setActiveView] = useState('predictions');
  const [toast, setToast] = useState({ message: '', visible: false, type: 'info' });
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentLeague, setCurrentLeague] = useState(null);
  const [teamForms, setTeamForms] = useState({});

  const showToast = (message, type = 'info') => {
    setToast({ message, visible: true, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  // Real-time listener for Matches
  useEffect(() => {
    if (!currentRound) return;

    setIsLoading(true);
    setApiError('');
    
    // Listen to the cache document
    const docRef = doc(db, "matches_cache", `week_${currentRound}`);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setMatches(data.matches || []);
            setApiError('');
        } else {
            console.warn("No match data found for this week.");
            setMatches([]);
            setApiError('Waiting for match data...');
        }
        setIsLoading(false);
    }, (error) => {
        console.error("Firestore Error:", error);
        setApiError("Error loading live data.");
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentRound]);

  // LIVE TRIGGER: Crowd-Sourced Cron
  useEffect(() => {
      if (!currentRound) return;
      
      const interval = setInterval(() => {
          tryTriggerLiveUpdate(currentRound);
      }, 60000);

      tryTriggerLiveUpdate(currentRound);

      return () => clearInterval(interval);
  }, [currentRound]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsCheckingProfile(true); // START LOAD
        
        fetchCurrentGameweek();
        checkForAutoUpdate();
        
        // Check Profile
        try {
            console.log("Checking profile for:", currentUser.uid);
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            
            // Critical check: if no doc, or no name, OR if auth profile itself has no name
            if (!userDoc.exists() || !userDoc.data().displayName) {
                console.log("Profile incomplete. Showing onboarding.");
                setShowOnboarding(true);
            } else {
                console.log("Profile complete.");
                setShowOnboarding(false);
                
                // Self-healing: Ensure totalScore exists
                if (userDoc.data().totalScore === undefined) {
                    console.log("Healing missing totalScore...");
                    await setDoc(doc(db, "users", currentUser.uid), { totalScore: 0 }, { merge: true });
                }
            }
        } catch (err) {
            console.error("Error checking profile:", err);
            setShowOnboarding(true); // Fail safe
        } finally {
            setIsCheckingProfile(false); // END LOAD
        }
      } else {
        setIsCheckingProfile(false);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchCurrentGameweek = async () => {
    setIsLoading(true);
    try {
      const systemRef = doc(db, "system", "status");
      const systemSnap = await getDoc(systemRef);
      
      if (systemSnap.exists() && systemSnap.data().currentRound) {
        setCurrentRound(String(systemSnap.data().currentRound));
      } else {
        setCurrentRound("1");
      }
    } catch (e) {
      console.error(e);
      setCurrentRound("1"); 
    }
  };

  // Listen to currentRound changes to update Gameweek ID
  useEffect(() => {
    if (currentRound && user) {
        setGameWeekId(`gameweek_${currentRound}`);
        // match fetching is handled by the onSnapshot effect now
    }
  }, [currentRound, user]);

  useEffect(() => {
    const fetchPredictions = async () => {
      if (!gameWeekId || !user) return;
      const docRef = doc(db, "gameweeks", gameWeekId, "predictions", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setPredictions(docSnap.data().scores);
        showToast('Predictions loaded!');
      } else {
        setPredictions({});
      }
    };
    fetchPredictions();
  }, [gameWeekId, user]);

  // Fetch Forms - RELIGIOUSLY LISTEN
  useEffect(() => {
    const docRef = doc(db, "system", "standings");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            console.log("Forms loaded:", Object.keys(docSnap.data().forms || {}).length);
            setTeamForms(docSnap.data().forms || {});
        } else {
            console.log("No standings data found.");
        }
    }, (err) => console.error("Error listening to standings:", err));

    return () => unsubscribe();
  }, []);

  // H2H Opponent Logic
  const [h2hOpponent, setH2hOpponent] = useState(null);

  useEffect(() => {
    const fetchOpponent = async () => {
        setH2hOpponent(null);
        if (!currentLeague || currentLeague.type !== 'h2h' || !currentRound || !currentLeague.fixtures) return;

        const roundFixtures = currentLeague.fixtures[currentRound] || [];
        const myMatch = roundFixtures.find(m => m.player1 === user.uid || m.player2 === user.uid);
        
        if (myMatch) {
            const oppId = myMatch.player1 === user.uid ? myMatch.player2 : myMatch.player1;
            if (oppId === "AVERAGE") {
                setH2hOpponent("👻 Average Bot");
            } else {
                try {
                    const oppDoc = await getDoc(doc(db, "users", oppId));
                    if (oppDoc.exists()) {
                        setH2hOpponent(oppDoc.data().displayName);
                    } else {
                        setH2hOpponent("Unknown Player");
                    }
                } catch (e) {
                     console.error("Error fetching opponent:", e);
                }
            }
        } else {
            setH2hOpponent("No Match"); // Bye week or error
        }
    };
    fetchOpponent();
  }, [currentLeague, currentRound, user]);

  const handleSavePredictions = async () => {
    if (!gameWeekId || !user) return;
    try {
      // Skipped "Saving..." toast for smoother UX
      const userRef = doc(db, "users", user.uid);
      // Ensure totalScore exists
      const userSnap = await getDoc(userRef);
      const currentData = userSnap.exists() ? userSnap.data() : {};
      
      await setDoc(userRef, { 
          name: user.displayName, 
          id: user.uid,
          totalScore: currentData.totalScore !== undefined ? currentData.totalScore : 0
      }, { merge: true });
      await setDoc(doc(db, "gameweeks", gameWeekId, "predictions", user.uid), { scores: predictions, userName: user.displayName });
      showToast('Saved', 'success');
    } catch (e) {
      console.error("Save error details:", e);
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleScoreChange = (matchId, team, score) => {
    const newPredictions = { ...predictions };
    if (!newPredictions[matchId]) newPredictions[matchId] = { home: '', away: '' };
    newPredictions[matchId][team] = score;
    setPredictions(newPredictions);
  };


  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } 
    catch (error) { 
      console.error("Authentication error:", error); 
      alert(`Login failed: ${error.message}`);
    }
  };

  const handleLogout = () => signOut(auth);

  if ((isLoading && matches.length === 0) || isCheckingProfile) return (
    <div className="app-container">
      <header className="app-header">
        <h1>Football Predictions</h1>
        {isCheckingProfile ? <div className="skeleton-gw" style={{width: '200px'}}>Wait... Checking Profile</div> : <div className="skeleton-gw"></div>}
      </header>
      <div className="matches-container">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="match-card skeleton">
            <div className="skeleton-info"></div>
            <div className="prediction-row">
              <div className="skeleton-team"></div>
              <div className="skeleton-vs"></div>
              <div className="skeleton-team"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  if (!user) return (
    <div className="login-container">
      <h1>Football Predictions</h1>
      <button onClick={handleLogin} className="login-button">Sign in with Google</button>
    </div>
  );

  return (
    <div className="app-container">
      {showOnboarding && <ProfileSetup user={user} onComplete={() => setShowOnboarding(false)} />}
      <header className="app-header">
        <h1>Football Predictions</h1>
        
        {currentRound && (
            <div className="gameweek-controls">
                <button 
                  onClick={() => setCurrentRound(String(Math.max(1, parseInt(currentRound) - 1)))}
                  className="nav-button"
                  disabled={parseInt(currentRound) <= 1}
                >
                  &lt;
                </button>
                <select 
                  value={currentRound} 
                  onChange={(e) => setCurrentRound(e.target.value)}
                  className="gw-select"
                >
                    {[...Array(38)].map((_, i) => (
                        <option key={i+1} value={String(i+1)}>
                            Gameweek {i+1}
                        </option>
                    ))}
                </select>
                <button 
                  onClick={() => setCurrentRound(String(parseInt(currentRound) + 1))}
                  className="nav-button"
                >
                  &gt;
                </button>
            </div>
        )}
      </header>
      <div className="user-info">
        <span>Welcome, {user.displayName}!</span>
        <button onClick={handleLogout} className="logout-button">Sign Out</button>
      </div>
      <div className={`toast ${toast.visible ? 'visible' : ''} ${toast.type}`}>
        {toast.message}
      </div>

      <div className="view-toggle">
        <button onClick={() => setActiveView('predictions')} className={activeView === 'predictions' ? 'active' : ''}>Predictions</button>
        <button onClick={() => setActiveView('gameweek')} className={activeView === 'gameweek' ? 'active' : ''}>Gameweek Leaderboard</button>
        <button onClick={() => setActiveView('overall')} className={activeView === 'overall' ? 'active' : ''}>Overall Leaderboard</button>
        <button onClick={() => setActiveView('leagues')} className={activeView === 'leagues' ? 'active' : ''}>My Leagues</button>
        
        {user && ADMIN_EMAILS.includes(user.email) && (
            <button onClick={() => setActiveView('admin')} className={activeView === 'admin' ? 'active' : ''} style={{opacity: 0.5}}>Admin</button>
        )}
      </div>
      
      {apiError && <div className="error-message">{apiError}</div>}
      
      {/* Current League Indicator */}
      {currentLeague && activeView !== 'leagues' && (
          <div style={{marginBottom:'1rem', color:'#aaa', fontSize:'0.9rem'}}>
              Ranking: <span style={{color:'white', fontWeight:'bold'}}>🏆 {currentLeague.name}</span>
              <button 
                onClick={() => setCurrentLeague(null)} 
                style={{marginLeft:'10px', background:'none', border:'none', color:'#e63946', cursor:'pointer', fontSize:'0.8rem'}}
              >
                  (Reset to Global)
              </button>
          </div>
      )}

      {activeView === 'predictions' && (
        <>
          {h2hOpponent && (
              <div 
                style={{
                    background: 'linear-gradient(90deg, #264653 0%, #2a9d8f 100%)', 
                    color: 'white', 
                    padding: '15px', 
                    borderRadius: '10px', 
                    marginBottom: '20px', 
                    textAlign: 'center',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                    border: '1px solid #2a9d8f'
                }}
              >
                  <div style={{fontSize: '0.9rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px'}}>Gameweek {currentRound} Matchup</div>
                  <div style={{fontSize: '1.4rem', fontWeight: 'bold', marginTop: '5px'}}>
                      You <span style={{color:'#e9c46a'}}>vs</span> {h2hOpponent}
                  </div>
              </div>
          )}

          <div className="matches-container">
            {matches.map((match) => {
              const isLocked = new Date().getTime() > match.timestamp;
              const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';
              const isFinished = match.status === 'FINISHED';

              const gradientStyle = {
                  background: getMatchGradient(match.homeTeam, match.awayTeam),
                  borderLeft: `4px solid ${getTeamColor(match.homeTeam)}`,
                  borderRight: `4px solid ${getTeamColor(match.awayTeam)}`
              };

              return (
              <div 
                key={match.id} 
                className={`match-card ${isLocked ? 'locked' : ''} ${isLive ? 'live-view' : ''}`}
                style={gradientStyle}
              >
                {/* Visual Flair: Thin highlight on the sides - Replaced by borders */}
                
                
                <div className="match-info">
                  {match.date}
                  {isLive && <span className="status-badge live">LIVE</span>}
                  {isFinished && <span className="status-badge finished">FT</span>}
                  {isLocked && !isLive && !isFinished && <span className="status-badge locked-badge">Locked</span>}
                </div>
                {/* --- DEFINITIVE JSX FIX --- */}
                <div className="prediction-row">
                  {/* HOME TEAM: Logo -> Name -> Input */}
                  <div className="team-container home">
                    <img src={match.homeLogo} alt={match.homeTeam} className="team-logo" />
                    <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', marginRight:'10px'}}>
                        <span className="team-name">{match.homeTeam}</span>
                        <TeamForm formString={teamForms[match.homeTeam]} />
                    </div>
                    <input 
                      type="number" 
                      min="0" 
                      className="score-input" 
                      value={predictions[match.id]?.home || ''} 
                      onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
                      onBlur={() => handleSavePredictions()}
                      disabled={isLocked}
                    />
                  </div>

                  <div className="vs-separator">-</div>
                  
                  {/* AWAY TEAM: Input -> Logo -> Name */}
                  <div className="team-container away">
                    <input 
                      type="number" 
                      min="0" 
                      className="score-input" 
                      value={predictions[match.id]?.away || ''} 
                      onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
                      onBlur={() => handleSavePredictions()}
                      disabled={isLocked}
                    />
                    <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start', marginLeft:'10px'}}>
                        <span className="team-name">{match.awayTeam}</span>
                        <TeamForm formString={teamForms[match.awayTeam]} />
                    </div>
                    <img src={match.awayLogo} alt={match.awayTeam} className="team-logo" />
                  </div>
                </div>
                {/* Real Score Display */}
                {(isLive || isFinished || (match.score?.fullTime?.home != null)) && match.score?.fullTime?.home !== null && (
                    <div className="real-score-display">
                        <span className="actual-score">{match.score.fullTime.home}</span>
                        <span className="score-divider">-</span>
                        <span className="actual-score">{match.score.fullTime.away}</span>
                        {isLive && <span className="live-indicator">LIVE</span>}
                    </div>
                )}
              </div>
              );
            })}
          </div>
          {/* Auto-save enabled, button removed */}
        </>
      )}
      
      {activeView === 'leagues' && (
          <LeaguesView 
            user={user} 
            onSelectLeague={(league) => {
                setCurrentLeague(league);
                setActiveView('gameweek'); // Auto-switch to leaderboard
                showToast(`Switched to ${league ? league.name : 'Global League'}`);
            }} 
          />
      )}

      {activeView === 'gameweek' && (
          <>
            {/* Contextual Navigation for Leaderboard */}
            <div style={{
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                gap: '1rem', 
                marginBottom: '1rem',
                backgroundColor: '#2a2a2a',
                padding: '10px',
                borderRadius: '8px'
            }}>
                <button 
                  onClick={() => setCurrentRound(String(Math.max(1, parseInt(currentRound) - 1)))}
                  className="nav-button"
                  disabled={parseInt(currentRound) <= 1}
                  style={{fontSize: '1.2rem', padding: '5px 15px'}}
                >
                  &lt;
                </button>
                <div style={{fontWeight: 'bold', fontSize: '1.1rem'}}>
                    Gameweek {currentRound}
                </div>
                <button 
                  onClick={() => setCurrentRound(String(parseInt(currentRound) + 1))}
                  className="nav-button"
                  style={{fontSize: '1.2rem', padding: '5px 15px'}}
                >
                  &gt;
                </button>
            </div>


            {currentLeague?.type === 'h2h' && (
                <H2HLeaderboard league={currentLeague} currentRound={currentRound} />
            )}
            <GameweekLeaderboard gameWeekId={gameWeekId} currentRound={currentRound} season={SEASON} leagueId={currentLeague?.id} />
          </>
      )}
      {activeView === 'overall' && <OverallLeaderboard leagueId={currentLeague?.id} />}
      {activeView === 'admin' && user && ADMIN_EMAILS.includes(user.email) && <Admin />}
    </div>
  );
}
export default App;
