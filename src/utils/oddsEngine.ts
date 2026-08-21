export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

export interface PredictionScoreResult {
  basePoints: number;
  isExact: boolean;
  isOutcome: boolean;
  isHighOdds: boolean;
  isGoalFest: boolean;
  multiplier: number;
  totalPoints: number;
  badges: string[]; // e.g. ["⚡ 2x Underdog", "🔥 2x Goal Fest", "💎 4x JACKPOT"]
}

// Approximate Premier League team tier rankings for realistic deterministic odds
const TEAM_STRENGTH: Record<string, number> = {
  'Manchester City FC': 92,
  'Arsenal FC': 90,
  'Liverpool FC': 89,
  'Chelsea FC': 83,
  'Tottenham Hotspur FC': 82,
  'Newcastle United FC': 82,
  'Aston Villa FC': 83,
  'Manchester United FC': 81,
  'Brighton & Hove Albion FC': 78,
  'West Ham United FC': 77,
  'AFC Bournemouth': 76,
  'Fulham FC': 76,
  'Crystal Palace FC': 76,
  'Wolverhampton Wanderers FC': 75,
  'Everton FC': 74,
  'Brentford FC': 75,
  'Nottingham Forest FC': 74,
  'Leicester City FC': 72,
  'Ipswich Town FC': 70,
  'Southampton FC': 70
};

/**
 * Generates realistic decimal betting odds (e.g. 1.45, 4.20, 7.50) based on team ratings + home advantage.
 */
export const generateMatchOdds = (homeTeamName: string, awayTeamName: string, matchId?: string): MatchOdds => {
  const homeRating = (TEAM_STRENGTH[homeTeamName] || 75) + 4; // +4 Home advantage
  const awayRating = TEAM_STRENGTH[awayTeamName] || 75;

  const diff = homeRating - awayRating; // e.g. +15 or -10
  
  // Implied probability calculation
  let homeProb = 0.42 + (diff * 0.022);
  let awayProb = 0.32 - (diff * 0.018);
  let drawProb = 0.26 - (Math.abs(diff) * 0.004);

  // Normalize bounds
  homeProb = Math.max(0.10, Math.min(0.85, homeProb));
  awayProb = Math.max(0.08, Math.min(0.80, awayProb));
  drawProb = Math.max(0.12, Math.min(0.35, drawProb));
  
  const sum = homeProb + awayProb + drawProb;
  homeProb /= sum;
  awayProb /= sum;
  drawProb /= sum;

  // Bookmaker margin ~ 1.05
  const margin = 1.05;
  const homeOdds = Number((margin / homeProb).toFixed(2));
  const drawOdds = Number((margin / drawProb).toFixed(2));
  const awayOdds = Number((margin / awayProb).toFixed(2));

  return {
    home: Math.max(1.10, homeOdds),
    draw: Math.max(2.80, drawOdds),
    away: Math.max(1.15, awayOdds)
  };
};

/**
 * Returns the outcome code: 'H' (Home Win), 'D' (Draw), 'A' (Away Win)
 */
export const getOutcome = (home: number, away: number): 'H' | 'D' | 'A' => {
  if (home > away) return 'H';
  if (away > home) return 'A';
  return 'D';
};

export const UNDERDOG_ODDS_THRESHOLD = 5.00;

/**
 * Determines whether a specific outcome qualifies as an Underdog / High-Odds result.
 * Qualifying threshold: Odds >= 5.00 (a true massive upset or high-odds outcome).
 */
export const isUnderdogOutcome = (outcome: 'H' | 'D' | 'A', odds?: MatchOdds): boolean => {
  if (!odds) return false;
  if (outcome === 'H' && odds.home >= UNDERDOG_ODDS_THRESHOLD) return true;
  if (outcome === 'A' && odds.away >= UNDERDOG_ODDS_THRESHOLD) return true;
  if (outcome === 'D' && odds.draw >= UNDERDOG_ODDS_THRESHOLD) return true;
  return false;
};

/**
 * Comprehensive Multiplier Scoring Engine:
 * - Exact Score: 3 pts
 * - Correct Outcome: 1 pt
 * - ⚡ Underdog Multiplier: 2x
 * - 🔥 Goal Fest Multiplier (5+ total goals on Exact Score): 2x
 * - 💎 4x QUADRUPLE JACKPOT (Exact Score on 5+ Goal Underdog match): 4x (12 pts!)
 */
export const calculatePredictionPoints = (
  predHome: number | string | undefined | null,
  predAway: number | string | undefined | null,
  actualHome: number | string | undefined | null,
  actualAway: number | string | undefined | null,
  odds?: MatchOdds
): PredictionScoreResult => {
  const result: PredictionScoreResult = {
    basePoints: 0,
    isExact: false,
    isOutcome: false,
    isHighOdds: false,
    isGoalFest: false,
    multiplier: 1,
    totalPoints: 0,
    badges: []
  };

  if (
    predHome === undefined || predHome === null || predHome === '' ||
    predAway === undefined || predAway === null || predAway === '' ||
    actualHome === undefined || actualHome === null || actualHome === '' ||
    actualAway === undefined || actualAway === null || actualAway === ''
  ) {
    return result;
  }

  const pH = Number(predHome);
  const pA = Number(predAway);
  const aH = Number(actualHome);
  const aA = Number(actualAway);

  if (isNaN(pH) || isNaN(pA) || isNaN(aH) || isNaN(aA)) {
    return result;
  }

  const predOutcome = getOutcome(pH, pA);
  const actualOutcome = getOutcome(aH, aA);

  const isExact = (pH === aH && pA === aA);
  const isOutcome = (predOutcome === actualOutcome);

  if (isExact) {
    result.basePoints = 3;
    result.isExact = true;
    result.isOutcome = true;
  } else if (isOutcome) {
    result.basePoints = 1;
    result.isOutcome = true;
  } else {
    // Incorrect prediction
    return result;
  }

  // 1. High Odds / Underdog check
  const highOdds = isUnderdogOutcome(actualOutcome, odds);
  if (highOdds) {
    result.isHighOdds = true;
  }

  // 2. Goal Fest (5+ Goals) check (Only applies on Exact Score predictions as requested)
  const totalGoals = aH + aA;
  const is5PlusGoals = totalGoals >= 5;
  if (is5PlusGoals && isExact) {
    result.isGoalFest = true;
  }

  // 3. Compute Multiplier
  let mult = 1;
  if (result.isHighOdds && result.isGoalFest) {
    mult = 4; // 💎 4x JACKPOT
    result.badges.push('💎 4x JACKPOT');
  } else if (result.isHighOdds) {
    mult = 2; // ⚡ 2x Underdog
    result.badges.push('⚡ 2x Underdog');
  } else if (result.isGoalFest) {
    mult = 2; // 🔥 2x Goal Fest (5+ Goals)
    result.badges.push('🔥 2x Goal Fest');
  }

  result.multiplier = mult;
  result.totalPoints = result.basePoints * mult;

  return result;
};
