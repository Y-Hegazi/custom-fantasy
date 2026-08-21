import { useState, useEffect } from 'react';
import { supabase } from './supabase';

interface OverallLeaderboardProps {
  leagueId?: string | null;
}

function OverallLeaderboard({ leagueId }: OverallLeaderboardProps) {
  const [players, setPlayers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setIsLoading(true);
      try {
        let allowedUserIds: string[] | null = null;

        if (leagueId) {
          const { data: members } = await supabase
            .from('league_members')
            .select('user_id')
            .eq('league_id', leagueId);
          
          if (members && members.length > 0) {
            allowedUserIds = members.map(m => m.user_id);
          } else {
            setPlayers([]);
            setIsLoading(false);
            return;
          }
        }

        let query = supabase
          .from('profiles')
          .select('id, display_name, total_score, avatar_url')
          .order('total_score', { ascending: false });

        if (allowedUserIds && allowedUserIds.length > 0) {
          query = query.in('id', allowedUserIds);
        }

        const { data: profiles, error } = await query;
        if (error) throw error;

        const list = (profiles || []).map(p => ({
          id: p.id,
          name: p.display_name || 'Manager',
          points: p.total_score || 0,
          avatar: p.avatar_url,
        }));

        setPlayers(list);
      } catch (err) {
        console.error("Error loading overall leaderboard:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();

    // Subscribe to realtime profile score changes
    const channel = supabase
      .channel('public:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchLeaderboard();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  return (
    <div className="leaderboard-card">
      <div className="leaderboard-header">
        <h2>Overall Season Standings 🏆</h2>
        <span className="live-pill">LIVE SYNC</span>
      </div>

      {isLoading ? (
        <div className="leaderboard-loading">
          <div className="spinner"></div>
          <p>Loading table standings...</p>
        </div>
      ) : players.length === 0 ? (
        <div className="leaderboard-empty">
          <p>No manager scores recorded yet. Submit predictions to join the race!</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Rank</th>
                <th>Manager</th>
                <th style={{ textAlign: 'right', width: '100px' }}>Total Pts</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => {
                let rankBadge = `${index + 1}`;
                let rankClass = '';
                if (index === 0) {
                  rankBadge = '🥇 1';
                  rankClass = 'rank-gold';
                } else if (index === 1) {
                  rankBadge = '🥈 2';
                  rankClass = 'rank-silver';
                } else if (index === 2) {
                  rankBadge = '🥉 3';
                  rankClass = 'rank-bronze';
                }

                return (
                  <tr key={player.id} className={rankClass}>
                    <td className="rank-cell font-mono font-bold">{rankBadge}</td>
                    <td className="manager-cell">
                      <div className="manager-info">
                        <span className="font-semibold text-white">{player.name}</span>
                      </div>
                    </td>
                    <td className="points-cell text-right font-extrabold text-blue-400">
                      {player.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default OverallLeaderboard;
