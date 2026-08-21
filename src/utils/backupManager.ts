import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  writeBatch 
} from 'firebase/firestore';
import { SEASON } from '../config';

export interface DatabaseBackup {
  metadata: {
    version: string;
    exportedAt: string;
    season: string;
    appName: string;
  };
  users: Array<{ id: string; data: any }>;
  leagues: Array<{ id: string; data: any }>;
  gameweeks: Array<{ 
    id: string; 
    data: any; 
    predictions: Array<{ userId: string; data: any }> 
  }>;
  matches_cache: Array<{ id: string; data: any }>;
  system: Array<{ id: string; data: any }>;
}

/**
 * Creates a comprehensive snapshot of all collections:
 * Users, Leagues (with H2H fixtures), Gameweeks + Predictions, Matches Cache, and System settings.
 */
export const createFullDatabaseSnapshot = async (onProgress?: (msg: string) => void): Promise<DatabaseBackup> => {
  const updateProgress = (msg: string) => {
    if (onProgress) onProgress(msg);
  };

  updateProgress('Backing up users...');
  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs.map(d => ({ id: d.id, data: d.data() }));

  updateProgress(`Backing up ${users.length} users... Done. Backing up leagues...`);
  const leaguesSnap = await getDocs(collection(db, 'leagues'));
  const leagues = leaguesSnap.docs.map(d => ({ id: d.id, data: d.data() }));

  updateProgress(`Backing up ${leagues.length} leagues (including H2H fixtures)... Done.`);
  const gwSnap = await getDocs(collection(db, 'gameweeks'));
  const gameweeks: DatabaseBackup['gameweeks'] = [];

  for (let i = 0; i < gwSnap.docs.length; i++) {
    const gwDoc = gwSnap.docs[i];
    const gwId = gwDoc.id;
    updateProgress(`Backing up predictions for ${gwId} (${i + 1}/${gwSnap.docs.length})...`);
    
    const predSnap = await getDocs(collection(db, 'gameweeks', gwId, 'predictions'));
    const predictions = predSnap.docs.map(p => ({ userId: p.id, data: p.data() }));

    gameweeks.push({
      id: gwId,
      data: gwDoc.data(),
      predictions
    });
  }

  updateProgress('Backing up matches cache...');
  const cacheSnap = await getDocs(collection(db, 'matches_cache'));
  const matches_cache = cacheSnap.docs.map(d => ({ id: d.id, data: d.data() }));

  updateProgress('Backing up system status & overrides...');
  const systemSnap = await getDocs(collection(db, 'system'));
  const system = systemSnap.docs.map(d => ({ id: d.id, data: d.data() }));

  updateProgress('Snapshot complete!');

  return {
    metadata: {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      season: SEASON,
      appName: 'Custom FPL Predictions'
    },
    users,
    leagues,
    gameweeks,
    matches_cache,
    system
  };
};

/**
 * Exports the database backup as a downloadable JSON file.
 */
export const downloadBackupJSON = async (onProgress?: (msg: string) => void) => {
  const snapshot = await createFullDatabaseSnapshot(onProgress);
  const jsonStr = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `fpl_backup_season_${SEASON}_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Restores a full database snapshot from a parsed JSON object.
 * Writes users, leagues, gameweeks (with predictions), matches_cache, and system settings.
 */
export const restoreDatabaseFromSnapshot = async (
  backup: DatabaseBackup, 
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; stats: any }> => {
  const updateProgress = (msg: string) => {
    if (onProgress) onProgress(msg);
  };

  if (!backup.metadata || !backup.users || !backup.leagues || !backup.gameweeks) {
    throw new Error('Invalid backup file format: Missing essential collections.');
  }

  let totalPredictionsRestored = 0;

  // 1. Restore Users
  updateProgress(`Restoring ${backup.users.length} users...`);
  let batch = writeBatch(db);
  let opCount = 0;

  for (const user of backup.users) {
    batch.set(doc(db, 'users', user.id), user.data, { merge: true });
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }
  if (opCount > 0) {
    await batch.commit();
    batch = writeBatch(db);
    opCount = 0;
  }

  // 2. Restore Leagues (Crucial for H2H fixtures & records)
  updateProgress(`Restoring ${backup.leagues.length} leagues (H2H & Classic)...`);
  for (const league of backup.leagues) {
    batch.set(doc(db, 'leagues', league.id), league.data, { merge: true });
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }
  if (opCount > 0) {
    await batch.commit();
    batch = writeBatch(db);
    opCount = 0;
  }

  // 3. Restore Matches Cache
  if (backup.matches_cache) {
    updateProgress(`Restoring ${backup.matches_cache.length} cached gameweek matches...`);
    for (const cache of backup.matches_cache) {
      batch.set(doc(db, 'matches_cache', cache.id), cache.data, { merge: true });
      opCount++;
      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }
    if (opCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  // 4. Restore System Docs
  if (backup.system) {
    updateProgress('Restoring system configs & overrides...');
    for (const sys of backup.system) {
      batch.set(doc(db, 'system', sys.id), sys.data, { merge: true });
      opCount++;
    }
    if (opCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  // 5. Restore Gameweeks & Subcollection Predictions
  for (let i = 0; i < backup.gameweeks.length; i++) {
    const gw = backup.gameweeks[i];
    updateProgress(`Restoring ${gw.id} (${gw.predictions?.length || 0} predictions)...`);

    // Write gameweek parent doc
    batch.set(doc(db, 'gameweeks', gw.id), gw.data || {}, { merge: true });
    opCount++;

    if (gw.predictions && Array.isArray(gw.predictions)) {
      for (const pred of gw.predictions) {
        batch.set(doc(db, 'gameweeks', gw.id, 'predictions', pred.userId), pred.data, { merge: true });
        opCount++;
        totalPredictionsRestored++;

        if (opCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  updateProgress('Restore completed successfully!');

  return {
    success: true,
    stats: {
      usersRestored: backup.users.length,
      leaguesRestored: backup.leagues.length,
      gameweeksRestored: backup.gameweeks.length,
      predictionsRestored: totalPredictionsRestored,
      cacheDocsRestored: backup.matches_cache?.length || 0
    }
  };
};

/**
 * Creates an in-database snapshot inside `_system_backups` collection
 * Automatically called prior to dangerous operations.
 */
export const autoSnapshotToFirestore = async (reason: string): Promise<string> => {
  const snapshot = await createFullDatabaseSnapshot();
  const timestamp = new Date().toISOString();
  const backupId = `auto_${SEASON}_${timestamp.replace(/[:.]/g, '-')}`;
  
  await setDoc(doc(db, '_system_backups', backupId), {
    ...snapshot,
    reason,
    createdTimestamp: Date.now()
  });

  return backupId;
};
