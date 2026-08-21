import { supabase } from '../supabase';
import { calculatePredictionPoints, generateMatchOdds } from './oddsEngine';

export interface ScoreSettlementSummary {
  gameweek: number;
  season: string;
  totalPredictionsScored: number;
  totalUsersUpdated: number;
  topScorer: { name: string; points: number } | null;
}

/**
 * Executes a complete gameweek settlement:
 * 1. Fetches all finished match scores for the given gameweek.
 * 2. Fetches all user predictions for that gameweek.
 * 3. Evaluates points with odds multipliers & bonuses.
 * 4. Updates prediction points and re-aggregates total scores in PostgreSQL.
 */
export async function settleGameweekScores(gameweek: number, season: string = '2026'): Promise<ScoreSettlementSummary> {
  const gwNum = Number(gameweek);

  // 1. Fetch match cache for the gameweek
  const { data: cacheRow } = await supabase
    .from('matches_cache')
    .select('matches')
    .eq('id', `${season}_week_${gwNum}`)
    .single();

  const matches = cacheRow?.matches || [];
  const matchMap: Record<string, { home: number; away: number; odds?: any }> = {};

  matches.forEach((m: any) => {
    if (m.status === 'FINISHED' && m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null) {
      const odds = m.odds || generateMatchOdds(m.homeTeam?.name || '', m.awayTeam?.name || '', String(m.id));
      matchMap[String(m.id)] = {
        home: Number(m.score.fullTime.home),
        away: Number(m.score.fullTime.away),
        odds
      };
    }
  });

  // 2. Fetch all predictions for this gameweek
  const { data: predictions, error: predErr } = await supabase
    .from('predictions')
    .select('*')
    .eq('season', season)
    .eq('gameweek', gwNum);

  if (predErr) throw new Error(`Failed to fetch predictions: ${predErr.message}`);

  const userGameweekTotals: Record<string, number> = {};
  const predictionUpdates: any[] = [];

  // 3. Calculate points for each prediction
  (predictions || []).forEach((pred: any) => {
    const match = matchMap[String(pred.match_id)];
    if (!match) return; // Match not finished yet

    const scoreResult = calculatePredictionPoints(
      pred.home_score,
      pred.away_score,
      match.home,
      match.away,
      match.odds
    );

    const pts = scoreResult.totalPoints;
    const badge = scoreResult.badges.join(' | ') || null;

    predictionUpdates.push({
      id: pred.id,
      user_id: pred.user_id,
      season: pred.season,
      gameweek: pred.gameweek,
      match_id: pred.match_id,
      home_score: pred.home_score,
      away_score: pred.away_score,
      points: pts,
      multiplier_badge: badge,
      updated_at: new Date().toISOString()
    });

    userGameweekTotals[pred.user_id] = (userGameweekTotals[pred.user_id] || 0) + pts;
  });

  // 4. Batch update predictions
  if (predictionUpdates.length > 0) {
    const { error: upsertErr } = await supabase
      .from('predictions')
      .upsert(predictionUpdates, { onConflict: 'user_id,season,gameweek,match_id' });
    
    if (upsertErr) console.error("Error upserting scored predictions:", upsertErr);
  }

  // 5. Re-aggregate overall total scores across all gameweeks for affected users
  const userIds = Object.keys(userGameweekTotals);
  let topScorer: { name: string; points: number } | null = null;

  for (const uid of userIds) {
    // Sum all points for this user across the entire season
    const { data: allUserPreds } = await supabase
      .from('predictions')
      .select('points')
      .eq('user_id', uid)
      .eq('season', season);

    const totalSeasonPoints = (allUserPreds || []).reduce((acc, p) => acc + (p.points || 0), 0);

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ total_score: totalSeasonPoints, updated_at: new Date().toISOString() })
      .eq('id', uid)
      .select('display_name')
      .single();

    const gwPts = userGameweekTotals[uid];
    if (!topScorer || gwPts > topScorer.points) {
      topScorer = {
        name: updatedProfile?.display_name || 'Manager',
        points: gwPts
      };
    }
  }

  return {
    gameweek: gwNum,
    season,
    totalPredictionsScored: predictionUpdates.length,
    totalUsersUpdated: userIds.length,
    topScorer
  };
}
