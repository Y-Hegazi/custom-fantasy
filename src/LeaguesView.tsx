import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import './App.css';

interface LeaguesViewProps {
  user: any;
  onSelectLeague: (league: any | null) => void;
}

function LeaguesView({ user, onSelectLeague }: LeaguesViewProps) {
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');
  const [myLeagues, setMyLeagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Inputs
  const [newLeagueName, setNewLeagueName] = useState('');
  const [leagueType, setLeagueType] = useState<'classic' | 'h2h'>('classic');
  const [joinCode, setJoinCode] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const userId = user?.uid || user?.id;

  // Auto-fill join code from URL params (e.g. /leagues?join=CODE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      setJoinCode(code.trim().toUpperCase());
      setMode('join');
    }
  }, []);

  const fetchMyLeagues = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Get leagues where user is a member
      const { data: memberRows, error: mErr } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('user_id', userId);

      if (mErr) throw mErr;

      const leagueIds = (memberRows || []).map(r => r.league_id);
      if (leagueIds.length === 0) {
        setMyLeagues([]);
        setLoading(false);
        return;
      }

      // 2. Fetch league details
      const { data: leagues, error: lErr } = await supabase
        .from('leagues')
        .select('*')
        .in('id', leagueIds);

      if (lErr) throw lErr;

      // 3. For each league, count members
      const leaguesWithCounts = await Promise.all((leagues || []).map(async (l) => {
        const { count } = await supabase
          .from('league_members')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', l.id);

        return {
          ...l,
          adminId: l.created_by,
          membersCount: count || 1,
        };
      }));

      setMyLeagues(leaguesWithCounts);
    } catch (err: any) {
      console.error("Error fetching leagues:", err);
      setError("Failed to load your leagues.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMyLeagues();
  }, [fetchMyLeagues]);

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeagueName.trim() || !userId) return;

    setLoading(true);
    setError('');

    try {
      // Generate clean 6-character code
      const code = `PF-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // 1. Insert league in Supabase
      const { data: newLeague, error: lErr } = await supabase
        .from('leagues')
        .insert({
          name: newLeagueName.trim(),
          code: code,
          type: leagueType,
          created_by: userId,
        })
        .select()
        .single();

      if (lErr) throw lErr;

      // 2. Insert creator into league_members
      const { error: mErr } = await supabase
        .from('league_members')
        .insert({
          league_id: newLeague.id,
          user_id: userId,
        });

      if (mErr) console.warn("Member insert:", mErr);

      await fetchMyLeagues();
      setMode('list');
      setNewLeagueName('');
      setLeagueType('classic');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create league.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !userId) return;
    
    setLoading(true);
    setError('');

    try {
      const cleanCode = joinCode.trim().toUpperCase();

      // 1. Find league by code
      const { data: league, error: lErr } = await supabase
        .from('leagues')
        .select('*')
        .eq('code', cleanCode)
        .single();

      if (lErr || !league) {
        setError("Invalid League Code. Please check and try again.");
        setLoading(false);
        return;
      }

      // 2. Check if already member
      const { data: existing } = await supabase
        .from('league_members')
        .select('*')
        .eq('league_id', league.id)
        .eq('user_id', userId)
        .single();

      if (existing) {
        setError("You are already a member of this league.");
        setLoading(false);
        return;
      }

      // 3. Join league
      const { error: joinErr } = await supabase
        .from('league_members')
        .insert({
          league_id: league.id,
          user_id: userId,
        });

      if (joinErr) throw joinErr;

      await fetchMyLeagues();
      setMode('list');
      setJoinCode('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to join league.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLeague = async (leagueId: string, leagueName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${leagueName}"? This cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      const { error: delErr } = await supabase
        .from('leagues')
        .delete()
        .eq('id', leagueId);

      if (delErr) throw delErr;

      await fetchMyLeagues();
      onSelectLeague(null);
    } catch (err: any) {
      console.error("Error deleting league:", err);
      setError("Failed to delete league.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="leagues-container">
      {error && <div className="error-message">{error}</div>}

      {/* --- LIST VIEW --- */}
      {mode === 'list' && (
        <div className="leagues-list">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Your Mini-Leagues</h3>
            <span className="text-xs text-gray-400 font-mono">SUPABASE POSTGRES</span>
          </div>
          
          {myLeagues.length === 0 ? (
            <div className="bg-gray-800/60 p-6 rounded-xl border border-gray-700/50 text-center mb-6">
              <p className="text-gray-400 text-sm">You haven't joined any custom leagues yet.</p>
              <p className="text-xs text-gray-500 mt-1">Create one for your friends or enter an invite code below!</p>
            </div>
          ) : (
            <div className="league-cards-grid">
              {/* Global Overall switch back */}
              <div className="league-card" onClick={() => onSelectLeague(null)}>
                <h4>🌍 Global League</h4>
                <span className="league-code">Public</span>
              </div>

              {myLeagues.map(league => (
                <div key={league.id} className="league-card" onClick={() => onSelectLeague(league)}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <h4>{league.type === 'h2h' ? '⚔️' : '🏆'} {league.name}</h4>
                    {league.type === 'h2h' ? <span className="h2h-badge">H2H</span> : <span className="text-xs text-blue-400 font-bold">Classic</span>}
                  </div>
                  
                  <div style={{display:'flex', alignItems:'center', gap:'8px', marginTop:'8px'}}>
                    <span className="league-code">Code: {league.code}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(league.code);
                        setCopyFeedback(`code-${league.id}`);
                        setTimeout(() => setCopyFeedback(null), 2000);
                      }}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white"
                      title="Copy Code"
                    >
                      {copyFeedback === `code-${league.id}` ? '✅ Copied' : '📋 Code'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const inviteUrl = `${window.location.origin}/leagues?join=${league.code}`;
                        navigator.clipboard.writeText(inviteUrl);
                        setCopyFeedback(`link-${league.id}`);
                        setTimeout(() => setCopyFeedback(null), 2000);
                      }}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white"
                      title="Copy Direct Invite Link"
                    >
                      {copyFeedback === `link-${league.id}` ? '✅ Link Copied' : '🔗 Link'}
                    </button>
                  </div>

                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-700/50 text-xs text-gray-400">
                    <span>👥 {league.membersCount || 1} Members</span>
                    {league.adminId === userId && (
                      <button 
                        className="text-red-400 hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLeague(league.id, league.name);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="league-actions mt-6 flex gap-3">
            <button onClick={() => setMode('create')} className="secondary-button flex-1">Create League</button>
            <button onClick={() => setMode('join')} className="secondary-button flex-1">Join with Code</button>
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
                placeholder="e.g. Office Champions"
                maxLength={30}
                required
                autoFocus
              />
            </div>
            
            <div className="input-group">
              <label>League Format</label>
              <div className="radio-group">
                <label className={`radio-option ${leagueType === 'classic' ? 'selected' : ''}`}>
                  <input 
                    type="radio" 
                    name="leagueType" 
                    value="classic" 
                    checked={leagueType === 'classic'} 
                    onChange={() => setLeagueType('classic')}
                  />
                  🏆 Classic League
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
                  <span style={{fontSize:'0.8rem', display:'block', color:'#aaa'}}>Weekly 1v1 Matchups (3pts Win)</span>
                </label>
              </div>
            </div>

            <button type="submit" className="auth-button primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create League 🚀'}
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
                placeholder="e.g. PF-9X2L"
                maxLength={10}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="auth-button primary" disabled={loading}>
              {loading ? 'Joining...' : 'Join League ⚽'}
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
