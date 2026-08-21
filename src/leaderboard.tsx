import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import PlayerPredictionsModal from './PlayerPredictionsModal';
import { calculatePredictionPoints, generateMatchOdds } from './utils/oddsEngine';

interface GameweekLeaderboardProps {
  gameWeekId?: string | null;
  currentRound?: string | number | null;
  season?: string;
  leagueId?: string | null;
}

function GameweekLeaderboard({ gameWeekId, currentRound, season = '2026', leagueId }: GameweekLeaderboardProps) {
  const [players, setPlayers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  
  // Modal State
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [matchesData, setMatchesData] = useState<any[]>([]);

  useEffect(() => {
    const calculateAllScores = async () => {
      if (!currentRound) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError('');
      setStatusMessage('');
      
      try {
        const gwNum = Number(currentRound);

        // 1. Fetch League Members if viewing private league
        let allowedUserIds: string[] | null = null;
        if (leagueId) {
          const { data: members } = await supabase
            .from('league_members')
            .select('user_id')
            .eq('league_id', leagueId);
          
          if (members) {
            allowedUserIds = members.map(m => m.user_id);
          }
        }

        // 2. Fetch Match Cache for this gameweek
        const { data: cacheRow } = await supabase
          .from('matches_cache')
          .select('matches')
          .eq('id', `${season}_week_${gwNum}`)
          .single();

        const cachedMatches = cacheRow?.matches || [];
        setMatchesData(cachedMatches);

        const matchResults: Record<string, { home: number; away: number; odds?: any }> = {};
        cachedMatches.forEach((match: any) => {
          if (match.status === 'FINISHED' && match.score?.fullTime?.home !== null && match.score?.fullTime?.away !== null) {
            matchResults[String(match.id)] = {
              home: Number(match.score.fullTime.home),
              away: Number(match.score.fullTime.away),
              odds: match.odds || generateMatchOdds(match.homeTeam?.name || '', match.awayTeam?.name || '', String(match.id))
            };
          }
        });

        // 3. Fetch Predictions for this gameweek
        let predQuery = supabase
          .from('predictions')
          .select('id, user_id, match_id, home_score, away_score, points')
          .eq('season', season)
          .eq('gameweek', gwNum);

        if (allowedUserIds && allowedUserIds.length > 0) {
          predQuery = predQuery.in('user_id', allowedUserIds);
        }

        const { data: predictions, error: pErr } = await predQuery;
        if (pErr) console.warn("Supabase predictions query:", pErr);

        // 4. Fetch Profiles for display names
        const { data: profiles } = await supabase.from('profiles').select('id, display_name');
        const nameMap: Record<string, string> = {};
        (profiles || []).forEach(p => {
          nameMap[p.id] = p.display_name || 'Manager';
        });

        // 5. Group by user and calculate gameweek score
        const userScores: Record<string, { totalPoints: number; exact: number; outcome: number; bonus: number }> = {};
        
        (predictions || []).forEach(pred => {
          const uid = pred.user_id;
          if (!userScores[uid]) {
            userScores[uid] = { totalPoints: 0, exact: 0, outcome: 0, bonus: 0 };
          }

          const result = matchResults[String(pred.match_id)];
          if (result && pred.home_score !== null && pred.away_score !== null) {
            const res = calculatePredictionPoints(
              pred.home_score,
              pred.away_score,
              result.home,
              result.away,
              result.odds
            );
            userScores[uid].totalPoints += res.totalPoints;
            if (res.isExact) userScores[uid].exact++;
            if (res.isOutcome && !res.isExact) userScores[uid].outcome++;
            if (res.multiplier > 1) userScores[uid].bonus++;
          }
        });

        const playersList = Object.entries(userScores).map(([uid, stats]) => ({
          id: uid,
          name: nameMap[uid] || 'Manager',
          points: stats.totalPoints,
          details: `(${stats.exact} Exact, ${stats.outcome} Outcome${stats.bonus > 0 ? `, ⚡${stats.bonus} Bonus` : ''})`
        }));

        playersList.sort((a, b) => b.points - a.points);
        setPlayers(playersList);

      } catch (err: any) {
        console.error("Leaderboard calculation error:", err);
        setError("Could not load leaderboard data.");
      } finally {
        setIsLoading(false);
      }
    };

    calculateAllScores();
  }, [gameWeekId, currentRound, season, leagueId]);

  if (isLoading) {
    return <div className="loading-container"><h3>Calculating Gameweek Scores...</h3></div>;
  }

  return (
    <div className="leaderboard-container">
      <h3>Gameweek {currentRound || ''} Leaderboard</h3>
      {error && <p className="error-message">{error}</p>}
      {statusMessage && <div className="status-message">{statusMessage}</div>}
      
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
                <td className="font-bold text-blue-400">{player.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : ( !error && <p>No predictions submitted for this gameweek yet.</p> )}
      
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
