export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

export interface MatchScore {
  fullTime: {
    home: number | null;
    away: number | null;
  }
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  date: string;
  timestamp: number;
  status: string;
  score: MatchScore;
  hasManualOverride?: boolean;
  odds?: {
    home: number;
    draw: number;
    away: number;
  };
}

export interface PredictionsMap {
  [matchId: string]: {
    home: string | number;
    away: string | number;
  }
}

export interface League {
  id: string;
  name: string;
  code: string;
  adminId: string;
  members: string[];
  type?: 'classic' | 'h2h';
  fixtures?: Record<string, H2HFixture[]>;
}

export interface H2HFixture {
  player1: string;
  player2: string;
  player1Score?: number;
  player2Score?: number;
}
