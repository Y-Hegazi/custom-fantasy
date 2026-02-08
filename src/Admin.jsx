import { useState } from 'react';
import { db } from './firebase.js'; // Ensure db is imported if not already standard (It wasn't in original file)
import { doc, getDoc, updateDoc, setDoc, collection, getDocs, writeBatch } from "firebase/firestore";
import { processMatchUpdate } from './utils/dataUpdater.js';

function Admin() {
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Manual Score Correction State
  const [correctionGW, setCorrectionGW] = useState('25');
  const [correctionMatches, setCorrectionMatches] = useState([]);
  const [editingMatch, setEditingMatch] = useState(null);
  const [editHome, setEditHome] = useState('');
  const [editAway, setEditAway] = useState('');

  const handleUpdateAllData = async () => {
    setIsLoading(true);
    setStatus('Starting update...');
    try {
        await processMatchUpdate(setStatus);
    } catch (e) {
        setStatus(`Error: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  // --- MANUAL SCORE CORRECTION ---
  const loadMatchesForCorrection = async () => {
    setIsLoading(true);
    setStatus(`Loading matches for Week ${correctionGW}...`);
    try {
      const cacheRef = doc(db, "matches_cache", `week_${correctionGW}`);
      const cacheSnap = await getDoc(cacheRef);
      
      if (cacheSnap.exists()) {
        setCorrectionMatches(cacheSnap.data().matches || []);
        setStatus(`Loaded ${cacheSnap.data().matches?.length || 0} matches for Week ${correctionGW}`);
      } else {
        setCorrectionMatches([]);
        setStatus(`No data found for Week ${correctionGW}`);
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const saveScoreCorrection = async (matchId) => {
    setIsLoading(true);
    setStatus(`Saving correction for match ${matchId}...`);
    try {
      const homeScore = parseInt(editHome);
      const awayScore = parseInt(editAway);
      
      // 1. Save to persistent overrides collection (survives API updates)
      const overrideRef = doc(db, "system", "score_overrides");
      const overrideSnap = await getDoc(overrideRef);
      const existingOverrides = overrideSnap.exists() ? (overrideSnap.data().overrides || {}) : {};
      
      const overrideKey = `${correctionGW}_${matchId}`;
      const updatedOverrides = {
        ...existingOverrides,
        [overrideKey]: {
          home: homeScore,
          away: awayScore,
          matchId: matchId,
          gameweek: correctionGW,
          updatedAt: new Date().toISOString()
        }
      };
      
      await setDoc(overrideRef, { overrides: updatedOverrides }, { merge: true });
      
      // 2. Also update matches_cache immediately for instant UI update
      const cacheRef = doc(db, "matches_cache", `week_${correctionGW}`);
      const updatedMatches = correctionMatches.map(m => {
        if (m.id === matchId) {
          return {
            ...m,
            score: {
              fullTime: {
                home: homeScore,
                away: awayScore
              }
            },
            hasManualOverride: true
          };
        }
        return m;
      });
      
      await updateDoc(cacheRef, { matches: updatedMatches, lastUpdated: new Date().toISOString() });
      setCorrectionMatches(updatedMatches);
      setEditingMatch(null);
      
      const match = correctionMatches.find(m => m.id === matchId);
      setStatus(`✅ Score corrected & saved! ${match?.homeTeam} ${homeScore}-${awayScore} ${match?.awayTeam} (Override will persist across API updates)`);
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- SIMULATION TOOLS ---
  const simulateGameweekFinish = async () => {
      // 1. Identify current gameweek (Hardcoded to 4 per request, or fetch from system)
      // For testing specifically "leaderboards 4", we will target Week 4.
      const targetGW = "4"; 
      
      setIsLoading(true);
      setStatus(`Simulating Week ${targetGW} finish...`);
      
      try {
          const cacheRef = doc(db, "matches_cache", `week_${targetGW}`);
          const cacheSnap = await getDoc(cacheRef);
          
          if (!cacheSnap.exists()) {
              throw new Error("No match data found for Week 4. Please run 'Update All Data' first.");
          }

          const matches = cacheSnap.data().matches || [];
          // Force FINISH all matches with random scores
          const updatedMatches = matches.map(m => ({
              ...m,
              status: 'FINISHED',
              score: {
                  fullTime: {
                      home: Math.floor(Math.random() * 4), 
                      away: Math.floor(Math.random() * 4) 
                  }
              }
          }));

          await updateDoc(cacheRef, { matches: updatedMatches });
          setStatus(`Simulated Week ${targetGW} Finished! Go to Leaderboard to see auto-finalize.`);

      } catch (e) {
          console.error(e);
          setStatus("Simulation failed: " + e.message);
      } finally {
          setIsLoading(false);
      }
  };

  const openGameweekForPredictions = async () => {
      const targetGW = "4";
      setIsLoading(true);
      setStatus(`Opening Week ${targetGW} for predictions...`);

      try {
          const cacheRef = doc(db, "matches_cache", `week_${targetGW}`);
          const cacheSnap = await getDoc(cacheRef);
          
          if (!cacheSnap.exists()) {
              throw new Error("No match data found.");
          }

          const matches = cacheSnap.data().matches || [];
          // Force TIMED, shift time to tomorrow (unlock inputs), clear scores
          const tomorrow = new Date().getTime() + (24 * 60 * 60 * 1000); 

          const updatedMatches = matches.map(m => ({
              ...m,
              status: 'TIMED',
              timestamp: tomorrow,
              score: { fullTime: { home: null, away: null } }
          }));

          await updateDoc(cacheRef, { matches: updatedMatches });
          setStatus(`Week ${targetGW} is OPEN! Kickoff set to tomorrow.`);

      } catch (e) {
          console.error(e);
          setStatus("Failed to open week: " + e.message);
      } finally {
          setIsLoading(false);
      }
  };


  const simulateGameweekLive = async () => {
      const targetGW = "4";
      setIsLoading(true);
      setStatus(`Simulating Week ${targetGW} LIVE...`);

      try {
          const cacheRef = doc(db, "matches_cache", `week_${targetGW}`);
          const cacheSnap = await getDoc(cacheRef);
          
          if (!cacheSnap.exists()) {
              throw new Error("No match data found.");
          }

          const matches = cacheSnap.data().matches || [];
          // Force IN_PLAY, shift time to 1 hour ago (to lock Inputs), set random scores
          const oneHourAgo = new Date().getTime() - (60 * 60 * 1000); // 1 hour ago

          const updatedMatches = matches.map(m => ({
              ...m,
              status: 'IN_PLAY',
              timestamp: oneHourAgo, // Ensure it's locked
              score: {
                  fullTime: {
                      home: Math.floor(Math.random() * 2), 
                      away: Math.floor(Math.random() * 2) 
                  }
              }
          }));

          await updateDoc(cacheRef, { matches: updatedMatches });
          setStatus(`Simulated Week ${targetGW} LIVE! Matches are now locked and showing scores.`);

      } catch (e) {
          console.error(e);
          setStatus("Simulation failed: " + e.message);
      } finally {
          setIsLoading(false);
      }
  };

  const resetGameweek = async () => {
      const targetGW = "4";
      setIsLoading(true);
      setStatus(`Resetting Week ${targetGW}...`);

      try {
          // 1. Reset Match Cache
          const cacheRef = doc(db, "matches_cache", `week_${targetGW}`);
          const cacheSnap = await getDoc(cacheRef);
          
          if (cacheSnap.exists()) {
              const matches = cacheSnap.data().matches || [];
              const resetMatches = matches.map(m => ({
                  ...m,
                  status: 'TIMED', // Revert to scheduled state
                  score: { fullTime: { home: null, away: null } }
              }));
              await updateDoc(cacheRef, { matches: resetMatches });
          }

          // 2. Reset Gameweek Finalization Status (CRITICAL FIX)
          // We need to reset the 'isFinalized' flag so auto-calculation can run again
          // The ID logic in Leaderboard uses `gameWeekId` which comes from App state likely "gameweek_4"
          const gwDocId = `gameweek_${targetGW}`;
          const gwRef = doc(db, "gameweeks", gwDocId);
          await setDoc(gwRef, { isFinalized: false }, { merge: true }); // Force un-finalize

          setStatus(`Week ${targetGW} fully reset (Matches & Finalization Status). Predictions remain.`);

      } catch (e) {
          setStatus("Reset failed: " + e.message);
      } finally {
          setIsLoading(false);
      }
  };

  const recalculateScores = async () => {
    if (!confirm("This will recalculate ALL user scores from scratch based on finalized gameweeks. Continue?")) return;
    
    setIsLoading(true);
    setStatus("Starting heavy recalculation...");
    
    try {
        // 1. Fetch all users (to map ID -> Score)
        const usersSnap = await getDocs(collection(db, "users"));
        const userScores = {};
        usersSnap.forEach(doc => userScores[doc.id] = 0);

        // 2. Fetch all gameweeks
        const gwSnap = await getDocs(collection(db, "gameweeks"));
        
        for (const gwDoc of gwSnap.docs) {
            if (!gwDoc.data().isFinalized) continue;
            
            const gwId = gwDoc.id; // e.g. "gameweek_4"
            // Extract number from ID (gameweek_4 -> 4) or use a field if available
            // Assuming ID format "gameweek_N"
            const gwNum = gwId.split('_')[1]; 
            if (!gwNum) continue;

            const predSnap = await getDocs(collection(db, "gameweeks", gwId, "predictions"));
            const cacheSnap = await getDoc(doc(db, "matches_cache", `week_${gwNum}`));
            
            if (!cacheSnap.exists()) continue;
            const matches = cacheSnap.data().matches || [];
            
            // Build Results Map
            const results = {};
            matches.forEach(m => {
                if (m.status === 'FINISHED' && m.score.fullTime.home !== null) {
                    results[String(m.id)] = { home: m.score.fullTime.home, away: m.score.fullTime.away };
                }
            });

            // Tally Points
            predSnap.forEach(predDoc => {
                const uid = predDoc.id;
                const scores = predDoc.data().scores || {};
                let points = 0;
                
                for (const mid in scores) {
                    const p = scores[mid];
                    const r = results[mid];
                    if (p && r) {
                        const ph = parseInt(p.home);
                        const pa = parseInt(p.away);
                        // Exact
                        if (ph === r.home && pa === r.away) points += 3;
                        // Correct Result
                        else if (
                            (ph > pa && r.home > r.away) ||
                            (ph < pa && r.home < r.away) ||
                            (ph === pa && r.home === r.away)
                        ) points += 1;
                    }
                }
                
                if (userScores[uid] !== undefined) {
                    userScores[uid] += points;
                }
            });
        }

        // 3. Write back to Users
        const batch = writeBatch(db); // Note: batch limit is 500
        let count = 0;
        for (const uid in userScores) {
            const ref = doc(db, "users", uid);
            batch.update(ref, { totalScore: userScores[uid] });
            count++;
        }
        await batch.commit();
        
        setStatus(`Recalculated scores for ${count} users.`);

    } catch (e) {
        console.error(e);
        setStatus("Recalculation error: " + e.message);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', color: 'white', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Admin Dashboard</h1>
      <p>Click below to force a data update manually.</p>
      
      <button 
        onClick={handleUpdateAllData}
        disabled={isLoading}
        style={{
          padding: '1rem 2rem',
          fontSize: '1.2rem',
          backgroundColor: isLoading ? '#555' : '#e63946',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: isLoading ? 'default' : 'pointer',
          marginTop: '1rem',
          width: '100%'
        }}
      >
        {isLoading ? 'Updating...' : 'Update All Match Data'}
      </button>

      {/* --- MANUAL SCORE CORRECTION UI --- */}
      <div style={{marginTop:'2rem', borderTop:'1px solid #2a9d8f', paddingTop:'1.5rem', background:'linear-gradient(180deg, rgba(42,157,143,0.1) 0%, transparent 100%)', borderRadius:'8px', padding:'1.5rem'}}>
          <h3 style={{color:'#2a9d8f', marginBottom:'0.5rem'}}>✏️ Manual Score Correction</h3>
          <p style={{color:'#aaa', fontSize:'0.9rem', marginBottom:'1rem'}}>Fix incorrect scores when the API hasn't updated yet (e.g., disallowed goals).</p>
          
          <div style={{display:'flex', gap:'1rem', marginBottom:'1rem'}}>
              <select 
                value={correctionGW} 
                onChange={(e) => setCorrectionGW(e.target.value)}
                style={{flex:1, padding:'0.5rem', borderRadius:'4px', background:'#333', color:'white', border:'1px solid #555'}}
              >
                  {[...Array(38)].map((_, i) => (
                      <option key={i+1} value={String(i+1)}>Gameweek {i+1}</option>
                  ))}
              </select>
              <button 
                onClick={loadMatchesForCorrection}
                disabled={isLoading}
                style={{padding:'0.5rem 1rem', background:'#2a9d8f', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}
              >
                  Load Matches
              </button>
          </div>
          
          {correctionMatches.length > 0 && (
              <div style={{maxHeight:'300px', overflowY:'auto', background:'#1a1a1a', borderRadius:'6px', padding:'0.5rem'}}>
                  {correctionMatches.map(match => (
                      <div key={match.id} style={{
                          display:'flex', 
                          alignItems:'center', 
                          justifyContent:'space-between',
                          padding:'0.75rem',
                          borderBottom:'1px solid #333',
                          gap:'0.5rem'
                      }}>
                          {editingMatch === match.id ? (
                              <>
                                  <span style={{fontSize:'0.85rem', flex:1}}>{match.homeTeam}</span>
                                  <input 
                                    type="number" 
                                    value={editHome}
                                    onChange={(e) => setEditHome(e.target.value)}
                                    style={{width:'40px', textAlign:'center', padding:'0.3rem', borderRadius:'4px', border:'1px solid #2a9d8f', background:'#222', color:'white'}}
                                  />
                                  <span>-</span>
                                  <input 
                                    type="number"
                                    value={editAway}
                                    onChange={(e) => setEditAway(e.target.value)}
                                    style={{width:'40px', textAlign:'center', padding:'0.3rem', borderRadius:'4px', border:'1px solid #2a9d8f', background:'#222', color:'white'}}
                                  />
                                  <span style={{fontSize:'0.85rem', flex:1, textAlign:'right'}}>{match.awayTeam}</span>
                                  <button 
                                    onClick={() => saveScoreCorrection(match.id)}
                                    disabled={isLoading}
                                    style={{padding:'0.3rem 0.6rem', background:'#27ae60', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem'}}
                                  >
                                    Save
                                  </button>
                                  <button 
                                    onClick={() => setEditingMatch(null)}
                                    style={{padding:'0.3rem 0.6rem', background:'#555', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem'}}
                                  >
                                    Cancel
                                  </button>
                              </>
                          ) : (
                              <>
                                  <span style={{fontSize:'0.85rem', flex:1}}>{match.homeTeam}</span>
                                  <span style={{
                                      fontWeight:'bold', 
                                      color: match.status === 'FINISHED' ? '#27ae60' : '#aaa',
                                      minWidth:'50px',
                                      textAlign:'center'
                                  }}>
                                      {match.score?.fullTime?.home ?? '-'} - {match.score?.fullTime?.away ?? '-'}
                                  </span>
                                  <span style={{fontSize:'0.85rem', flex:1, textAlign:'right'}}>{match.awayTeam}</span>
                                  <button 
                                    onClick={() => {
                                        setEditingMatch(match.id);
                                        setEditHome(String(match.score?.fullTime?.home ?? ''));
                                        setEditAway(String(match.score?.fullTime?.away ?? ''));
                                    }}
                                    style={{padding:'0.3rem 0.6rem', background:'#e9c46a', color:'#333', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'bold'}}
                                  >
                                    Edit
                                  </button>
                              </>
                          )}
                      </div>
                  ))}
              </div>
          )}
      </div>

      <div style={{marginTop:'3rem', borderTop:'1px solid #444', paddingTop:'2rem'}}>
          <h3>🧪 Verification / Testing Tools</h3>
          <p style={{color:'#aaa', fontSize:'0.9rem'}}>Force match states to test automations.</p>
          
          <div style={{display:'flex', gap:'1rem', marginTop:'1rem'}}>
              <button 
                onClick={openGameweekForPredictions}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '1rem',
                  backgroundColor: '#4cc9f0', // Light Blue
                  color: '#333',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                  Open Week 4 (Future)
              </button>
          </div>

          <div style={{display:'flex', gap:'1rem', marginTop:'1rem'}}>
              <button 
                onClick={simulateGameweekFinish}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '1rem',
                  backgroundColor: '#2a9d8f',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                  Simulate Week 4 FINISH
              </button>

              <button 
                onClick={simulateGameweekLive}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '1rem',
                  backgroundColor: '#e9c46a',
                  color: '#333',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                  Simulate Week 4 LIVE
              </button>

              <button 
                onClick={resetGameweek}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '1rem',
                  backgroundColor: '#e76f51',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                  Reset Week 4
              </button>
          </div>
          
          <div style={{marginTop:'1rem'}}>
             <button
               onClick={recalculateScores}
               disabled={isLoading}
               style={{
                   width: '100%',
                   padding: '1rem',
                   backgroundColor: '#6c757d',
                   color: 'white',
                   border: 'none',
                   borderRadius: '6px',
                   cursor: 'pointer',
                   fontWeight: 'bold',
                   borderTop: '2px solid #555'
               }}
             >
                 🔄 Recalculate User Scores (Fix Zero Points)
             </button>
          </div>

          <div style={{marginTop:'1rem'}}>
             <button
               onClick={async () => {
                   if (!confirm("⚠️ DANGER: This will set ALL user scores to 0. Cannot be undone.")) return;
                   setIsLoading(true);
                   try {
                       const batch = writeBatch(db);
                       
                       // 1. Reset Users
                       const usersSnap = await getDocs(collection(db, "users"));
                       usersSnap.forEach(doc => batch.update(doc.ref, { totalScore: 0 }));
                       
                       // 2. Reset Gameweeks (Un-finalize all)
                       const gwSnap = await getDocs(collection(db, "gameweeks"));
                       gwSnap.forEach(doc => batch.update(doc.ref, { isFinalized: false }));

                       await batch.commit();
                       setStatus("Season reset! Scores = 0, Gameweeks = Pending.");
                   } catch(e) {
                       setStatus("Error: " + e.message);
                   } finally {
                       setIsLoading(false);
                   }
               }}
               disabled={isLoading}
               style={{
                   width: '100%',
                   padding: '1rem',
                   backgroundColor: '#d90429', // Dark red
                   color: 'white',
                   border: 'none',
                   borderRadius: '6px',
                   cursor: 'pointer',
                   fontWeight: 'bold',
                   marginTop: '1rem'
               }}
             >
                 ☢️ RESET SEASON SCORES (Set to 0)
             </button>
          </div>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#222', borderRadius: '8px', minHeight: '100px' }}>
        <strong>Status Log:</strong>
        <p>{status}</p>
      </div>
    </div>
  );
}

export default Admin;
