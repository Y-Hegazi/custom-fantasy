import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc } from "firebase/firestore";
import { LOCKOUT_BUFFER_MS } from './config';
import { calculatePredictionPoints } from './utils/oddsEngine';
import './App.css'; // Re-use modal/overlay styles

const getMatchOutcome = (homeScore, awayScore) => {
    if (homeScore > awayScore) return 'H';
    if (awayScore > homeScore) return 'A';
    return 'D';
};

function PlayerPredictionsModal({ isOpen, onClose, targetPlayerId, targetPlayerName, gameWeekId, matches }) {
    const [predictions, setPredictions] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !targetPlayerId || !gameWeekId) return;

        const fetchPredictions = async () => {
            setLoading(true);
            try {
                const predSnap = await getDoc(doc(db, "gameweeks", gameWeekId, "predictions", targetPlayerId));
                if (predSnap.exists()) {
                    setPredictions(predSnap.data().scores || {});
                } else {
                    setPredictions({});
                }
            } catch (e) {
                console.error("Failed to fetch player predictions", e);
            } finally {
                setLoading(false);
            }
        };

        fetchPredictions();
    }, [isOpen, targetPlayerId, gameWeekId]);

    if (!isOpen) return null;

    return (
        <div className="auth-overlay" onClick={onClose}>
            <div className="auth-card" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>{targetPlayerName}'s Picks</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                </div>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>Loading picks...</div>
                ) : (
                    <div className="predictions-list">
                        {matches.map(match => {
                            const isLocked = match.status === 'IN_PLAY' || match.status === 'PAUSED' || match.status === 'FINISHED' || Date.now() > (match.timestamp - LOCKOUT_BUFFER_MS);
                            const userPred = predictions[match.id];
                            
                            // Visual State
                            let statusColor = '#444'; // Default/Future
                            let resultText = '';
                            let points = 0;
                            let badgesText = '';

                            if (match.status === 'IN_PLAY' || match.status === 'PAUSED') statusColor = '#e67e22'; // Orange (Live)
                            if (match.status === 'FINISHED') statusColor = '#27ae60'; // Green (Done)

                            // Calculate Points using the engine (respects all multipliers)

                            if (isLocked && userPred && match.score.fullTime.home !== null) {
                                const scoreResult = calculatePredictionPoints(
                                    userPred.home,
                                    userPred.away,
                                    match.score.fullTime.home,
                                    match.score.fullTime.away,
                                    match.odds
                                );
                                points = scoreResult.totalPoints;
                                badgesText = scoreResult.badges.join(' ');

                                if (scoreResult.isExact) {
                                    resultText = `🎯 Exact (${points}pts)`;
                                } else if (scoreResult.isOutcome) {
                                    resultText = `✅ Result (${points}pt${points !== 1 ? 's' : ''})`;
                                } else {
                                    resultText = '❌ Miss';
                                }
                            }

                            return (
                                <div key={match.id} style={{
                                    backgroundColor: '#2a2a2a',
                                    borderRadius: '8px',
                                    marginBottom: '10px',
                                    padding: '10px',
                                    borderLeft: `5px solid ${statusColor}`
                                }}>
                                    {/* Match Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>
                                        <span>{match.date}</span>
                                        <span style={{ fontWeight: 'bold', color: statusColor === '#e67e22' ? '#e67e22' : '#aaa' }}>{match.status}</span>
                                    </div>

                                    {/* Teams */}
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '5px 0' }}>
                                        <div style={{ flex: 1, textAlign: 'right' }}>{match.homeTeam}</div>
                                        
                                        {/* Score / Time */}
                                        <div style={{ margin: '0 15px', fontWeight: 'bold', fontSize: '1.1rem', backgroundColor: '#111', padding: '5px 10px', borderRadius: '5px' }}>
                                            {match.status === 'SCHEDULED' || match.status === 'TIMED' ? 'VS' : `${match.score.fullTime.home ?? 0} - ${match.score.fullTime.away ?? 0}`}
                                        </div>

                                        <div style={{ flex: 1, textAlign: 'left' }}>{match.awayTeam}</div>
                                    </div>

                                    {/* Prediction Section */}
                                    <div style={{ 
                                        marginTop: '10px', 
                                        paddingTop: '10px', 
                                        borderTop: '1px solid #444', 
                                        display: 'flex', 
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ color: '#bbb' }}>Prediction:</span>
                                        
                                        {isLocked ? (
                                            userPred ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'white' }}>
                                                        {userPred.home} - {userPred.away}
                                                    </span>
                                                    {match.status === 'FINISHED' && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                            <span style={{ fontSize: '0.8rem', color: resultText.startsWith('🎯') ? '#f1c40f' : (resultText.startsWith('✅') ? '#2ecc71' : '#e74c3c') }}>
                                                                {resultText}
                                                            </span>
                                                            {badgesText && (
                                                                <span style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 'bold' }}>
                                                                    {badgesText}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#777', fontStyle: 'italic' }}>No prediction</span>
                                            )
                                        ) : (
                                            <span style={{ color: '#555', fontStyle: 'italic' }}>🔒 Hidden until kickoff</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <button onClick={onClose} className="auth-button google" style={{ width: '100%' }}>Close</button>
                </div>
            </div>
        </div>
    );
}

export default PlayerPredictionsModal;
