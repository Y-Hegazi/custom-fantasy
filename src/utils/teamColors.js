export const TEAM_COLORS = {
    // Premier League 2024-25
    "Arsenal": "#EF0107",
    "Aston Villa": "#95BFE5", // Claret & Blue - opting for Blue for contrast or Claret #670E36
    "Bournemouth": "#DA291C",
    "Brentford": "#E30613",
    "Brighton": "#0057B8",
    "Chelsea": "#034694",
    "Crystal Palace": "#1B458F",
    "Everton": "#003399",
    "Fulham": "#000000", // White kit, black badge logic or just black for visibility
    "Ipswich": "#0054A6",
    "Leicester": "#0053A0",
    "Liverpool": "#C8102E",
    "Man City": "#6CABDD",
    "Man Utd": "#DA291C", // #DA291C is common red, specific is #C70101
    "Newcastle": "#241F20",
    "Nott'm Forest": "#DD0000",
    "Southampton": "#D71920",
    "Tottenham": "#132257", // Navy
    "West Ham": "#7A263A",
    "Wolves": "#FDB913",
    
    // Default fallback
    "default": "#38003c" // Premier League Purple
};

export const getTeamColor = (teamName) => {
    // Basic fuzzy match or direct lookup
    return TEAM_COLORS[teamName] || TEAM_COLORS["default"];
};

export const getMatchGradient = (homeTeam, awayTeam) => {
    const homeColor = getTeamColor(homeTeam);
    const awayColor = getTeamColor(awayTeam);
    // Create a subtle gradient from Left (Home) to Right (Away)
    // We use a high transparency to keep text readable, or border logic.
    // Let's try a border-left/right logic or a subtle background.
    return `linear-gradient(135deg, ${homeColor}22 0%, ${awayColor}22 100%)`; // 22 is ~13% opacity
};
