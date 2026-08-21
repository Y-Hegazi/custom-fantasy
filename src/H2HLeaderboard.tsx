import { SEASON } from './config';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { calculatePredictionPoints, generateMatchOdds } from './utils/oddsEngine';
import { generateH2HFixtures, H2HMatchup } from './utils/h2hEngine';

interface H2HLeaderboardProps {
  league: any;
  currentRound: string | number;
}

interface ManagerRecord {
  id: string;
  name: string;
  avatarUrl?: string;
  played: number;
  w: number;
  d: number;
  l: number;
  pts: number;
  pf: number;
}

interface CurrentMatchupDisplay {
  player1Id: string;
  player1Name: string;
  player1Avatar?: string;
  player1Score: number;
  player2Id: string;
  player2Name: string;
  player2Avatar?: string;
  player2Score: number;
  status: 'upcoming' | 'live' | 'finished';
}

function H2HLeaderboard({ league, currentRound }: H2HLeaderboardProps) {
  const [standings, setStandings] = useState<ManagerRecord[]>([]);
  const [currentFixtures, setCurrentFixtures] = useState<CurrentMatchupDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const calculateH2H = async () => {
      if (!league) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        // 1. Fetch league members
        const { data: memberRows, error: mErr } = await supabase
          .from('league_members')
          .select('user_id')
          .eq('league_id', league.id);

        if (mErr) throw mErr;

        const memberIds = (memberRows || []).map(r => r.user_id);
        if (memberIds.length === 0) {
          setStandings([]);
          setCurrentFixtures([]);
          setLoading(false);
          return;
        }

        // 2. Fetch profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url');

        const userNames: Record<string, string> = { AVERAGE: '👻 Average Bot' };
        const userAvatars: Record<string, string | undefined> = { AVERAGE: undefined };

        (profiles || []).forEach(p => {
          userNames[p.id] = p.display_name || 'Manager';
          userAvatars[p.id] = p.avatar_url;
        });

        // 3. Generate fixtures schedule if not stored on league
        const fixturesSchedule: Record<string, H2HMatchup[]> =
          league.fixtures && Object.keys(league.fixtures).length > 0
            ? league.fixtures
            : generateH2HFixtures(memberIds);

        // 4. Initialize Manager Records
        const records: Record<string, ManagerRecord> = {};
        memberIds.forEach(uid => {
          records[uid] = {
            id: uid,
            name: userNames[uid] || 'Manager',
            avatarUrl: userAvatars[uid],
            played: 0,
            w: 0,
            d: 0,
            l: 0,
            pts: 0,
            pf: 0
          };
        });

        records['AVERAGE'] = {
          id: 'AVERAGE',
          name: '👻 Average Bot',
          avatarUrl: undefined,
          played: 0,
          w: 0,
          d: 0,
          l: 0,
          pts: 0,
          pf: 0
        };

        const currentGwNum = parseInt(String(currentRound), 10) || 1;

        // 5. Compute historical standings for all completed/processed gameweeks up to current
        // Also compute points for the active gameweek
        const allRoundsToFetch = Array.from({ length: currentGwNum }, (_, i) => i + 1);

        // Fetch predictions for all relevant rounds in one query
        const { data: allPreds } = await supabase
          .from('predictions')
          .select('*')
          .eq('season', SEASON)
          .in('gameweek', allRoundsToFetch);

        const predsByGwUser: Record<string, Record<string, any[]>> = {};
        (allPreds || []).forEach((pred: any) => {
          const gwKey = String(pred.gameweek);
          if (!predsByGwUser[gwKey]) predsByGwUser[gwKey] = {};
          if (!predsByGwUser[gwKey][pred.user_id]) predsByGwUser[gwKey][pred.user_id] = [];
          predsByGwUser[gwKey][pred.user_id].push(pred);
        });

        // Loop through each round to calculate points and resolve matchups
        for (let r = 1; r <= currentGwNum; r++) {
          const { data: cacheRow } = await supabase
            .from('matches_cache')
            .select('matches')
            .eq('id', `${SEASON}_week_${r}`)
            .single();

          const cachedMatches = cacheRow?.matches || [];
          const matchResults: Record<string, any> = {};
          let finishedMatchesCount = 0;

          cachedMatches.forEach((match: any) => {
            if (match.status === 'FINISHED' && match.score?.fullTime?.home !== null) {
              finishedMatchesCount++;
              matchResults[String(match.id)] = {
                home: match.score.fullTime.home,
                away: match.score.fullTime.away,
                odds: match.odds || generateMatchOdds(match.homeTeam?.name || '', match.awayTeam?.name || '', String(match.id))
              };
            }
          });

          // Calculate round scores for each player
          const roundScores: Record<string, number> = {};
          const userPicks = predsByGwUser[String(r)] || {};
          let totalScore = 0;
          let activeMembersCount = 0;

          memberIds.forEach(uid => {
            const picks = userPicks[uid] || [];
            let score = 0;
            picks.forEach(pred => {
              const actual = matchResults[String(pred.match_id)];
              if (actual && pred.home_score !== null && pred.away_score !== null) {
                const res = calculatePredictionPoints(pred.home_score, pred.away_score, actual.home, actual.away, actual.odds);
                score += res.totalPoints;
              }
            });
            roundScores[uid] = score;
            totalScore += score;
            activeMembersCount++;
          });

          const averageScore = activeMembersCount > 0 ? Math.round(totalScore / activeMembersCount) : 0;
          roundScores['AVERAGE'] = averageScore;

          const roundMatchups = fixturesSchedule[String(r)] || [];

          // If this is a past round OR a round with finished matches, apply to standings table
          if (r < currentGwNum && finishedMatchesCount > 0) {
            roundMatchups.forEach(m => {
              const p1 = m.player1;
              const p2 = m.player2;
              const s1 = roundScores[p1] ?? 0;
              const s2 = roundScores[p2] ?? 0;

              if (records[p1]) {
                records[p1].played++;
                records[p1].pf += s1;
                if (s1 > s2) { records[p1].w++; records[p1].pts += 3; }
                else if (s1 === s2) { records[p1].d++; records[p1].pts += 1; }
                else { records[p1].l++; }
              }

              if (records[p2]) {
                records[p2].played++;
                records[p2].pf += s2;
                if (s2 > s1) { records[p2].w++; records[p2].pts += 3; }
                else if (s2 === s1) { records[p2].d++; records[p2].pts += 1; }
                else { records[p2].l++; }
              }
            });
          }

          // If this is the current active round, construct the visual Matchups cards!
          if (r === currentGwNum) {
            const isRoundFinished = cachedMatches.length > 0 && finishedMatchesCount === cachedMatches.length;
            const isRoundLive = finishedMatchesCount > 0 && finishedMatchesCount < cachedMatches.length;
            const roundStatus: 'upcoming' | 'live' | 'finished' = isRoundFinished
              ? 'finished'
              : isRoundLive
              ? 'live'
              : 'upcoming';

            const activeFixturesDisplay: CurrentMatchupDisplay[] = roundMatchups.map(m => ({
              player1Id: m.player1,
              player1Name: userNames[m.player1] || 'Manager',
              player1Avatar: userAvatars[m.player1],
              player1Score: roundScores[m.player1] || 0,
              player2Id: m.player2,
              player2Name: userNames[m.player2] || 'Manager',
              player2Avatar: userAvatars[m.player2],
              player2Score: roundScores[m.player2] || 0,
              status: roundStatus,
            }));

            setCurrentFixtures(activeFixturesDisplay);
          }
        }

        const sortedStandings = Object.values(records)
          .filter(r => r.id !== 'AVERAGE' || r.played > 0)
          .sort((a, b) => b.pts - a.pts || b.pf - a.pf);

        setStandings(sortedStandings);
      } catch (e: any) {
        console.error("H2H calculation error:", e);
        setError("Failed to calculate Head-to-Head standings.");
      } finally {
        setLoading(false);
      }
    };

    calculateH2H();
  }, [league, currentRound]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-900/60 rounded-2xl border border-gray-800 my-4">
        <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-semibold text-gray-300">Calculating Head-to-Head Tournament & Fixtures...</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 my-4">
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* --- ⚔️ SECTION 1: GAMEWEEK FIXTURES / MATCHUPS --- */}
      <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚔️</span>
            <h3 className="text-base font-bold text-white tracking-wide">
              Gameweek {currentRound} Matchups
            </h3>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
            Round-Robin Tournament
          </span>
        </div>

        {currentFixtures.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {currentFixtures.map((match, idx) => {
              const p1Winning = match.player1Score > match.player2Score;
              const p2Winning = match.player2Score > match.player1Score;
              const isTied = match.player1Score === match.player2Score;

              return (
                <div
                  key={idx}
                  className="bg-gray-950/70 border border-gray-800/90 hover:border-gray-700 rounded-xl p-3.5 flex flex-col gap-2.5 transition-all shadow-md"
                >
                  <div className="flex items-center justify-between text-xs">
                    {/* Player 1 */}
                    <div className="flex items-center gap-2 max-w-[42%]">
                      <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center font-bold text-[11px] text-blue-300 shrink-0 overflow-hidden">
                        {match.player1Avatar ? (
                          <img src={match.player1Avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          match.player1Name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className={`font-semibold truncate ${p1Winning ? 'text-emerald-300 font-bold' : 'text-gray-200'}`}>
                        {match.player1Name}
                      </span>
                    </div>

                    {/* Score Center Pill */}
                    <div className="flex flex-col items-center px-3 py-1 bg-gray-900 rounded-lg border border-gray-700/80">
                      <div className="flex items-center gap-1.5 text-sm font-extrabold tracking-wider">
                        <span className={p1Winning ? 'text-emerald-400' : 'text-white'}>{match.player1Score}</span>
                        <span className="text-gray-500 font-normal">-</span>
                        <span className={p2Winning ? 'text-emerald-400' : 'text-white'}>{match.player2Score}</span>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">
                        {match.status === 'finished' ? 'Final' : match.status === 'live' ? 'Live' : 'vs'}
                      </span>
                    </div>

                    {/* Player 2 */}
                    <div className="flex items-center gap-2 max-w-[42%] justify-end text-right">
                      <span className={`font-semibold truncate ${p2Winning ? 'text-emerald-300 font-bold' : 'text-gray-200'}`}>
                        {match.player2Name}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center font-bold text-[11px] text-purple-300 shrink-0 overflow-hidden">
                        {match.player2Avatar ? (
                          <img src={match.player2Avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          match.player2Name.charAt(0).toUpperCase()
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Indicator */}
                  <div className="flex items-center justify-between text-[10px] text-gray-400 border-t border-gray-900 pt-2 px-1">
                    <span>Fixture #{idx + 1}</span>
                    <span className="font-medium">
                      {match.status === 'finished' ? (
                        isTied ? '🤝 Points Shared' : p1Winning ? `🏆 ${match.player1Name} Won` : `🏆 ${match.player2Name} Won`
                      ) : match.status === 'live' ? (
                        '🟢 Gameweek in play'
                      ) : (
                        '⏳ Predictions Locked at Kickoff'
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400 text-xs">
            Join more players to generate Head-to-Head fixtures.
          </div>
        )}
      </div>

      {/* --- 📊 SECTION 2: HEAD-TO-HEAD STANDINGS TABLE --- */}
      <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h3 className="text-base font-bold text-white tracking-wide">
              Head-to-Head Standings
            </h3>
          </div>
          <span className="text-[11px] text-gray-400">
            3 pts Win · 1 pt Draw
          </span>
        </div>

        {standings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 font-semibold text-center w-10">Pos</th>
                  <th className="py-2.5 px-3 font-semibold">Manager</th>
                  <th className="py-2.5 px-2 font-semibold text-center">P</th>
                  <th className="py-2.5 px-2 font-semibold text-center text-emerald-400">W</th>
                  <th className="py-2.5 px-2 font-semibold text-center text-amber-400">D</th>
                  <th className="py-2.5 px-2 font-semibold text-center text-rose-400">L</th>
                  <th className="py-2.5 px-3 font-semibold text-center">PF</th>
                  <th className="py-2.5 px-3 font-bold text-center text-blue-400">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-medium">
                {standings.map((team, idx) => (
                  <tr
                    key={team.id}
                    className={`hover:bg-gray-800/40 transition-colors ${
                      idx === 0 ? 'bg-amber-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-3 text-center font-bold">
                      {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center font-bold text-[10px] text-gray-300 overflow-hidden">
                          {team.avatarUrl ? (
                            <img src={team.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            team.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <span className="font-semibold text-white">{team.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center text-gray-300">{team.played}</td>
                    <td className="py-3 px-2 text-center text-emerald-400 font-semibold">{team.w}</td>
                    <td className="py-3 px-2 text-center text-amber-400">{team.d}</td>
                    <td className="py-3 px-2 text-center text-rose-400">{team.l}</td>
                    <td className="py-3 px-3 text-center text-gray-300 font-mono">{team.pf}</td>
                    <td className="py-3 px-3 text-center font-extrabold text-sm text-blue-400">
                      {team.pts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">
            No completed Head-to-Head matches recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}

export default H2HLeaderboard;
