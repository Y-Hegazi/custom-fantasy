import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { LOCKOUT_BUFFER_MS } from './config';
import { calculatePredictionPoints } from './utils/oddsEngine';
import './App.css';

interface PlayerPredictionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlayerId?: string | null;
  targetPlayerName?: string | null;
  gameWeekId?: string | null;
  matches: any[];
}

function PlayerPredictionsModal({ isOpen, onClose, targetPlayerId, targetPlayerName, matches }: PlayerPredictionsModalProps) {
  const [predictions, setPredictions] = useState<Record<string, { home: any; away: any }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !targetPlayerId) return;

    const fetchPredictions = async () => {
      setLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from('predictions')
          .select('match_id, home_score, away_score')
          .eq('user_id', targetPlayerId);

        if (error) throw error;

        const predMap: Record<string, { home: any; away: any }> = {};
        (rows || []).forEach(r => {
          predMap[String(r.match_id)] = {
            home: r.home_score,
            away: r.away_score
          };
        });

        setPredictions(predMap);
      } catch (e) {
        console.error("Failed to fetch player predictions from Supabase", e);
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
  }, [isOpen, targetPlayerId]);

  if (!isOpen) return null;

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-card" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{targetPlayerName || 'Manager'}'s Picks</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        </div>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading picks...</div>
        ) : (
          <div className="predictions-list">
            {matches.map(match => {
              const isLocked = match.status === 'IN_PLAY' || match.status === 'PAUSED' || match.status === 'FINISHED' || Date.now() > (match.timestamp - LOCKOUT_BUFFER_MS);
              const userPred = predictions[String(match.id)];
              
              let statusColor = '#444';
              let resultText = '';

              if (userPred && userPred.home !== null && userPred.away !== null && userPred.home !== undefined) {
                if (match.status === 'FINISHED' && match.score?.fullTime?.home !== null) {
                  const res = calculatePredictionPoints(
                    userPred.home,
                    userPred.away,
                    match.score.fullTime.home,
                    match.score.fullTime.away,
                    match.odds
                  );
                  if (res.isExact) {
                    statusColor = '#27ae60';
                    resultText = `🎯 Exact Score (${res.totalPoints} pts)`;
                  } else if (res.isOutcome) {
                    statusColor = '#2980b9';
                    resultText = `✅ Correct Outcome (${res.totalPoints} pts)`;
                  } else {
                    statusColor = '#c0392b';
                    resultText = '❌ Incorrect (0 pts)';
                  }
                } else if (isLocked) {
                  resultText = '🔒 Live Match';
                }
              }

              return (
                <div key={match.id} className="prediction-row" style={{ borderLeft: `4px solid ${statusColor}`, marginBottom: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#888', marginBottom: '4px' }}>
                    <span>{match.homeTeam} vs {match.awayTeam}</span>
                    <span>{resultText}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold' }}>
                      Pick: {isLocked ? (userPred && userPred.home !== null && userPred.home !== undefined ? `${userPred.home} - ${userPred.away}` : 'No Pick') : '🔒 Hidden until kickoff'}
                    </div>
                    {match.status === 'FINISHED' && (
                      <div style={{ fontSize: '0.85rem', color: '#ffd166' }}>
                        Actual: {match.score?.fullTime?.home} - {match.score?.fullTime?.away}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default PlayerPredictionsModal;
