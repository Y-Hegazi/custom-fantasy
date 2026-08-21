import React from 'react';

function RulesView() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 text-gray-200">
      
      {/* Hero Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-900/60 via-purple-900/40 to-emerald-900/40 border border-blue-500/30 shadow-xl text-center">
        <h2 className="text-3xl font-extrabold text-white mb-2">📖 Official Rules & Scoring Guide</h2>
        <p className="text-sm text-gray-300 max-w-xl mx-auto">
          Welcome to the Premier League Prediction League! Here is everything you need to know about predicting, point multipliers, match deadlines, and winning your mini-leagues.
        </p>
      </div>

      {/* --- SECTION 1: BASE POINTS --- */}
      <div className="p-5 rounded-xl bg-gray-900/90 border border-gray-800 shadow-md">
        <h3 className="text-xl font-bold text-blue-400 flex items-center gap-2 mb-3">
          🎯 1. Standard Point Scoring
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          For every Premier League match in each gameweek, submit your predicted final score before the deadline.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
            <div className="text-2xl font-black text-emerald-400 mb-1">3 Points</div>
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-1">🎯 Exact Score</div>
            <p className="text-[11px] text-gray-300">
              You correctly predict the exact home & away goals. (e.g. Predicted 2-1, ended 2-1).
            </p>
          </div>

          <div className="p-4 rounded-lg bg-blue-950/40 border border-blue-500/30">
            <div className="text-2xl font-black text-blue-400 mb-1">1 Point</div>
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-1">✅ Correct Outcome</div>
            <p className="text-[11px] text-gray-300">
              You picked the correct winner or draw, but not the exact score. (e.g. Predicted 3-0, ended 1-0).
            </p>
          </div>

          <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700">
            <div className="text-2xl font-black text-gray-500 mb-1">0 Points</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">❌ Incorrect</div>
            <p className="text-[11px] text-gray-400">
              The match outcome differed from your prediction. (e.g. Predicted 2-0 Home Win, ended in a 1-1 Draw).
            </p>
          </div>
        </div>
      </div>

      {/* --- SECTION 2: MULTIPLIERS & BONUSES --- */}
      <div className="p-5 rounded-xl bg-gray-900/90 border border-gray-800 shadow-md space-y-4">
        <div>
          <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2 mb-1">
            ⚡ 2. Dynamic Odds & Multipliers (2x & 4x)
          </h3>
          <p className="text-xs text-gray-400">
            Smart underdog picks and high-scoring predictions trigger massive automatic point boosts!
          </p>
        </div>

        <div className="space-y-3">
          
          {/* Underdog */}
          <div className="p-4 rounded-lg bg-purple-950/40 border border-purple-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-purple-500 text-purple-950">⚡ 2x MULTIPLIER</span>
                <span className="font-bold text-sm text-purple-200">Underdog & High-Odds Pick</span>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                If the match outcome had fixed decimal odds of <strong>&ge; 5.00</strong> (a genuine high-odds upset or massive underdog win), your earned points for that match are <strong>DOUBLED</strong>!
              </p>
            </div>
            <div className="text-right whitespace-nowrap text-xs font-mono font-bold text-purple-300">
              Exact = 6 pts<br />
              Outcome = 2 pts
            </div>
          </div>

          {/* Goal Fest */}
          <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-rose-500 text-rose-950">🔥 2x MULTIPLIER</span>
                <span className="font-bold text-sm text-rose-200">Goal Fest (5+ Total Goals)</span>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                If you correctly predict the exact score on any high-scoring match with <strong>5 or more combined goals</strong> (e.g. 3-2, 4-1, 3-3, 5-0), your points are <strong>DOUBLED</strong>!
              </p>
            </div>
            <div className="text-right whitespace-nowrap text-xs font-mono font-bold text-rose-300">
              Exact = 6 pts
            </div>
          </div>

          {/* Quadruple Jackpot */}
          <div className="p-4 rounded-lg bg-amber-950/50 border border-amber-500/60 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded bg-amber-400 text-gray-950 animate-pulse">💎 4x QUADRUPLE</span>
                <span className="font-bold text-sm text-amber-200">The Ultimate Jackpot (12 Points!)</span>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                Predict the exact score on a match that is <strong>BOTH an Underdog result (&ge; 5.00 odds) AND has 5+ total goals</strong> (e.g. Underdog wins 3-2 or 4-1).
              </p>
            </div>
            <div className="text-right whitespace-nowrap text-sm font-mono font-black text-amber-300">
              12 POINTS! 🚀
            </div>
          </div>

        </div>
      </div>

      {/* --- SECTION 3: DEADLINES & LOCKOUT --- */}
      <div className="p-5 rounded-xl bg-gray-900/90 border border-gray-800 shadow-md">
        <h3 className="text-xl font-bold text-teal-400 flex items-center gap-2 mb-3">
          ⏱️ 3. Match-by-Match Deadlines
        </h3>
        
        <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
          <p>
            • <strong>Individual Kickoff Cutoff:</strong> Each fixture locks independently <strong>5 minutes before its scheduled kickoff time</strong>.
          </p>
          <p>
            • <strong>Lineup Advantage:</strong> Official team starting lineups are released 60–75 minutes before kickoff, giving you plenty of time to submit or edit your pick before the 5-minute pre-match lock!
          </p>
          <p>
            • <strong>Flexibility for Busy Players:</strong> Missing a Friday night match will <em>never</em> lock your Saturday or Sunday predictions. Future matches remain open until their own 5-minute countdown concludes.
          </p>
          <p>
            • <strong>Rival Transparency:</strong> In mini-leagues, everyone's predictions for a match are unlocked and revealed the moment the 5-minute deadline arrives so you can follow the action together.
          </p>
        </div>
      </div>

      {/* --- SECTION 4: LEAGUES & HEAD-TO-HEAD --- */}
      <div className="p-5 rounded-xl bg-gray-900/90 border border-gray-800 shadow-md">
        <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2 mb-3">
          🏆 4. Leagues & Head-to-Head Formats
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-gray-800/80 border border-gray-700">
            <h4 className="font-bold text-white mb-1.5 flex items-center gap-1.5">
              📊 Classic Total Points Leagues
            </h4>
            <p className="text-gray-300">
              Compete on overall cumulative points across all 38 gameweeks. The player with the highest total score at the end of the season wins the crown!
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-gray-800/80 border border-gray-700">
            <h4 className="font-bold text-white mb-1.5 flex items-center gap-1.5">
              ⚔️ Head-to-Head (H2H) Leagues
            </h4>
            <p className="text-gray-300">
              Each gameweek you are paired 1-on-1 against another manager in your league.
            </p>
            <ul className="mt-2 space-y-1 text-gray-400">
              <li>• <strong>Win (Score &gt; Opponent):</strong> 3 League Points</li>
              <li>• <strong>Draw (Equal Scores):</strong> 1 League Point</li>
              <li>• <strong>Loss (Score &lt; Opponent):</strong> 0 League Points</li>
            </ul>
          </div>
        </div>
      </div>

      {/* --- SECTION 5: INSTALL APP (PWA) --- */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-gray-900 via-gray-850 to-gray-900 border border-gray-700 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs">
          <h4 className="font-bold text-white text-sm mb-1">📱 Install to Your Mobile Home Screen</h4>
          <p className="text-gray-400">
            Get the full native app experience without downloading from an app store:
          </p>
          <p className="text-gray-300 mt-1">
            <strong>iOS (Safari):</strong> Tap the <em>Share</em> button → <em>"Add to Home Screen"</em>.<br />
            <strong>Android (Chrome):</strong> Tap the three dots → <em>"Install App"</em> or <em>"Add to Home screen"</em>.
          </p>
        </div>
      </div>

    </div>
  );
}

export default RulesView;
