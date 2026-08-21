import { SEASON } from './config';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { calculatePredictionPoints, generateMatchOdds } from './utils/oddsEngine';

interface H2HLeaderboardProps {
  league: any;
  currentRound: string | number;
}

function H2HLeaderboard({ league, currentRound }: H2HLeaderboardProps) {
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const calculateStandings = async () => {
      if (!league) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        // 1. Fetch league members
        const { data: memberRows } = await supabase
          .from('league_members')
          .select('user_id')
          .eq('league_id', league.id);

        const memberIds = (memberRows || []).map(r => r.user_id);
        
        // 2. Fetch profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name');

        const userNames: Record<string, string> = { AVERAGE: '👻 Average Bot' };
        (profiles || []).forEach(p => {
          userNames[p.id] = p.display_name || 'Manager';
        });

        const records: Record<string, any> = {};
        memberIds.forEach(uid => {
          records[uid] = {
            id: uid,
            name: userNames[uid] || 'Manager',
            played: 0,
            w: 0,
            d: 0,
            l: 0,
            pts: 0,
            pf: 0
          };
        });

        records['AVERAGE'] = { id: 'AVERAGE', name: '👻 Average Bot', played: 0, w: 0, d: 0, l: 0, pts: 0, pf: 0 };

        const currentGwNum = parseInt(String(currentRound), 10) || 1;

        // Process past gameweeks
        for (let r = 1; r < currentGwNum; r++) {
          const { data: cacheRow } = await supabase
            .from('matches_cache')
            .select('matches')
            .eq('id', `${SEASON}_week_${r}`)
            .single();

          const cachedMatches = cacheRow?.matches || [];
          if (cachedMatches.length === 0) continue;

          const matchResults: Record<string, any> = {};
          cachedMatches.forEach((match: any) => {
            if (match.status === 'FINISHED' && match.score?.fullTime?.home !== null) {
              matchResults[String(match.id)] = {
                home: match.score.fullTime.home,
                away: match.score.fullTime.away,
                odds: match.odds || generateMatchOdds(match.homeTeam?.name || '', match.awayTeam?.name || '', String(match.id))
              };
            }
          });

          // Fetch predictions for this round
          const { data: preds } = await supabase
            .from('predictions')
            .select('*')
            .eq('season', SEASON)
            .eq('gameweek', r);

          const roundScores: Record<string, number> = {};
          let totalScore = 0;
          let count = 0;

          (preds || []).forEach((pred: any) => {
            const actual = matchResults[String(pred.match_id)];
            if (actual && pred.home_score !== null && pred.away_score !== null) {
              const res = calculatePredictionPoints(pred.home_score, pred.away_score, actual.home, actual.away, actual.odds);
              roundScores[pred.user_id] = (roundScores[pred.user_id] || 0) + res.totalPoints;
            }
          });

          memberIds.forEach(uid => {
            const s = roundScores[uid] || 0;
            totalScore += s;
            count++;
          });

          roundScores['AVERAGE'] = count > 0 ? Math.round(totalScore / count) : 0;

          // Process fixtures for this round if exists
          const matchups = league.fixtures ? league.fixtures[String(r)] || [] : [];
          matchups.forEach((match: any) => {
            const p1 = match.player1;
            const p2 = match.player2;
            const score1 = roundScores[p1] !== undefined ? roundScores[p1] : 0;
            const score2 = roundScores[p2] !== undefined ? roundScores[p2] : 0;

            if (records[p1]) {
              records[p1].played++;
              records[p1].pf += score1;
              if (score1 > score2) { records[p1].w++; records[p1].pts += 3; }
              else if (score1 === score2) { records[p1].d++; records[p1].pts += 1; }
              else { records[p1].l++; }
            }

            if (records[p2]) {
              records[p2].played++;
              records[p2].pf += score2;
              if (score2 > score1) { records[p2].w++; records[p2].pts += 3; }
              else if (score2 === score1) { records[p2].d++; records[p2].pts += 1; }
              else { records[p2].l++; }
            }
          });
        }

        const sorted = Object.values(records)
          .filter(r => r.id !== 'AVERAGE' || r.played > 0)
          .sort((a, b) => b.pts - a.pts || b.pf - a.pf);

        setStandings(sorted);
      } catch (e: any) {
        console.error("H2H calculation error:", e);
        setError("Failed to calculate standings.");
      } finally {
        setLoading(false);
      }
    };

    calculateStandings();
  }, [league, currentRound]);

  if (loading) {
    return <div className="loading-container"><h3>Calculating Head-to-Head Table...</h3></div>;
  }

  return (
    <div className="h2h-table-container">
      <h3>⚔️ Head-to-Head Standings</h3>
      {error && <p className="error-message">{error}</p>}
      
      {standings.length > 0 ? (
        <table className="leaderboard-table h2h-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Manager</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>PF</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, idx) => (
              <tr key={team.id}>
                <td>{idx + 1}</td>
                <td>{team.name}</td>
                <td>{team.played}</td>
                <td>{team.w}</td>
                <td>{team.d}</td>
                <td>{team.l}</td>
                <td>{team.pf}</td>
                <td className="font-bold text-blue-400">{team.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No matches completed yet in this season schedule.</p>
      )}
    </div>
  );
}

export default H2HLeaderboard;
