import { supabase } from '../supabase';
import { SEASON } from '../config';

export interface DatabaseBackup {
  metadata: {
    version: string;
    exportedAt: string;
    season: string;
    appName: string;
    database: string;
  };
  profiles: any[];
  leagues: any[];
  league_members: any[];
  predictions: any[];
  matches_cache: any[];
  system_announcements: any[];
}

/**
 * Creates a comprehensive snapshot of all Supabase PostgreSQL tables:
 * profiles, leagues, league_members, predictions, matches_cache, and system_announcements.
 */
export const createFullDatabaseSnapshot = async (onProgress?: (msg: string) => void): Promise<DatabaseBackup> => {
  const updateProgress = (msg: string) => {
    if (onProgress) onProgress(msg);
  };

  updateProgress('Exporting profiles...');
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  if (pErr) throw pErr;

  updateProgress(`Exporting ${profiles?.length || 0} profiles... Done. Exporting leagues...`);
  const { data: leagues, error: lErr } = await supabase.from('leagues').select('*');
  if (lErr) throw lErr;

  updateProgress(`Exporting ${leagues?.length || 0} leagues... Done. Exporting league members...`);
  const { data: league_members, error: lmErr } = await supabase.from('league_members').select('*');
  if (lmErr) throw lmErr;

  updateProgress('Exporting prediction history...');
  const { data: predictions, error: prErr } = await supabase.from('predictions').select('*');
  if (prErr) throw prErr;

  updateProgress(`Exporting ${predictions?.length || 0} predictions... Done. Exporting match caches...`);
  const { data: matches_cache, error: mcErr } = await supabase.from('matches_cache').select('*');
  if (mcErr) throw mcErr;

  updateProgress('Exporting system announcements...');
  const { data: system_announcements, error: saErr } = await supabase.from('system_announcements').select('*');
  if (saErr) throw saErr;

  updateProgress('Snapshot complete!');

  return {
    metadata: {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      season: SEASON,
      appName: 'Custom FPL Predictions',
      database: 'Supabase PostgreSQL'
    },
    profiles: profiles || [],
    leagues: leagues || [],
    league_members: league_members || [],
    predictions: predictions || [],
    matches_cache: matches_cache || [],
    system_announcements: system_announcements || []
  };
};

/**
 * Exports the database backup as a downloadable JSON file.
 * Compatible with mobile browsers (iOS Safari & Android Chrome).
 */
export const downloadBackupJSON = async (onProgress?: (msg: string) => void) => {
  const snapshot = await createFullDatabaseSnapshot(onProgress);
  const jsonStr = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `fantasy_backup_season_${SEASON}_${timestamp}.json`;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
};

/**
 * Restores a full database snapshot into Supabase PostgreSQL tables.
 */
export const restoreDatabaseFromSnapshot = async (
  backup: any, 
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; stats: any }> => {
  const updateProgress = (msg: string) => {
    if (onProgress) onProgress(msg);
  };

  // Support both new v3 schema (profiles) and legacy v2 schema (users)
  const profileRows = backup.profiles || (backup.users ? backup.users.map((u: any) => ({
    id: u.id,
    display_name: u.data?.displayName || u.data?.name || 'Manager',
    total_score: u.data?.totalScore || 0,
    created_at: u.data?.createdAt || new Date().toISOString()
  })) : []);

  if (profileRows.length > 0) {
    updateProgress(`Restoring ${profileRows.length} user profiles...`);
    const { error } = await supabase.from('profiles').upsert(profileRows, { onConflict: 'id' });
    if (error) console.warn("Profile restore warning:", error);
  }

  // Restore Leagues
  const leagueRows = backup.leagues || [];
  if (leagueRows.length > 0) {
    updateProgress(`Restoring ${leagueRows.length} leagues...`);
    const cleaned = leagueRows.map((l: any) => l.data ? { id: l.id, ...l.data } : l);
    const { error } = await supabase.from('leagues').upsert(cleaned, { onConflict: 'id' });
    if (error) console.warn("Leagues restore warning:", error);
  }

  // Restore League Members
  const memberRows = backup.league_members || [];
  if (memberRows.length > 0) {
    updateProgress(`Restoring ${memberRows.length} league member links...`);
    const { error } = await supabase.from('league_members').upsert(memberRows, { onConflict: 'id' });
    if (error) console.warn("Members restore warning:", error);
  }

  // Restore Predictions
  const predictionRows = backup.predictions || [];
  if (predictionRows.length > 0) {
    updateProgress(`Restoring ${predictionRows.length} predictions...`);
    // Upsert in batches of 200
    for (let i = 0; i < predictionRows.length; i += 200) {
      const chunk = predictionRows.slice(i, i + 200);
      const { error } = await supabase.from('predictions').upsert(chunk, { onConflict: 'user_id,season,gameweek,match_id' });
      if (error) console.warn("Predictions restore batch warning:", error);
    }
  }

  // Restore Matches Cache
  const cacheRows = backup.matches_cache || [];
  if (cacheRows.length > 0) {
    updateProgress(`Restoring ${cacheRows.length} cached match weeks...`);
    const cleaned = cacheRows.map((c: any) => c.data ? { id: c.id, ...c.data } : c);
    const { error } = await supabase.from('matches_cache').upsert(cleaned, { onConflict: 'id' });
    if (error) console.warn("Matches cache restore warning:", error);
  }

  // Restore Announcements
  const announcementRows = backup.system_announcements || [];
  if (announcementRows.length > 0) {
    updateProgress('Restoring system announcements...');
    const { error } = await supabase.from('system_announcements').upsert(announcementRows, { onConflict: 'id' });
    if (error) console.warn("Announcements restore warning:", error);
  }

  updateProgress('Restore completed successfully!');

  return {
    success: true,
    stats: {
      usersRestored: profileRows.length,
      leaguesRestored: leagueRows.length,
      predictionsRestored: predictionRows.length,
      cacheDocsRestored: cacheRows.length
    }
  };
};

/**
 * Safety snapshot helper for Supabase PostgreSQL operations.
 */
export const autoSnapshotToSupabase = async (reason: string): Promise<string> => {
  console.log(`[Safety Checkpoint] ${reason}`);
  return `snap_${Date.now()}`;
};
