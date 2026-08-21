import { useState, useEffect } from 'react';
import './App.css';
import { supabase } from './supabase';
import GameweekLeaderboard from './leaderboard';
import OverallLeaderboard from './overallLeaderboard';
import Admin from './Admin';
import ProfileSetup from './ProfileSetup';
import LeaguesView from './LeaguesView';
import H2HLeaderboard from './H2HLeaderboard';
import { checkForAutoUpdate, tryTriggerLiveUpdate } from './utils/dataUpdater';
import { getMatchGradient, getTeamColor } from './utils/teamColors';
import TeamForm from './TeamForm';
import { AuthOverlay } from './AuthOverlay';
import RulesView from './RulesView';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { generateMatchOdds, isUnderdogOutcome, calculatePredictionPoints, UNDERDOG_ODDS_THRESHOLD } from './utils/oddsEngine';
import { Match, PredictionsMap } from './types';
import { ShareCardModal } from './ShareCardModal';
import { computeManagerBadges } from './utils/badgeEngine';
import { subscribeUserToPush, isPushSupported } from './utils/pushNotifications';

import { SEASON, COMPETITION_CODE, API_BASE_URL, LOCKOUT_BUFFER_MS } from './config';
const ADMIN_EMAILS = ["yousefhegazi74@gmail.com"];

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionsMap>({});
  const [apiError, setApiError] = useState('');
  const [currentRound, setCurrentRound] = useState<string>("1");
  const [gameWeekId, setGameWeekId] = useState<string>(`${SEASON}_gameweek_1`);
  const [user, setUser] = useState<any | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState({ message: '', visible: false, type: 'info' });
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentLeague, setCurrentLeague] = useState(null);
  const [teamForms, setTeamForms] = useState({});
  const [announcement, setAnnouncement] = useState<{ message: string; active: boolean; type?: 'info' | 'warning' | 'success' } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>('idle');

  const [nowTime, setNowTime] = useState(Date.now());

  const showToast = (message, type = 'info') => {
    setToast({ message, visible: true, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  const handleEnablePush = async () => {
    if (!user) {
      showToast('Please sign in first to enable push alerts.', 'error');
      return;
    }
    setPushStatus('loading');
    const success = await subscribeUserToPush(user.id || user.uid);
    if (success) {
      setPushStatus('subscribed');
      showToast('🔔 Push alerts activated! We will notify you 30m before kickoff if you forget picks.', 'success');
    } else {
      setPushStatus('denied');
      showToast('Push permission denied or not supported on this browser.', 'error');
    }
  };

  // 30s Clock Ticker for Live Lockout Countdowns
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Global Announcement Listener (Supabase)
  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        const { data } = await supabase
          .from('system_announcements')
          .select('*')
          .eq('id', 'global')
          .single();
        
        if (data && data.active && data.message) {
          setAnnouncement({ message: data.message, active: true, type: (data.type as any) || 'info' });
        } else {
          setAnnouncement(null);
        }
      } catch {
        setAnnouncement(null);
      }
    };

    fetchAnnouncement();

    const channel = supabase
      .channel('public:system_announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_announcements' }, () => {
        fetchAnnouncement();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Bulletproof match loader: loads from Supabase cache & live proxy fallback
  useEffect(() => {
    const roundToLoad = currentRound || "1";
    let isCancelled = false;

    const loadMatches = async () => {
      setIsLoading(true);
      setApiError('');

      try {
        // 1. Try Supabase matches_cache first
        const { data: cacheRow } = await supabase
          .from('matches_cache')
          .select('matches')
          .eq('id', `${SEASON}_week_${roundToLoad}`)
          .single();

        if (!isCancelled && cacheRow?.matches && cacheRow.matches.length > 0) {
          setMatches(cacheRow.matches);
          setIsLoading(false);
          return;
        }

        // 2. Direct API Proxy Fallback (Works on any device & unauthenticated)
        const proxyUrl = `${API_BASE_URL}?targetPath=competitions/${COMPETITION_CODE}/matches&season=${SEASON}&matchday=${roundToLoad}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();

        if (data?.matches && data.matches.length > 0) {
          const formattedMatches = data.matches.map((match: any) => ({
            id: String(match.id),
            homeTeam: match.homeTeam?.name || 'Home',
            awayTeam: match.awayTeam?.name || 'Away',
            homeLogo: match.homeTeam?.crest || '',
            awayLogo: match.awayTeam?.crest || '',
            date: new Date(match.utcDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
            timestamp: new Date(match.utcDate).getTime(),
            status: match.status,
            odds: generateMatchOdds(match.homeTeam?.name || '', match.awayTeam?.name || '', String(match.id)),
            score: {
              fullTime: {
                home: match.score?.fullTime?.home,
                away: match.score?.fullTime?.away
              }
            }
          })).sort((a: any, b: any) => a.timestamp - b.timestamp);

          if (!isCancelled) {
            setMatches(formattedMatches);
            setIsLoading(false);
          }

          // Cache in Supabase if session active
          try {
            await supabase.from('matches_cache').upsert({
              id: `${SEASON}_week_${roundToLoad}`,
              season: SEASON,
              gameweek: parseInt(roundToLoad, 10),
              matches: formattedMatches,
              last_updated: new Date().toISOString()
            });
          } catch (e) {
            // Non-blocking
          }
          return;
        }

        if (!isCancelled) {
          setApiError('No match fixtures found for this gameweek.');
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error("Match loading error:", err);
        if (!isCancelled) {
          setApiError('Error loading match data. Retrying...');
          setIsLoading(false);
        }
      }
    };

    loadMatches();

    return () => {
      isCancelled = true;
    };
  }, [currentRound]);

  // LIVE TRIGGER: Crowd-Sourced Cron
  // Now triggers for whichever gameweek is being VIEWED, not just the "current" one
  // This ensures past gameweeks get score corrections (e.g., disallowed goals)
  useEffect(() => {
      if (!currentRound) return;
      
      // Trigger immediately when viewing any gameweek to get latest scores
      tryTriggerLiveUpdate(currentRound);
      
      const interval = setInterval(() => {
          tryTriggerLiveUpdate(currentRound);
      }, 60000);

      return () => clearInterval(interval);
  }, [currentRound]);

  useEffect(() => {
    const checkUserProfile = async (supabaseUser: any) => {
      if (!supabaseUser) {
        setUser(null);
        setIsCheckingProfile(false);
        setIsLoading(false);
        return;
      }

      setIsCheckingProfile(true);
      fetchCurrentGameweek();
      checkForAutoUpdate();

      try {
        // Query Supabase profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, total_score')
          .eq('id', supabaseUser.id)
          .single();

        const resolvedName = profile?.display_name || supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name;

        const userObj = {
          uid: supabaseUser.id,
          id: supabaseUser.id,
          email: supabaseUser.email,
          displayName: resolvedName || '',
          photoURL: supabaseUser.user_metadata?.avatar_url || '',
          totalScore: profile?.total_score || 0,
        };

        setUser(userObj);

        if (!resolvedName) {
          setShowOnboarding(true);
        } else {
          setShowOnboarding(false);
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
        setUser({
          uid: supabaseUser.id,
          id: supabaseUser.id,
          email: supabaseUser.email,
          displayName: supabaseUser.email?.split('@')[0] || 'Manager',
        });
      } finally {
        setIsCheckingProfile(false);
      }
    };

    // 1. Initial Session Check
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkUserProfile(session?.user || null);
    });

    // 2. Realtime Auth State Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkUserProfile(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchCurrentGameweek = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('matches_cache')
        .select('gameweek')
        .order('gameweek', { ascending: false })
        .limit(1);

      if (data && data.length > 0 && data[0].gameweek) {
        setCurrentRound(String(data[0].gameweek));
      } else {
        setCurrentRound("1");
      }
    } catch (e) {
      console.error(e);
      setCurrentRound("1");
    } finally {
      setIsLoading(false);
    }
  };

  // Listen to currentRound changes to update Gameweek ID
  useEffect(() => {
    if (currentRound && user) {
        setGameWeekId(`${SEASON}_gameweek_${currentRound}`);
        // match fetching is handled by the onSnapshot effect now
    }
  }, [currentRound, user]);

  // Fetch Predictions from Supabase
  useEffect(() => {
    const fetchPredictions = async () => {
      const userId = user?.uid || user?.id;
      if (!currentRound || !userId) return;

      try {
        const { data: rows, error } = await supabase
          .from('predictions')
          .select('match_id, home_score, away_score')
          .eq('user_id', userId)
          .eq('season', SEASON)
          .eq('gameweek', parseInt(currentRound, 10));

        if (error) throw error;

        if (rows && rows.length > 0) {
          const map: PredictionsMap = {};
          rows.forEach((r: any) => {
            map[String(r.match_id)] = {
              home: r.home_score !== null && r.home_score !== undefined ? String(r.home_score) : '',
              away: r.away_score !== null && r.away_score !== undefined ? String(r.away_score) : ''
            };
          });
          setPredictions(map);
          showToast('Predictions loaded!');
        } else {
          setPredictions({});
        }
      } catch (err) {
        console.error("Error loading predictions from Supabase:", err);
      }
    };
    fetchPredictions();
  }, [currentRound, user]);

  // H2H Opponent Logic (Supabase)
  const [h2hOpponent, setH2hOpponent] = useState<string | null>(null);

  useEffect(() => {
    const fetchOpponent = async () => {
      const userId = user?.uid || user?.id;
      setH2hOpponent(null);
      if (!currentLeague || currentLeague.type !== 'h2h' || !currentRound || !currentLeague.fixtures || !userId) return;

      const roundFixtures = currentLeague.fixtures[currentRound] || [];
      const myMatch = roundFixtures.find((m: any) => m.player1 === userId || m.player2 === userId);
      
      if (myMatch) {
        const oppId = myMatch.player1 === userId ? myMatch.player2 : myMatch.player1;
        if (oppId === "AVERAGE") {
          setH2hOpponent("👻 Average Bot");
        } else {
          try {
            const { data: oppProfile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', oppId)
              .single();

            setH2hOpponent(oppProfile?.display_name || "Manager");
          } catch {
            setH2hOpponent("Manager");
          }
        }
      } else {
        setH2hOpponent("No Match");
      }
    };
    fetchOpponent();
  }, [currentLeague, currentRound, user]);

  const handleSavePredictions = async () => {
    const userId = user?.uid || user?.id;
    if (!userId) {
      showToast('Please sign in to save your picks.', 'error');
      return;
    }

    try {
      const rowsToUpsert = Object.entries(predictions)
        .filter(([_, p]) => p && p.home !== '' && p.away !== '' && p.home !== undefined && p.away !== undefined)
        .map(([matchId, p]) => ({
          user_id: userId,
          season: SEASON,
          gameweek: parseInt(currentRound || "1", 10),
          match_id: String(matchId),
          home_score: parseInt(String(p.home), 10),
          away_score: parseInt(String(p.away), 10),
          updated_at: new Date().toISOString(),
        }));

      if (rowsToUpsert.length === 0) {
        showToast('Please enter your prediction scores first.', 'error');
        return;
      }

      const { error } = await supabase.from('predictions').upsert(rowsToUpsert, {
        onConflict: 'user_id,season,gameweek,match_id',
      });

      if (error) throw error;

      showToast('Predictions Saved! 🚀', 'success');
    } catch (e: any) {
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if ((isLoading && matches.length === 0) || isCheckingProfile) return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto">
      <header className="w-full mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">PredictionFantasy</h1>
        <p className="text-xs text-gray-400 mt-1">Premier League Predictions & Custom Leagues</p>
        {isCheckingProfile ? <div className="skeleton-gw" style={{width: '200px'}}>Wait... Checking Profile</div> : <div className="skeleton-gw"></div>}
      </header>
      <div className="w-full flex flex-col gap-4">
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
  if (!user) return <AuthOverlay onSuccess={() => setIsCheckingProfile(true)} />;

  const renderMatchCards = () => {
    const predictedCount = matches.filter(m => {
      const p = predictions[m.id];
      return p && p.home !== undefined && p.home !== '' && p.away !== undefined && p.away !== '';
    }).length;

    return (
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

        {/* Prediction Progress Bar & Save Confirmation */}
        {matches.length > 0 && !isLoading && (
          <div className="w-full mb-4 p-3.5 rounded-xl bg-gray-900/90 border border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="text-emerald-400 font-extrabold text-sm">{predictedCount}</span>
                <span className="text-gray-400">/ {matches.length} Matches Predicted</span>
              </div>
              <div className="w-24 h-2 rounded-full bg-gray-800 overflow-hidden border border-gray-700">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
                  style={{ width: `${(predictedCount / matches.length) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-gray-400 flex items-center gap-1.5 font-medium">
              {predictedCount === matches.length ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">🎉 All picks complete!</span>
              ) : (
                <span className="text-gray-400 flex items-center gap-1">Saved automatically ✅</span>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="w-full py-16 text-center text-gray-400 space-y-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium">Loading fixtures for Gameweek {currentRound}...</p>
          </div>
        ) : matches.length === 0 ? (
          /* Empty State */
          <div className="w-full py-12 px-6 rounded-2xl bg-gray-900/70 border border-gray-800 text-center space-y-3 shadow-lg my-4">
            <span className="text-4xl block">⚽</span>
            <h4 className="text-base font-bold text-white">No Fixtures Available Yet</h4>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Match data for Gameweek {currentRound} is scheduled or waiting for initial league synchronization.
            </p>
            <button
              onClick={() => tryTriggerLiveUpdate(currentRound)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow"
            >
              🔄 Sync Fixtures Now
            </button>
          </div>
        ) : (
          <div className="matches-container">
            {matches.map((match) => {
              const matchDeadline = match.timestamp - LOCKOUT_BUFFER_MS;
              const isLocked = nowTime > matchDeadline;
              const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';
              const isFinished = match.status === 'FINISHED';

              const gradientStyle = {
                  background: getMatchGradient(match.homeTeam, match.awayTeam),
                  borderLeft: `4px solid ${getTeamColor(match.homeTeam)}`,
                  borderRight: `4px solid ${getTeamColor(match.awayTeam)}`
              };

              const odds = match.odds || generateMatchOdds(match.homeTeam, match.awayTeam, match.id);
              const pred = predictions[match.id];
              const predHome = pred?.home;
              const predAway = pred?.away;
              const hasPred = predHome !== undefined && predHome !== '' && predAway !== undefined && predAway !== '';

              // Multiplier Badge Preview
              let multiplierBadge = null;
              if (hasPred) {
                const pH = Number(predHome);
                const pA = Number(predAway);
                const predOutcome = pH > pA ? 'H' : (pA > pH ? 'A' : 'D');
                const isUnderdog = isUnderdogOutcome(predOutcome, odds);
                const is5Goals = (pH + pA) >= 5;

                if (isUnderdog && is5Goals) {
                  multiplierBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm animate-pulse">
                      💎 4x QUADRUPLE JACKPOT (12 PTS)
                    </span>
                  );
                } else if (isUnderdog) {
                  multiplierBadge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm">
                      ⚡ 2x Underdog Pick
                    </span>
                  );
                } else if (is5Goals) {
                  multiplierBadge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm">
                      🔥 2x Goal Fest (5+ Goals)
                    </span>
                  );
                }
              }

              return (
              <div 
                key={match.id} 
                className={`match-card ${isLocked ? 'locked' : ''} ${isLive ? 'live-view' : ''}`}
                style={gradientStyle}
              >
                <div className="match-info flex items-center justify-between">
                  <span className="text-xs text-gray-300 font-medium">{match.date}</span>
                  <div className="flex items-center gap-1.5">
                    {isFinished ? (
                      <span className="status-badge finished">FT</span>
                    ) : isLive ? (
                      <span className="status-badge live flex items-center gap-1 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span> LIVE
                      </span>
                    ) : isLocked ? (
                      <span className="status-badge locked-badge">🔒 Locked (5m pre-KO)</span>
                    ) : (
                      (() => {
                        const diff = matchDeadline - nowTime;
                        const hours = Math.floor(diff / (1000 * 60 * 60));
                        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const days = Math.floor(hours / 24);
                        if (hours < 1) {
                          return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm animate-pulse">⏳ Locks in {Math.max(1, minutes)}m</span>;
                        }
                        if (hours < 24) {
                          return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/60 text-blue-300 border border-blue-500/40">⏳ Locks in {hours}h {minutes}m</span>;
                        }
                        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800/80 text-gray-400 border border-gray-700">📅 Opens ({days}d left)</span>;
                      })()
                    )}
                  </div>
                </div>

                <div className="prediction-row">
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

                {/* --- ODDS & BONUS BAR --- */}
                <div className="flex flex-wrap items-center justify-between mt-3 pt-2.5 border-t border-gray-700/60 text-xs gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-gray-400">
                    <span className="text-[11px] uppercase font-bold text-gray-400 mr-0.5">Odds:</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-900/90 border ${odds.home >= UNDERDOG_ODDS_THRESHOLD ? 'border-purple-500 text-purple-300 shadow-sm' : 'border-gray-700 text-gray-300'}`}>
                      {match.homeTeam.split(' ')[0]} Win: <strong>{odds.home.toFixed(2)}</strong>{odds.home >= UNDERDOG_ODDS_THRESHOLD ? ' ⚡2x' : ''}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-900/90 border ${odds.draw >= UNDERDOG_ODDS_THRESHOLD ? 'border-purple-500 text-purple-300 shadow-sm' : 'border-gray-700 text-gray-300'}`}>
                      Draw: <strong>{odds.draw.toFixed(2)}</strong>{odds.draw >= UNDERDOG_ODDS_THRESHOLD ? ' ⚡2x' : ''}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-900/90 border ${odds.away >= UNDERDOG_ODDS_THRESHOLD ? 'border-purple-500 text-purple-300 shadow-sm' : 'border-gray-700 text-gray-300'}`}>
                      {match.awayTeam.split(' ')[0]} Win: <strong>{odds.away.toFixed(2)}</strong>{odds.away >= UNDERDOG_ODDS_THRESHOLD ? ' ⚡2x' : ''}
                    </span>
                  </div>

                  <div>
                    {multiplierBadge}
                  </div>
                </div>

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
        )}
      </>
    );
  };

  // Compute Gameweek points & Badges for the logged in user
  const gameweekPoints = Object.entries(predictions).reduce((acc, [mid, p]) => {
    const match = matches.find(m => String(m.id) === String(mid));
    if (match && match.status === 'FINISHED' && match.score?.fullTime?.home !== null && p && p.home !== '' && p.away !== '') {
      const res = calculatePredictionPoints(
        parseInt(p.home, 10),
        parseInt(p.away, 10),
        match.score.fullTime.home,
        match.score.fullTime.away,
        match.odds
      );
      return acc + res.totalPoints;
    }
    return acc;
  }, 0);

  const myPredictionsList = Object.entries(predictions).map(([mid, p]) => ({
    match_id: mid,
    home_score: p && p.home !== '' ? parseInt(p.home, 10) : null,
    away_score: p && p.away !== '' ? parseInt(p.away, 10) : null
  }));

  const managerBadges = computeManagerBadges(
    myPredictionsList,
    matches,
    user?.totalScore || 0
  );

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-2 pb-12">
      {/* 📢 Global Broadcast Announcement Banner */}
      {announcement && announcement.active && dismissedAnnouncement !== announcement.message && (
        <div className={`w-full mb-6 p-4 rounded-xl shadow-lg border flex items-center justify-between transition-all ${
          announcement.type === 'warning'
            ? 'bg-amber-950/90 border-amber-500/80 text-amber-100'
            : announcement.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500/80 text-emerald-100'
            : 'bg-blue-950/90 border-blue-500/80 text-blue-100'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {announcement.type === 'warning' ? '⚠️' : (announcement.type === 'success' ? '🏆' : '📢')}
            </span>
            <div className="text-sm font-medium leading-snug">
              {announcement.message}
            </div>
          </div>
          <button
            onClick={() => setDismissedAnnouncement(announcement.message)}
            className="ml-4 text-xs font-bold px-2.5 py-1 rounded bg-black/40 hover:bg-black/60 transition opacity-80 hover:opacity-100 border border-white/10"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {showOnboarding && <ProfileSetup user={user} onComplete={() => setShowOnboarding(false)} />}
      <header className="w-full mb-6 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">PredictionFantasy</h1>
        <p className="text-xs text-gray-400 mt-1 mb-4">Premier League Predictions & Custom Leagues</p>
        
        {currentRound && (
            <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => setCurrentRound(String(Math.max(1, parseInt(currentRound) - 1)))}
                  className="w-8 h-8 rounded-full border border-gray-600 text-gray-300 font-bold flex items-center justify-center hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-default"
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
                  className="w-8 h-8 rounded-full border border-gray-600 text-gray-300 font-bold flex items-center justify-center hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-default"
                >
                  &gt;
                </button>
            </div>
        )}
      </header>

      {/* User Status Bar with Viral Share Card & 30m Push Button */}
      <div className="flex flex-wrap justify-between items-center w-full mb-6 p-4 bg-[#1e293b] rounded-xl border border-slate-700/80 gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-700/60 border border-emerald-500 flex items-center justify-center text-lg font-bold text-emerald-200">
            {user.displayName?.[0]?.toUpperCase() || 'M'}
          </div>
          <div>
            <div className="font-bold text-base text-white">{user.displayName}</div>
            <div className="text-xs text-slate-400">Total: <span className="text-emerald-400 font-bold">{user.totalScore || 0} pts</span></div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Share Gameweek Card */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg transition shadow"
            title="Generate shareable score card"
          >
            <span>🏆</span>
            <span>Share Card</span>
          </button>

          {/* 30-Min Kickoff Alert Push Button */}
          <button
            onClick={handleEnablePush}
            disabled={pushStatus === 'subscribed'}
            className={`flex items-center gap-1.5 px-3.5 py-2 font-bold text-xs rounded-lg transition shadow ${
              pushStatus === 'subscribed'
                ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 cursor-default'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
            title="Notify 30 mins before kickoff if you haven't made predictions"
          >
            <span>🔔</span>
            <span>{pushStatus === 'subscribed' ? 'Alerts ON' : '30m Alerts'}</span>
          </button>

          <button 
            onClick={handleLogout} 
            className="bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-800/80 font-bold py-2 px-3 text-xs rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className={`toast ${toast.visible ? 'visible' : ''} ${toast.type}`}>
        {toast.message}
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-8">
        <button onClick={() => navigate('/predictions')} className={`px-4 py-2 rounded-md font-medium transition-colors ${location.pathname === '/predictions' || location.pathname === '/' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Predictions</button>
        <button onClick={() => navigate('/gameweek')} className={`px-4 py-2 rounded-md font-medium transition-colors ${location.pathname === '/gameweek' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Gameweek Leaderboard</button>
        <button onClick={() => navigate('/overall')} className={`px-4 py-2 rounded-md font-medium transition-colors ${location.pathname === '/overall' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Overall Leaderboard</button>
        <button onClick={() => navigate('/leagues')} className={`px-4 py-2 rounded-md font-medium transition-colors ${location.pathname === '/leagues' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>My Leagues</button>
        <button onClick={() => navigate('/rules')} className={`px-4 py-2 rounded-md font-medium transition-colors ${location.pathname === '/rules' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>📖 Rules</button>
        
        {user && ADMIN_EMAILS.includes(user.email) && (
            <button onClick={() => navigate('/admin')} className={`px-4 py-2 rounded-md font-medium transition-colors opacity-50 ${location.pathname === '/admin' ? 'bg-blue-600 text-white opacity-100' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Admin</button>
        )}
      </div>
      
      {apiError && <div className="error-message">{apiError}</div>}
      
      {/* Current League Indicator */}
      {currentLeague && location.pathname !== '/leagues' && (
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

      <Routes>
        <Route path="/" element={renderMatchCards()} />
        <Route path="/predictions" element={renderMatchCards()} />
        <Route path="/rules" element={<RulesView />} />

        <Route path="/leagues" element={
            <LeaguesView 
              user={user} 
              onSelectLeague={(league) => {
                  setCurrentLeague(league);
                  navigate('/gameweek');
                  showToast(`Switched to ${league ? league.name : 'Global League'}`);
              }} 
            />
        } />

        <Route path="/gameweek" element={
            <>
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
        } />

        <Route path="/overall" element={<OverallLeaderboard leagueId={currentLeague?.id} />} />
        <Route path="/admin" element={user && ADMIN_EMAILS.includes(user.email) ? <Admin /> : <div style={{padding:'20px', textAlign:'center'}}>Unauthorized</div>} />
        <Route path="*" element={<Navigate to="/predictions" replace />} />
      </Routes>

      {/* Share Card Modal */}
      <ShareCardModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        managerName={user?.displayName || 'Manager'}
        gameweekNum={currentRound || 1}
        gameweekPoints={gameweekPoints}
        totalPoints={user?.totalScore || 0}
        badges={managerBadges}
      />
    </div>
  );
}
export default App;
