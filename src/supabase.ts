import { createClient } from '@supabase/supabase-js';

// Supabase configuration with baked-in defaults for standalone container builds
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://spyohjlqeisqybqpjbyb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_b3QUDgwI15MvcaLL9tsPfQ_zgc9KVXY';

export const isSupabaseConfigured = () => {
  return Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  total_score: number;
  created_at: string;
  updated_at: string;
}

export interface PredictionRow {
  id?: string;
  user_id: string;
  season: string;
  gameweek: number;
  match_id: string;
  home_score: number;
  away_score: number;
  points?: number;
  multiplier_badge?: string;
  updated_at?: string;
}

export interface LeagueRow {
  id: string;
  code: string;
  name: string;
  type: 'classic' | 'h2h';
  created_by: string;
  created_at: string;
}

export interface SystemAnnouncementRow {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  active: boolean;
  updated_at: string;
}
