import { useState, useEffect, useCallback } from 'react';
import { db } from './firebase';
import { collection, addDoc, doc, getDoc, updateDoc, deleteDoc, arrayUnion, query, where, getDocs } from "firebase/firestore";
import './App.css'; // Re-use auth-overlay / card styles

function LeaguesView({ user, onSelectLeague }) {
  const [mode, setMode] = useState('list'); // 'list', 'create', 'join'
  const [myLeagues, setMyLeagues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Inputs
  const [newLeagueName, setNewLeagueName] = useState('');
  const [leagueType, setLeagueType] = useState('classic'); // 'classic' | 'h2h'
  const [joinCode, setJoinCode] = useState('');

  const fetchMyLeagues = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
        // 1. Get User Doc to find league IDs
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const leagueIds = userSnap.exists() ? (userSnap.data().myLeagues || []) : [];

        if (leagueIds.length === 0) {
            setMyLeagues([]);
            setLoading(false);
            return;
        }

        // 2. Fetch League Docs (In a real app, use where('id', 'in', ...) but limits apply. 
        // For now, simpler to fetch individually or use a where query if < 10)
        // Let's use Promise.all for simplicity
        const leaguePromises = leagueIds.map(id => getDoc(doc(db, "leagues", id)));
        const leagueSnaps = await Promise.all(leaguePromises);
        
        const leagues = leagueSnaps
            .filter(snap => snap.exists())
            .map(snap => ({ id: snap.id, ...snap.data() }));

        setMyLeagues(leagues);
    } catch (err) {
        console.error("Error fetching leagues:", err);
        setError("Failed to load your leagues.");
    } finally {
        setLoading(false);
    }
  }, [user]);

  // Fetch Logic
  useEffect(() => {
    fetchMyLeagues();
  }, [fetchMyLeagues]);

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!newLeagueName.trim()) return;

    setLoading(true);
    setError('');

    try {
        // Generate a 6-char random code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();

        const leagueRef = await addDoc(collection(db, "leagues"), {
            name: newLeagueName,
            code: code,
            adminId: user.uid,
            members: [user.uid],
            createdAt: new Date().toISOString(),
            type: leagueType,
            // H2H needs to be 'started' later to generate fixtures. Classic is always active.
            status: leagueType === 'h2h' ? 'recruiting' : 'active', 
            settings: {
                winPts: 3,
                drawPts: 1,
                lossPts: 0
            }
        });

        // Add to User's myLeagues
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            myLeagues: arrayUnion(leagueRef.id)
        });

        await fetchMyLeagues();
        setMode('list');
        setNewLeagueName('');
        setLeagueType('classic'); 
    } catch (err) {
        console.error(err);
        setError("Failed to create league.");
    } finally {
        setLoading(false);
    }
  };

  const handleJoinLeague = async (e) => {
      e.preventDefault();
      if (!joinCode.trim()) return;
      
      setLoading(true);
      setError('');

      try {
          // Find league by unique code
          const q = query(collection(db, "leagues"), where("code", "==", joinCode.trim().toUpperCase()));
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
              setError("Invalid League Code.");
              setLoading(false);
              return;
          }

          const leagueDoc = querySnapshot.docs[0];
          const leagueData = leagueDoc.data();

          if (leagueData.members.includes(user.uid)) {
              setError("You are already in this league.");
              setLoading(false);
              return;
          }

          // Update League
          await updateDoc(doc(db, "leagues", leagueDoc.id), {
              members: arrayUnion(user.uid)
          });

          // Update User
          await updateDoc(doc(db, "users", user.uid), {
              myLeagues: arrayUnion(leagueDoc.id)
          });

          await fetchMyLeagues();
          setMode('list');
          setJoinCode('');

      } catch (err) {
          console.error(err);
          setError("Failed to join league.");
      } finally {
          setLoading(false);
      }
  };


  const generateFixtures = (members) => {
      // Round Robin Algorithm
      // 1. Handle Odd Numbers
      const teamList = [...members];
      if (teamList.length % 2 !== 0) {
          teamList.push("AVERAGE"); // Ghost player
      }

      const numTeams = teamList.length;
      const rounds = numTeams - 1;
      const half = numTeams / 2;

      const fullSeasonFixtures = {};
      const teamMap = teamList.map((id, i) => ({ id, num: i })); // Map ID to initial position

      for (let round = 0; round < 38; round++) {
          // Calculate round-robin matchups for this cycle
          const roundFixtures = [];
          const cycleRound = round % rounds; // Repeat schedule every N-1 rounds
          
          // Logic for standard Berger table / Circle method
          // Lists rotate, index 0 stays fixed
          // We can calculate permutations or just simulate the rotation
          
          // Let's do simulation for the first 'rounds' set, then map cyclicly
          // Actually, simulating rotation is easiest
      }
      
      // Simpler approach: Pre-calculate the base schedule (N-1 rounds)
      const baseSchedule = [];
      let currentTeams = [...teamList];
      
      for (let r = 0; r < rounds; r++) {
          const roundMatches = [];
          for (let i = 0; i < half; i++) {
              const home = currentTeams[i];
              const away = currentTeams[numTeams - 1 - i];
              roundMatches.push({ player1: home, player2: away, score1: null, score2: null });
          }
          baseSchedule.push(roundMatches);
          
          // Rotate: Keep first fixed, move last to second
          // [0, 1, 2, 3] -> [0, 3, 1, 2]
          currentTeams.splice(1, 0, currentTeams.pop());
      }
      
      // Now map base schedule to 38 weeks
      for (let gw = 1; gw <= 38; gw++) {
          // cycle index
          const cycleIndex = (gw - 1) % rounds;
          // Swap home/away every full cycle to balance? Optional.
          // For now, just repeat.
          fullSeasonFixtures[gw] = baseSchedule[cycleIndex];
      }
      
      return fullSeasonFixtures;
  };

  const handleStartLeague = async (league) => {
      if (league.members.length < 2) {
          alert("Need at least 2 players to start!");
          return;
      }
      if (!confirm(`Start Season? This will lock the player list and generate fixtures for ${league.members.length} players.`)) return;
      
      setLoading(true);
      try {
          const fixtures = generateFixtures(league.members);
          const leagueRef = doc(db, "leagues", league.id);
          
          await updateDoc(leagueRef, {
              status: 'active',
              fixtures: fixtures,
              startedAt: new Date().toISOString()
          });
          
          await fetchMyLeagues(); // Refresh
          alert("Season Started! Fixtures generated.");
      } catch (e) {
          console.error(e);
          setError("Failed to start season.");
      } finally {
          setLoading(false);
      }
  };

  const handleRegenerateFixtures = async (league) => {
      const input = prompt("Enter the Gameweek to start the new schedule from (e.g. 4):");
      if (!input) return;
      const startGw = parseInt(input);
      if (isNaN(startGw) || startGw < 1 || startGw > 38) {
          alert("Invalid Gameweek");
          return;
      }

      if (!confirm(`Regenerate fixtures from Gameweek ${startGw} onwards? This will overwrite future matchups for the current ${league.members.length} members.`)) return;

      setLoading(true);
      try {
          // 1. Generate NEW base schedule for current members
          const members = league.members;
           // Round Robin Logic (Duplicated from generateFixtures to ensure consistent local scope usage)
          const teamList = [...members];
          if (teamList.length % 2 !== 0) {
              teamList.push("AVERAGE");
          }
          const numTeams = teamList.length;
          const rounds = numTeams - 1;
          const half = numTeams / 2;
          
          const baseSchedule = [];
          
          let currentTeams = [...teamList];
          for (let r = 0; r < rounds; r++) {
              const roundMatches = [];
              for (let i = 0; i < half; i++) {
                  const home = currentTeams[i];
                  const away = currentTeams[numTeams - 1 - i];
                  roundMatches.push({ player1: home, player2: away, score1: null, score2: null });
              }
              baseSchedule.push(roundMatches);
              currentTeams.splice(1, 0, currentTeams.pop());
          }

          // 2. Merge with existing fixtures
          const updatedFixtures = { ...league.fixtures };
          
          for (let gw = startGw; gw <= 38; gw++) {
              // We start the NEW cycle at startGw
              // So gw=startGw corresponds to index 0 of baseSchedule
              const cycleIndex = (gw - startGw) % rounds;
              updatedFixtures[gw] = baseSchedule[cycleIndex];
          }

          // 3. Save
          const leagueRef = doc(db, "leagues", league.id);
          await updateDoc(leagueRef, {
              fixtures: updatedFixtures
          });

          await fetchMyLeagues();
          alert(`Fixtures updated from GW ${startGw}!`);

      } catch (e) {
          console.error(e);
          setError("Failed to regenerate fixtures.");
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteLeague = async (leagueId, leagueName) => {
      if (!window.confirm(`Are you sure you want to delete "${leagueName}"? This cannot be undone.`)) {
          return;
      }

      setLoading(true);
      try {
          await deleteDoc(doc(db, "leagues", leagueId));
          // Note: We don't manually remove from every user's 'myLeagues' array immediately.
          // The fetchMyLeagues function handles missing docs gracefully (filters them out).
          await fetchMyLeagues();
          // If we were viewing this league, reset to Global
          onSelectLeague(null);
      } catch (err) {
          console.error("Error deleting league:", err);
          setError("Failed to delete league.");
      } finally {
          setLoading(false);
      }
  };

  if (loading && mode === 'list' && myLeagues.length === 0) return <div style={{color:'#aaa', marginTop:'20px'}}>Loading Leagues...</div>;

  return (
    <div className="leagues-container">
      {error && <div className="error-message">{error}</div>}

      {/* --- LIST VIEW --- */}
      {mode === 'list' && (
          <div className="leagues-list">
              <h3>Your Leagues</h3>
              
              {myLeagues.length === 0 ? (
                  <p style={{color:'#777'}}>You haven't joined any leagues yet.</p>
              ) : (
                  <div className="league-cards-grid">
                      {/* Global "Overall" dummy card to switch back */}
                      <div className="league-card" onClick={() => onSelectLeague(null)}>
                          <h4>🌍 Global League</h4>
                          <span className="league-code">Public</span>
                      </div>

                      {myLeagues.map(league => (
                          <div key={league.id} className="league-card" onClick={() => onSelectLeague(league)}>
                              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                                  <h4>{league.type === 'h2h' ? '⚔️' : '🏆'} {league.name}</h4>
                                  {league.type === 'h2h' && <span className="h2h-badge">H2H</span>}
                              </div>
                              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                                <span className="league-code">Code: {league.code}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(league.code);
                                        // Visual feedback could be improved but simple alert for now is reliable
                                        // or simple text change
                                        e.target.innerText = "✅";
                                        setTimeout(() => e.target.innerText = "📋", 1500);
                                    }}
                                    style={{
                                        background:'none', 
                                        border:'none', 
                                        cursor:'pointer', 
                                        fontSize:'1.2rem',
                                        padding:'0'
                                    }}
                                    title="Copy Code"
                                >
                                    📋
                                </button>
                              </div>
                              {league.adminId === user.uid && (
                                <button 
                                    className="delete-league-btn"
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent card click
                                        handleDeleteLeague(league.id, league.name);
                                    }}
                                >
                                    🗑️
                                </button>
                              )}
                              
                              {league.adminId === user.uid && league.status === 'recruiting' && league.type === 'h2h' && (
                                  <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartLeague(league);
                                    }}
                                    style={{
                                        width: '100%',
                                        marginTop: '10px',
                                        backgroundColor: '#2a9d8f',
                                        color: 'white',
                                        border: 'none',
                                        padding: '5px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                  >
                                      ▶️ Start Season
                                  </button>
                              )}

                              {league.adminId === user.uid && league.status === 'active' && league.type === 'h2h' && (
                                  <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRegenerateFixtures(league);
                                    }}
                                    style={{
                                        width: '100%',
                                        marginTop: '10px',
                                        backgroundColor: '#e9c46a',
                                        color: '#333',
                                        border: 'none',
                                        padding: '5px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                  >
                                      🔄 Regenerate Fixtures
                                  </button>
                              )}
                          </div>
                      ))}
                  </div>
              )}

              <div className="league-actions">
                  <button onClick={() => setMode('create')} className="secondary-button">Create League</button>
                  <button onClick={() => setMode('join')} className="secondary-button">Join League</button>
              </div>
          </div>
      )}

      {/* --- CREATE VIEW --- */}
      {mode === 'create' && (
          <div className="auth-card" style={{margin:'20px auto'}}>
              <h3>Create New League</h3>
              <form onSubmit={handleCreateLeague}>
                  <div className="input-group">
                      <label>League Name</label>
                      <input 
                        value={newLeagueName} 
                        onChange={e => setNewLeagueName(e.target.value)}
                        placeholder="e.g. Office Rivals"
                        maxLength={20}
                        required
                        autoFocus
                      />
                  </div>
                  
                  <div className="input-group">
                      <label>League Mode</label>
                      <div className="radio-group">
                          <label className={`radio-option ${leagueType === 'classic' ? 'selected' : ''}`}>
                              <input 
                                  type="radio" 
                                  name="leagueType" 
                                  value="classic" 
                                  checked={leagueType === 'classic'} 
                                  onChange={() => setLeagueType('classic')}
                              />
                              🏆 Classic
                              <span style={{fontSize:'0.8rem', display:'block', color:'#aaa'}}>Rank by Total Points</span>
                          </label>
                          <label className={`radio-option ${leagueType === 'h2h' ? 'selected' : ''}`}>
                              <input 
                                  type="radio" 
                                  name="leagueType" 
                                  value="h2h" 
                                  checked={leagueType === 'h2h'} 
                                  onChange={() => setLeagueType('h2h')}
                              />
                              ⚔️ Head-to-Head
                              <span style={{fontSize:'0.8rem', display:'block', color:'#aaa'}}>1v1 Matches (3pts Win)</span>
                          </label>
                      </div>
                  </div>

                  <button type="submit" className="auth-button primary" disabled={loading}>
                      {loading ? 'Creating...' : 'Create League'}
                  </button>
                  <button type="button" onClick={() => setMode('list')} className="auth-button google">
                      Cancel
                  </button>
              </form>
          </div>
      )}

      {/* --- JOIN VIEW --- */}
      {mode === 'join' && (
          <div className="auth-card" style={{margin:'20px auto'}}>
              <h3>Join a League</h3>
              <form onSubmit={handleJoinLeague}>
                  <div className="input-group">
                      <label>League Code</label>
                      <input 
                        value={joinCode} 
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="6-Character Code"
                        maxLength={8}
                        required
                        autoFocus
                      />
                  </div>
                  <button type="submit" className="auth-button primary" disabled={loading}>
                      {loading ? 'Joining...' : 'Join League'}
                  </button>
                  <button type="button" onClick={() => setMode('list')} className="auth-button google">
                      Cancel
                  </button>
              </form>
          </div>
      )}
    </div>
  );
}

export default LeaguesView;
