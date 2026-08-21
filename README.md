# ⚽ PredictionFantasy — Premier League Fantasy Predictions

A modern, real-time Premier League score prediction platform featuring live odds multipliers, private mini-leagues (Classic & Head-to-Head), Web Push deadline alerts, and automatic PostgreSQL data syncing.

Deployed live on Fly.io: [https://custom-fantasy-hegazi.fly.dev](https://custom-fantasy-hegazi.fly.dev)

---

## ✨ Features

### ⚔️ Game Modes
* **Classic Leagues**: Compete with friends based on total accumulated points throughout the season.
* **Head-to-Head Leagues**: Weekly 1v1 duels with automated 38-gameweek round-robin scheduling.
  * **Ghost Bot**: Automatically balances odd-numbered leagues with an Average Bot.
  * **Matchup Cards**: Real-time live duel scorecards on dashboard and league view.

### 🎯 Odds Multipliers & Scoring
* **Accurate Result (+3 Pts)**: Guessing the exact final scoreline.
* **Correct Outcome (+1 Pt)**: Guessing Win/Draw/Loss correctly.
* **Underdog Multipliers**: Earn up to 3x multiplier points when accurately predicting underdog triumphs based on live match odds.

### ⚡ Infrastructure & Realtime
* **Supabase PostgreSQL**: Scalable relational database with Row Level Security (RLS) and real-time event streaming.
* **Web Push Notifications**: Automatic 30-minute kickoff countdown alerts for unsubmitted predictions.
* **Background Matchday Worker**: Automated live score updates cached via Football-Data.org API.
* **Progressive Web App (PWA)**: Installable on iOS & Android with offline caching.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite 7, React Router 7
* **Backend / Database**: Supabase (PostgreSQL 15, Auth, RLS, Realtime)
* **Server Runtime**: Node.js 20, Web Push (VAPID), Docker, Fly.io (Multi-region `fra`)
* **Live Match Feed**: Football-Data.org API v4

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v20+)
* npm (v10+)
* Supabase Account & Project

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Y-Hegazi/custom-fantasy.git
   cd custom-fantasy
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your Supabase and API credentials:
   ```bash
   cp .env.example .env
   ```

4. **Start Vite Dev Server**:
   ```bash
   npm run dev
   ```

5. **Typecheck & Production Build**:
   ```bash
   npm run typecheck
   npm run build
   ```

---

## 📦 Deployment (Fly.io)

Deploy directly using Fly CLI and Docker:

```bash
fly deploy --config fly.toml
```
