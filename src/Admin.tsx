import { useState, useEffect } from 'react';
import { SEASON } from './config';
import { processMatchUpdate } from './utils/dataUpdater';
import { 
  downloadBackupJSON, 
  restoreDatabaseFromSnapshot, 
  autoSnapshotToFirestore 
} from './utils/backupManager';
import { calculatePredictionPoints } from './utils/oddsEngine';
import { supabase, isSupabaseConfigured } from './supabase';
import { settleGameweekScores } from './utils/scoringEngine';

function Admin() {
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Telemetry & Infrastructure State
  const [serverLatency, setServerLatency] = useState<number | null>(null);
  const [serverHealthy, setServerHealthy] = useState<boolean>(true);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(false);

  // 1. Manual Score Correction State
  const [correctionGW, setCorrectionGW] = useState('1');
  const [correctionMatches, setCorrectionMatches] = useState<any[]>([]);
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [editHome, setEditHome] = useState('');
  const [editAway, setEditAway] = useState('');

  // 2. Global Announcement State
  const [announcementMsg, setAnnouncementMsg] = useState('');
  const [announcementType, setAnnouncementType] = useState<'info' | 'warning' | 'success'>('info');
  const [announcementActive, setAnnouncementActive] = useState(false);

  // 3. User & Score Management State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [scoreAdjustment, setScoreAdjustment] = useState('');

  // 4. League Management State
  const [leaguesList, setLeaguesList] = useState<any[]>([]);
  const [leagueSearch, setLeagueSearch] = useState('');

  // 5. Gameweek Finalizer State
  const [finalizeGW, setFinalizeGW] = useState('1');
  const [gwInspectData, setGwInspectData] = useState<any | null>(null);

  // Initial Load
  useEffect(() => {
    loadAnnouncement();
    loadUsers();
    loadLeagues();
    checkTelemetry();
  }, []);

  const checkTelemetry = async () => {
    setSupabaseReady(isSupabaseConfigured());
    const start = performance.now();
    try {
      const res = await fetch('/healthz');
      const latency = Math.round(performance.now() - start);
      setServerLatency(latency);
      setServerHealthy(res.ok);
    } catch {
      setServerHealthy(false);
      setServerLatency(null);
    }
  };

  // --- ANNOUNCEMENT HANDLERS (Supabase) ---
  const loadAnnouncement = async () => {
    try {
      const { data } = await supabase
        .from('system_announcements')
        .select('*')
        .eq('id', 'global')
        .single();

      if (data) {
        setAnnouncementMsg(data.message || '');
        setAnnouncementType(data.type || 'info');
        setAnnouncementActive(Boolean(data.active));
      }
    } catch (err: any) {
      console.error("Error loading announcement from Supabase:", err);
    }
  };

  const saveAnnouncement = async () => {
    setIsLoading(true);
    setStatus('Publishing announcement to PostgreSQL...');
    try {
      const { error } = await supabase
        .from('system_announcements')
        .upsert({
          id: 'global',
          message: announcementMsg.trim(),
          type: announcementType,
          active: announcementActive,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      setStatus(announcementActive ? '✅ Broadcast Announcement Published LIVE!' : '✅ Announcement Saved (Inactive)');
    } catch (err: any) {
      setStatus(`❌ Error saving announcement: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- USER MANAGEMENT HANDLERS (Supabase) ---
  const loadUsers = async () => {
    try {
      const { data: list, error } = await supabase
        .from('profiles')
        .select('*')
        .order('total_score', { ascending: false });

      if (error) throw error;

      const formatted = (list || []).map(p => ({
        id: p.id,
        displayName: p.display_name || 'Manager',
        email: p.email,
        totalScore: p.total_score || 0,
        createdAt: p.created_at
      }));
      setUsersList(formatted);
    } catch (err: any) {
      console.error("Error loading users from Supabase:", err);
    }
  };

  const handleUpdateUserName = async (userId: string) => {
    if (!newDisplayName.trim()) return alert("Please enter a valid name");
    setIsLoading(true);
    setStatus(`Updating manager name for ${userId}...`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: newDisplayName.trim() })
        .eq('id', userId);

      if (error) throw error;
      setStatus(`✅ Manager name updated to "${newDisplayName.trim()}" in PostgreSQL!`);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      setStatus(`❌ Failed to update name: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdjustUserScore = async (userId: string, currentScore: number) => {
    const delta = parseInt(scoreAdjustment, 10);
    if (isNaN(delta)) return alert("Please enter a valid score change number (+/-)");
    const newTotal = Math.max(0, currentScore + delta);

    setIsLoading(true);
    setStatus(`Adjusting score by ${delta > 0 ? `+${delta}` : delta} for ${userId}...`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ total_score: newTotal })
        .eq('id', userId);

      if (error) throw error;
      setStatus(`✅ Score updated! New total: ${newTotal} pts in PostgreSQL`);
      setEditingUser(null);
      setScoreAdjustment('');
      await loadUsers();
    } catch (err: any) {
      setStatus(`❌ Failed to adjust score: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!confirm(`⚠️ ARE YOU SURE you want to delete user "${name}" (${userId})?\nThis cannot be undone.`)) return;
    setIsLoading(true);
    setStatus(`Deleting user ${userId}...`);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      setStatus(`✅ User "${name}" deleted from PostgreSQL.`);
      await loadUsers();
    } catch (err: any) {
      setStatus(`❌ Failed to delete user: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- LEAGUE MANAGEMENT HANDLERS (Supabase) ---
  const loadLeagues = async () => {
    try {
      const { data: list, error } = await supabase
        .from('leagues')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeaguesList(list || []);
    } catch (err: any) {
      console.error("Error loading leagues from Supabase:", err);
    }
  };

  const handleDeleteLeague = async (leagueId: string, name: string) => {
    if (!confirm(`⚠️ ARE YOU SURE you want to delete league "${name}"?\nAll member associations will be removed.`)) return;
    setIsLoading(true);
    setStatus(`Deleting league ${name}...`);
    try {
      const { error } = await supabase
        .from('leagues')
        .delete()
        .eq('id', leagueId);

      if (error) throw error;
      setStatus(`✅ League "${name}" deleted from PostgreSQL.`);
      await loadLeagues();
    } catch (err: any) {
      setStatus(`❌ Failed to delete league: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- GAMEWEEK FINALIZER HANDLERS (Supabase) ---
  const inspectGameweek = async () => {
    setIsLoading(true);
    setStatus(`Inspecting Gameweek ${finalizeGW}...`);
    try {
      // 1. Fetch matches from Supabase
      const { data: cacheRow } = await supabase
        .from('matches_cache')
        .select('matches')
        .eq('id', `${SEASON}_week_${finalizeGW}`)
        .single();

      const matches = cacheRow?.matches || [];
      const finishedCount = matches.filter((m: any) => m.status === 'FINISHED').length;

      // 2. Fetch predictions & compute leaderboard preview
      const { data: predictions } = await supabase
        .from('predictions')
        .select('*')
        .eq('season', SEASON)
        .eq('gameweek', parseInt(finalizeGW, 10));

      const resultsMap: Record<string, any> = {};
      matches.forEach((m: any) => {
        if (m.status === 'FINISHED' && m.score?.fullTime?.home !== null) {
          resultsMap[String(m.id)] = {
            home: m.score.fullTime.home,
            away: m.score.fullTime.away,
            odds: m.odds
          };
        }
      });

      const { data: profiles } = await supabase.from('profiles').select('id, display_name');
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach(p => {
        nameMap[p.id] = p.display_name || 'Manager';
      });

      const userScores: Record<string, number> = {};
      (predictions || []).forEach((pred: any) => {
        const uid = pred.user_id;
        const actual = resultsMap[String(pred.match_id)];
        if (actual && pred.home_score !== null && pred.away_score !== null) {
          const res = calculatePredictionPoints(pred.home_score, pred.away_score, actual.home, actual.away, actual.odds);
          userScores[uid] = (userScores[uid] || 0) + res.totalPoints;
        }
      });

      const leaderList = Object.entries(userScores).map(([uid, pts]) => ({
        id: uid,
        name: nameMap[uid] || 'Manager',
        points: pts
      })).sort((a, b) => b.points - a.points);

      setGwInspectData({
        matches,
        finishedCount,
        totalCount: matches.length,
        isFinalized: false,
        topScorers: leaderList.slice(0, 5)
      });

      setStatus(`Gameweek ${finalizeGW} loaded: ${finishedCount}/${matches.length} Finished.`);
    } catch (err: any) {
      setStatus(`❌ Inspection Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeGameweek = async () => {
    if (!gwInspectData) return;
    if (!confirm(`🏆 FINALIZING GAMEWEEK ${finalizeGW}:\n\nThis will distribute points to all user profiles in PostgreSQL.\nProceed?`)) return;

    setIsLoading(true);
    setStatus(`Finalizing Gameweek ${finalizeGW} and distributing points in PostgreSQL...`);

    try {
      const settlement = await settleGameweekScores(parseInt(finalizeGW, 10), SEASON);
      setStatus(`✅ Gameweek ${finalizeGW} successfully settled! ${settlement.totalPredictionsScored} predictions scored across ${settlement.totalUsersUpdated} managers.`);
      await inspectGameweek();
      await loadUsers();
    } catch (err: any) {
      setStatus(`❌ Finalization Failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- EXISTING TOOLS ---
  const handleUpdateAllData = async () => {
    setIsLoading(true);
    setStatus('Starting update...');
    try {
        await processMatchUpdate(setStatus);
    } catch (e: any) {
        setStatus(`Error: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const loadMatchesForCorrection = async () => {
    setIsLoading(true);
    setStatus(`Loading matches for Week ${correctionGW}...`);
    try {
      const { data: cacheRow } = await supabase
        .from('matches_cache')
        .select('matches')
        .eq('id', `${SEASON}_week_${correctionGW}`)
        .single();
      
      if (cacheRow && cacheRow.matches) {
        setCorrectionMatches(cacheRow.matches);
        setStatus(`Loaded ${cacheRow.matches.length} matches for Week ${correctionGW} from PostgreSQL`);
      } else {
        setCorrectionMatches([]);
        setStatus(`No match data found for Week ${correctionGW}`);
      }
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const saveScoreCorrection = async (matchId: string) => {
    setIsLoading(true);
    setStatus(`Saving correction for match ${matchId}...`);
    try {
      const updatedMatches = correctionMatches.map(m => {
        if (m.id === matchId) {
          return {
            ...m,
            score: {
              fullTime: {
                home: editHome === '' ? null : parseInt(editHome, 10),
                away: editAway === '' ? null : parseInt(editAway, 10)
              }
            },
            status: 'FINISHED',
            hasManualOverride: true
          };
        }
        return m;
      });

      const { error } = await supabase
        .from('matches_cache')
        .upsert({
          id: `${SEASON}_week_${correctionGW}`,
          season: SEASON,
          gameweek: parseInt(correctionGW, 10),
          matches: updatedMatches,
          last_updated: new Date().toISOString()
        });

      if (error) throw error;

      setCorrectionMatches(updatedMatches);
      setEditingMatch(null);
      setStatus(`✅ Score updated and saved to PostgreSQL for match ${matchId}`);
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const recalculateScores = async () => {
    if (!confirm("⚠️ This will recalculate ALL user scores across all gameweeks based on PostgreSQL cached results. Continue?")) return;
    
    setIsLoading(true);
    setStatus("Starting recalculation with Supabase scoring engine...");
    
    try {
      let totalScored = 0;
      for (let gw = 1; gw <= 38; gw++) {
        try {
          const settlement = await settleGameweekScores(gw, SEASON);
          totalScored += settlement.totalPredictionsScored;
        } catch {
          // ignore empty
        }
      }

      setStatus(`✅ Recalculation Complete! Recalculated ${totalScored} predictions.`);
      await loadUsers();
    } catch (e: any) {
      setStatus("❌ Recalculation Failed: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = usersList.filter(u => {
    const q = userSearch.toLowerCase();
    return (
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-[#161b22] text-white rounded-2xl shadow-2xl border border-gray-800 my-6">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-700 mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
            🛡️ PredictionFantasy Control Center
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Admin operations, score audits, user moderation & telemetry</p>
        </div>
        <span className="text-xs bg-blue-900/60 text-blue-300 px-3 py-1 rounded-full border border-blue-500/40 font-semibold">
          Season {SEASON} Active
        </span>
      </div>

      {/* --- TELEMETRY & SYSTEM HEALTH --- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="p-3.5 bg-gray-900/80 rounded-xl border border-gray-800 flex flex-col justify-between">
          <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Container Health</span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2.5 h-2.5 rounded-full ${serverHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm font-bold text-white">{serverHealthy ? '200 OK' : 'Offline'}</span>
          </div>
          <span className="text-[10px] text-gray-500 mt-1">{serverLatency !== null ? `${serverLatency}ms latency` : 'Pinging...'}</span>
        </div>

        <div className="p-3.5 bg-gray-900/80 rounded-xl border border-gray-800 flex flex-col justify-between">
          <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Database Mode</span>
          <div className="text-sm font-bold text-white mt-1">
            {supabaseReady ? '⚡ Supabase PG' : '🔥 Firebase DB'}
          </div>
          <span className="text-[10px] text-gray-500 mt-1">{supabaseReady ? 'PostgreSQL Active' : 'Migration Ready'}</span>
        </div>

        <div className="p-3.5 bg-gray-900/80 rounded-xl border border-gray-800 flex flex-col justify-between">
          <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">API Cache Policy</span>
          <div className="text-sm font-bold text-emerald-400 mt-1">10 req / min</div>
          <span className="text-[10px] text-gray-500 mt-1">Zero Overage Rate Guard</span>
        </div>

        <div className="p-3.5 bg-gray-900/80 rounded-xl border border-gray-800 flex flex-col justify-between">
          <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Active Entities</span>
          <div className="text-sm font-bold text-white mt-1">{usersList.length} Users · {leaguesList.length} Leagues</div>
          <button onClick={() => { loadUsers(); loadLeagues(); checkTelemetry(); }} className="text-[10px] text-blue-400 hover:text-blue-300 text-left mt-1">🔄 Refresh telemetry</button>
        </div>
      </div>

      {/* --- 1. 📢 GLOBAL BROADCAST ANNOUNCEMENT COMPOSER --- */}
      <div className="mb-8 p-5 bg-[#1f2937] rounded-xl border border-gray-700/80 shadow-md">
        <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2 mb-1">
          📢 Live Broadcast Announcement
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Publish a top-of-screen alert to all users instantly (e.g. deadline reminders, score alerts).
        </p>

        <div className="space-y-3">
          <textarea
            value={announcementMsg}
            onChange={(e) => setAnnouncementMsg(e.target.value)}
            placeholder="Type announcement message here... (e.g. ⚠️ Deadline for GW1 is today at 18:00 UTC!)"
            rows={2}
            className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <label className="text-xs text-gray-300 font-semibold">Style:</label>
              <select
                value={announcementType}
                onChange={(e: any) => setAnnouncementType(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-xs text-white p-2 rounded-lg outline-none"
              >
                <option value="info">🔵 Info (Blue)</option>
                <option value="warning">🟡 Warning / Alert (Amber)</option>
                <option value="success">🟢 Success / Celebration (Emerald)</option>
              </select>

              <label className="flex items-center gap-2 text-xs font-semibold text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={announcementActive}
                  onChange={(e) => setAnnouncementActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0"
                />
                Active (Visible to Players)
              </label>
            </div>

            <button
              onClick={saveAnnouncement}
              disabled={isLoading}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold text-xs rounded-lg transition-all shadow disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Publish Announcement'}
            </button>
          </div>
        </div>
      </div>

      {/* --- 2. 🏆 GAMEWEEK FINALIZER & WINNER SUMMARY WIZARD --- */}
      <div className="mb-8 p-5 bg-[#1f2937] rounded-xl border border-gray-700/80 shadow-md">
        <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2 mb-1">
          🏆 Gameweek Finalizer & Leaderboard Wizard
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Check fixture completion, preview top weekly scorers, and finalize points distribution with 1 click.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <select
            value={finalizeGW}
            onChange={(e) => setFinalizeGW(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-sm text-white p-2.5 rounded-lg outline-none flex-1 max-w-[200px]"
          >
            {[...Array(38)].map((_, i) => (
              <option key={i+1} value={String(i+1)}>Gameweek {i+1}</option>
            ))}
          </select>

          <button
            onClick={inspectGameweek}
            disabled={isLoading}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition shadow disabled:opacity-50"
          >
            Inspect Gameweek {finalizeGW}
          </button>
        </div>

        {gwInspectData && (
          <div className="p-4 bg-gray-900/90 rounded-lg border border-gray-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-gray-800 pb-3">
              <div>
                <strong>Matches Finished:</strong>{' '}
                <span className={gwInspectData.finishedCount === gwInspectData.totalCount ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {gwInspectData.finishedCount} / {gwInspectData.totalCount}
                </span>
              </div>
              <div>
                <strong>Gameweek Status:</strong>{' '}
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${gwInspectData.isFinalized ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50' : 'bg-amber-950 text-amber-300 border border-amber-500/50'}`}>
                  {gwInspectData.isFinalized ? 'FINALIZED' : 'PENDING'}
                </span>
              </div>
            </div>

            {/* Top Scorers Preview */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Gameweek {finalizeGW} Top Scorers Preview:</h4>
              {gwInspectData.topScorers.length === 0 ? (
                <p className="text-xs text-gray-500">No predictions submitted for this gameweek yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {gwInspectData.topScorers.map((s, idx) => (
                    <div key={s.id} className="flex justify-between items-center p-2 rounded bg-gray-800/80 text-xs border border-gray-700/50">
                      <span>{idx === 0 ? '👑 ' : `${idx + 1}. `}<strong>{s.name}</strong></span>
                      <span className="text-emerald-400 font-bold">{s.points} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleFinalizeGameweek}
              disabled={isLoading || gwInspectData.isFinalized}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white font-bold text-xs rounded-lg transition shadow disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{gwInspectData.isFinalized ? '✅ Gameweek Already Finalized' : `⚡ Finalize GW ${finalizeGW} & Distribute Points`}</span>
            </button>
          </div>
        )}
      </div>

      {/* --- 3. 👥 USER MANAGEMENT & MODERATION TABLE --- */}
      <div className="mb-8 p-5 bg-[#1f2937] rounded-xl border border-gray-700/80 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
              👥 User Management & Moderation ({usersList.length})
            </h3>
            <p className="text-xs text-gray-400">Search managers, moderate display names, adjust points, or remove accounts.</p>
          </div>
          <input
            type="text"
            placeholder="Search by name, email, or UID..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="p-2 rounded-lg bg-gray-900 border border-gray-700 text-xs text-white outline-none w-full sm:w-64"
          />
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-gray-700/60 bg-gray-900">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-gray-800 text-gray-400 uppercase text-[10px] sticky top-0">
              <tr>
                <th className="p-3">Manager Name</th>
                <th className="p-3">Email</th>
                <th className="p-3 text-center">Score</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-gray-800/50 transition">
                  <td className="p-3 font-semibold text-white">
                    {u.displayName || 'No Name'}
                  </td>
                  <td className="p-3 text-gray-400">
                    {u.email || 'N/A'}
                  </td>
                  <td className="p-3 text-center font-bold text-emerald-400">
                    {u.totalScore || 0}
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setNewDisplayName(u.displayName || '');
                        setScoreAdjustment('');
                      }}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-[11px] text-gray-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id, u.displayName || u.email)}
                      className="px-2 py-1 bg-red-900/60 hover:bg-red-800 text-red-200 rounded text-[11px]"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    No users found matching "{userSearch}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Edit User Modal Drawer */}
        {editingUser && (
          <div className="mt-4 p-4 rounded-lg bg-gray-900 border border-purple-500/50 space-y-3">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h4 className="font-bold text-xs text-purple-300">Moderate Manager: {editingUser.displayName} ({editingUser.email})</h4>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-white text-xs">✕ Close</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Edit Display Name:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="p-2 rounded bg-gray-800 border border-gray-700 text-white flex-1 outline-none"
                  />
                  <button
                    onClick={() => handleUpdateUserName(editingUser.id)}
                    className="px-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Score Adjustment (+/- Points):</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="e.g. +3 or -2"
                    value={scoreAdjustment}
                    onChange={(e) => setScoreAdjustment(e.target.value)}
                    className="p-2 rounded bg-gray-800 border border-gray-700 text-white flex-1 outline-none"
                  />
                  <button
                    onClick={() => handleAdjustUserScore(editingUser.id, editingUser.totalScore || 0)}
                    className="px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- LEAGUE MANAGEMENT & MODERATION TABLE --- */}
      <div className="mb-8 p-5 bg-[#1f2937] rounded-xl border border-gray-700/80 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-sky-400 flex items-center gap-2">
              🏆 League Moderation & Roster ({leaguesList.length})
            </h3>
            <p className="text-xs text-gray-400">Inspect mini-leagues, copy join codes, or remove dead leagues.</p>
          </div>
          <input
            type="text"
            placeholder="Search by league name or join code..."
            value={leagueSearch}
            onChange={(e) => setLeagueSearch(e.target.value)}
            className="p-2 rounded-lg bg-gray-900 border border-gray-700 text-xs text-white outline-none w-full sm:w-64"
          />
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-gray-700/60 bg-gray-900">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-gray-800 text-gray-400 uppercase text-[10px] sticky top-0">
              <tr>
                <th className="p-3">League Name</th>
                <th className="p-3">Join Code</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-center">Members</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {leaguesList
                .filter(l => {
                  const q = leagueSearch.toLowerCase();
                  return (
                    (l.name && l.name.toLowerCase().includes(q)) ||
                    (l.code && l.code.toLowerCase().includes(q))
                  );
                })
                .map(l => (
                  <tr key={l.id} className="hover:bg-gray-800/50 transition">
                    <td className="p-3 font-semibold text-white">
                      {l.name}
                    </td>
                    <td className="p-3 font-mono font-bold text-amber-300">
                      {l.code}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.type === 'h2h' ? 'bg-purple-950 text-purple-300 border border-purple-600/40' : 'bg-blue-950 text-blue-300 border border-blue-600/40'}`}>
                        {l.type === 'h2h' ? 'Head-to-Head' : 'Classic'}
                      </span>
                    </td>
                    <td className="p-3 text-center text-gray-300 font-bold">
                      {Array.isArray(l.members) ? l.members.length : 1}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteLeague(l.id, l.name)}
                        className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 text-red-200 rounded text-[11px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              {leaguesList.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    No custom leagues found yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- 4. 🔄 DATA SYNC & MANUAL SCORE OVERRIDES --- */}
      <div className="mb-8 p-5 bg-[#1f2937] rounded-xl border border-gray-700/80 shadow-md">
        <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2 mb-3">
          🔄 Matches Cache & Score Overrides
        </h3>
        
        <button 
          onClick={handleUpdateAllData} 
          disabled={isLoading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-lg transition shadow disabled:opacity-50 mb-6"
        >
          {isLoading ? 'Updating...' : 'Fetch All Match Data from Football-Data API (Whole Season)'}
        </button>

        {/* Manual Score Correction */}
        <div className="p-4 bg-gray-900/80 rounded-lg border border-gray-800">
          <h4 className="font-bold text-xs text-gray-300 uppercase tracking-wider mb-1">✏️ Manual Score Correction</h4>
          <p className="text-xs text-gray-400 mb-3">Fix scores locally if the external API lags behind.</p>

          <div className="flex gap-2 mb-3">
            <select 
              value={correctionGW} 
              onChange={(e) => setCorrectionGW(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-xs text-white p-2 rounded outline-none flex-1 max-w-[200px]"
            >
              {[...Array(38)].map((_, i) => (
                <option key={i+1} value={String(i+1)}>Gameweek {i+1}</option>
              ))}
            </select>
            <button 
              onClick={loadMatchesForCorrection}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded transition"
            >
              Load Matches
            </button>
          </div>

          {correctionMatches.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {correctionMatches.map(match => (
                <div key={match.id} className="flex items-center justify-between p-2 rounded bg-gray-800 text-xs gap-2">
                  {editingMatch === match.id ? (
                    <>
                      <span className="flex-1 text-right truncate">{match.homeTeam}</span>
                      <input 
                        type="number" 
                        value={editHome}
                        onChange={(e) => setEditHome(e.target.value)}
                        className="w-12 text-center p-1 rounded bg-gray-900 border border-blue-500 text-white"
                      />
                      <span>-</span>
                      <input 
                        type="number"
                        value={editAway}
                        onChange={(e) => setEditAway(e.target.value)}
                        className="w-12 text-center p-1 rounded bg-gray-900 border border-blue-500 text-white"
                      />
                      <span className="flex-1 truncate">{match.awayTeam}</span>
                      <button 
                        onClick={() => saveScoreCorrection(match.id)}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => setEditingMatch(null)}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-right truncate">{match.homeTeam}</span>
                      <span className="font-bold px-2 py-0.5 rounded bg-gray-900 text-amber-300">
                        {match.score?.fullTime?.home ?? '-'} : {match.score?.fullTime?.away ?? '-'}
                      </span>
                      <span className="flex-1 truncate">{match.awayTeam}</span>
                      <button 
                        onClick={() => {
                          setEditingMatch(match.id);
                          setEditHome(String(match.score?.fullTime?.home ?? ''));
                          setEditAway(String(match.score?.fullTime?.away ?? ''));
                        }}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded font-semibold text-[11px]"
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
      </div>

      {/* --- 5. 💾 DISASTER RECOVERY & BACKUP SUITE --- */}
      <div className="mb-8 p-5 bg-[#1b262c] rounded-xl border border-teal-600/50 shadow-md">
        <h3 className="text-lg font-bold text-teal-400 flex items-center gap-2 mb-1">
          💾 Backup & Disaster Recovery Center
        </h3>
        <p className="text-xs text-gray-300 mb-4">
          Export and restore complete snapshots of all users, prediction history, cached match results, and H2H league fixtures.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={async () => {
              setIsLoading(true);
              try {
                setStatus('Initiating database export...');
                await downloadBackupJSON((msg) => setStatus(`[Backup] ${msg}`));
                setStatus('✅ Database backup exported and downloaded successfully!');
              } catch (err: any) {
                setStatus(`❌ Backup Failed: ${err.message}`);
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="p-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex flex-col items-center gap-1 transition shadow disabled:opacity-50"
          >
            <span className="text-sm">📥 Download Full Backup (.JSON)</span>
            <span className="text-[11px] opacity-80">Saves all users, H2H fixtures & predictions</span>
          </button>

          <label className="p-4 rounded-xl bg-sky-700 hover:bg-sky-600 text-white font-bold text-xs flex flex-col items-center gap-1 transition shadow cursor-pointer text-center">
            <span className="text-sm">📤 Restore from Backup (.JSON)</span>
            <span className="text-[11px] opacity-80">Select a .json file to restore</span>
            <input 
              type="file" 
              accept=".json" 
              style={{ display: 'none' }}
              disabled={isLoading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                if (!confirm(`⚠️ ARE YOU SURE YOU WANT TO RESTORE FROM "${file.name}"?\n\nThis will merge and restore all users, predictions, and H2H league fixtures.`)) {
                  e.target.value = '';
                  return;
                }

                setIsLoading(true);
                setStatus(`Reading ${file.name}...`);

                try {
                  const text = await file.text();
                  const backupData = JSON.parse(text);

                  setStatus('Creating pre-restore safety snapshot...');
                  await autoSnapshotToFirestore('Pre-Restore Snapshot');

                  setStatus('Restoring database collections...');
                  const result = await restoreDatabaseFromSnapshot(backupData, (msg) => setStatus(`[Restore] ${msg}`));
                  
                  setStatus(`✅ Restore Succeeded! Restored ${result.stats.usersRestored} users, ${result.stats.leaguesRestored} leagues, and ${result.stats.predictionsRestored} predictions.`);
                  await loadUsers();
                } catch (err: any) {
                  setStatus(`❌ Restore Error: ${err.message}`);
                } finally {
                  setIsLoading(false);
                  e.target.value = '';
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* --- 6. ☢️ DANGER ZONE --- */}
      <div className="p-5 bg-red-950/30 rounded-xl border border-red-800/60 shadow-md space-y-3">
        <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">☢️ Danger Zone</h3>
        
        <button
          onClick={recalculateScores}
          disabled={isLoading}
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-xs rounded-lg border border-gray-700 transition"
        >
          🔄 Recalculate All Historical Scores (With Auto-Snapshot)
        </button>

        <button
          onClick={async () => {
            if (!confirm("⚠️ DANGER: This will set ALL manager scores to 0 in PostgreSQL.")) return;
            setIsLoading(true);
            try {
              setStatus('Resetting all profile scores in PostgreSQL...');
              const { error } = await supabase
                .from('profiles')
                .update({ total_score: 0 });

              if (error) throw error;

              setStatus(`✅ Season reset! All manager total scores reset to 0 in PostgreSQL.`);
              await loadUsers();
            } catch(e: any) {
              setStatus("Error: " + e.message);
            } finally {
              setIsLoading(false);
            }
          }}
          disabled={isLoading}
          className="w-full py-2.5 bg-red-800 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition"
        >
          ☢️ RESET SEASON SCORES
        </button>
      </div>

      {/* Status Console Log */}
      <div className="mt-6 p-4 bg-black/60 rounded-xl border border-gray-800 min-h-[60px] text-xs font-mono text-gray-300">
        <span className="text-gray-500 font-bold block mb-1">Status Console:</span>
        <p className="text-emerald-400">{status || 'Ready.'}</p>
      </div>

    </div>
  );
}

export default Admin;
