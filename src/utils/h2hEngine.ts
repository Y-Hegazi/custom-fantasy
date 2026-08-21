/**
 * Head-to-Head (H2H) Fixtures & Tournament Engine
 * Implements deterministic Round-Robin schedule for up to 38 gameweeks.
 */

export interface H2HMatchup {
  player1: string;
  player2: string;
}

export function generateH2HFixtures(memberIds: string[], totalRounds: number = 38): Record<string, H2HMatchup[]> {
  if (!memberIds || memberIds.length < 2) return {};

  // Sort IDs deterministically so every user sees identical fixtures
  const pool = [...memberIds].sort();
  
  // If odd count of players, add the 'AVERAGE' ghost bot
  if (pool.length % 2 !== 0) {
    pool.push('AVERAGE');
  }

  const n = pool.length;
  const roundsPerCycle = n - 1;
  const schedule: Record<string, H2HMatchup[]> = {};

  for (let round = 1; round <= totalRounds; round++) {
    const roundIdx = (round - 1) % roundsPerCycle;
    const matchups: H2HMatchup[] = [];

    for (let i = 0; i < n / 2; i++) {
      let p1: string;
      let p2: string;

      if (i === 0) {
        p1 = pool[0];
        p2 = pool[(roundIdx) % (n - 1) + 1];
      } else {
        const idx1 = (roundIdx + i) % (n - 1) + 1;
        const idx2 = (roundIdx + (n - 1 - i)) % (n - 1) + 1;
        p1 = pool[idx1];
        p2 = pool[idx2];
      }

      // Alternate home and away on successive cycles
      const cycle = Math.floor((round - 1) / roundsPerCycle);
      if (cycle % 2 === 1) {
        matchups.push({ player1: p2, player2: p1 });
      } else {
        matchups.push({ player1: p1, player2: p2 });
      }
    }

    schedule[String(round)] = matchups;
  }

  return schedule;
}
