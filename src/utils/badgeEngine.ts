// Manager Badge & Achievement Computation Engine

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  gradient: string;
  unlocked: boolean;
  count?: number;
}

export const computeManagerBadges = (
  predictions: any[],
  matches: any[],
  totalScore: number,
  rank?: number
): Badge[] => {
  const matchMap: Record<string, any> = {};
  matches.forEach(m => {
    matchMap[String(m.id)] = m;
  });

  let exactScoresCount = 0;
  let underdogHitsCount = 0;
  let goalFestHitsCount = 0;
  let totalPredicted = predictions.length;

  predictions.forEach(p => {
    const actual = matchMap[String(p.match_id)];
    if (actual && actual.status === 'FINISHED' && actual.score?.fullTime?.home !== null) {
      const predH = p.home_score;
      const predA = p.away_score;
      const actH = actual.score.fullTime.home;
      const actA = actual.score.fullTime.away;

      // 1. Exact Score Check
      if (predH === actH && predA === actA) {
        exactScoresCount++;
      }

      // 2. Underdog Prediction Check (odds >= 2.5 on winning team)
      const predOutcome = predH > predA ? 'H' : predA > predH ? 'A' : 'D';
      const actOutcome = actH > actA ? 'H' : actA > actH ? 'A' : 'D';

      if (predOutcome === actOutcome && actOutcome !== 'D') {
        const winningOdds = actOutcome === 'H' ? actual.odds?.homeWin : actual.odds?.awayWin;
        if (winningOdds && winningOdds >= 2.5) {
          underdogHitsCount++;
        }
      }

      // 3. Goal-Fest Prediction (total goals >= 4)
      if (predH + predA >= 4 && actH + actA >= 4 && predOutcome === actOutcome) {
        goalFestHitsCount++;
      }
    }
  });

  const badges: Badge[] = [
    {
      id: 'exact_sniper',
      name: 'Score Sniper',
      emoji: '🎯',
      description: 'Predicted an exact full-time match scoreline',
      rarity: 'rare',
      gradient: 'from-amber-500 to-orange-600',
      unlocked: exactScoresCount > 0,
      count: exactScoresCount
    },
    {
      id: 'underdog_whisperer',
      name: 'Giant Slayer',
      emoji: '🐺',
      description: 'Correctly predicted an underdog upset win (odds >= 2.5)',
      rarity: 'epic',
      gradient: 'from-purple-500 to-indigo-600',
      unlocked: underdogHitsCount > 0,
      count: underdogHitsCount
    },
    {
      id: 'goalfest_prophet',
      name: 'Goal-Fest Prophet',
      emoji: '🚀',
      description: 'Accurately predicted a high-scoring thriller (4+ goals)',
      rarity: 'rare',
      gradient: 'from-rose-500 to-red-600',
      unlocked: goalFestHitsCount > 0,
      count: goalFestHitsCount
    },
    {
      id: 'podium_master',
      name: 'Top 3 Manager',
      emoji: '👑',
      description: 'Achieved Top 3 placement on the overall leaderboard',
      rarity: 'legendary',
      gradient: 'from-yellow-400 to-amber-600',
      unlocked: Boolean(rank && rank <= 3),
      count: rank ? rank : undefined
    },
    {
      id: 'century_club',
      name: 'Century Club',
      emoji: '💎',
      description: 'Accumulated 100+ total fantasy points',
      rarity: 'legendary',
      gradient: 'from-cyan-400 to-blue-600',
      unlocked: totalScore >= 100,
      count: totalScore
    },
    {
      id: 'punctual_tactician',
      name: 'Master Tactician',
      emoji: '⚡',
      description: 'Submitted 10 complete match predictions in a round',
      rarity: 'common',
      gradient: 'from-emerald-400 to-teal-600',
      unlocked: totalPredicted >= 10,
      count: totalPredicted
    }
  ];

  return badges;
};
