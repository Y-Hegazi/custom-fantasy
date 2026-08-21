import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

interface AuthOverlayProps {
  initialUser?: any;
  onSuccess?: () => void;
}

export const AuthOverlay: React.FC<AuthOverlayProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Check URL params for errors or verification tokens on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errDesc = params.get('error_description');
    const errCode = params.get('error_code');
    if (errDesc || errCode) {
      if (errCode === 'bad_oauth_state' || (errDesc && errDesc.includes('expired'))) {
        setError('Login session expired. Please sign in again.');
      } else {
        setError(errDesc || 'Authentication error occurred.');
      }
      // Clean query params from URL cleanly without reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const clearMessages = () => {
    setError('');
    setInfoMessage('');
  };

  const formatAuthError = (err: any, providerName: string) => {
    const msg = err?.message || '';
    if (msg.toLowerCase().includes('invalid login credentials')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (msg.toLowerCase().includes('user already registered')) {
      return 'An account with this email already exists. Please sign in instead.';
    }
    if (msg.toLowerCase().includes('password should be at least')) {
      return 'Password must be at least 6 characters long.';
    }
    if (msg.toLowerCase().includes('email not confirmed')) {
      return 'Your email address is not verified yet. Please check your inbox for the confirmation link.';
    }
    return msg || `${providerName} failed.`;
  };

  // 1. Google OAuth Sign-In
  const handleGoogleLogin = async () => {
    setLoading(true);
    clearMessages();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err, 'Google Sign-In'));
    } finally {
      setLoading(false);
    }
  };

  // 2. Email / Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      if (data?.user) {
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err, 'Email Sign-In'));
    } finally {
      setLoading(false);
    }
  };

  // 3. Email / Password Signup
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: displayName.trim() || email.trim().split('@')[0],
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;

      if (data.session) {
        setInfoMessage('Account created successfully! Loading dashboard...');
        if (onSuccess) onSuccess();
      } else {
        setMode('verify');
        setResendCooldown(60);
        setInfoMessage(`Verification link sent to ${email.trim()}! Please check your inbox.`);
      }
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err, 'Email Sign-Up'));
    } finally {
      setLoading(false);
    }
  };

  // 4. Resend Verification
  const handleResendVerification = async () => {
    if (!email) {
      setError('Please enter your email to resend confirmation.');
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setResendCooldown(60);
      setInfoMessage('New confirmation link sent! Please check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend confirmation email.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Password Reset
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your account email.');
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setInfoMessage('Password reset link sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-[#070b14] via-[#0d1527] to-[#070b14] text-white relative overflow-hidden font-sans">
      
      {/* Ambient background glow effects */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-1/4 w-[400px] h-[300px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        
        {/* Brand Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-emerald-400 p-[2px] shadow-lg shadow-blue-500/20 mb-3.5">
            <div className="w-full h-full bg-gray-950 rounded-2xl flex items-center justify-center text-3xl">
              ⚽
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white m-0">
            Prediction<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">Fantasy</span>
          </h1>

          <p className="text-xs sm:text-sm text-gray-400 font-medium mt-1.5 max-w-xs">
            Premier League Score Predictions & Custom Leagues
          </p>

          {/* Mini Feature Chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-950/70 border border-blue-800/60 text-[10px] font-semibold text-blue-300">
              ⚔️ H2H Leagues
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/60 text-[10px] font-semibold text-emerald-300">
              🎯 Live Odds Bonus
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-950/70 border border-purple-800/60 text-[10px] font-semibold text-purple-300">
              ⚡ Real-time Sync
            </span>
          </div>
        </div>

        {/* Auth Glass Card */}
        <div className="w-full bg-gray-900/90 border border-gray-800/90 rounded-2xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl">
          
          {/* Tab Switcher (Sign In vs Create Account) */}
          {mode !== 'forgot' && mode !== 'verify' && (
            <div className="flex bg-gray-950/80 p-1 rounded-xl mb-6 border border-gray-800">
              <button
                type="button"
                onClick={() => { setMode('login'); clearMessages(); }}
                className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white bg-transparent'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); clearMessages(); }}
                className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                  mode === 'signup'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white bg-transparent'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Error / Info Alerts */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <span className="flex-1 leading-relaxed font-medium">{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs flex items-start gap-2">
              <span className="text-base leading-none">✉️</span>
              <span className="flex-1 leading-relaxed font-medium">{infoMessage}</span>
            </div>
          )}

          {/* 1. Google 1-Click Button */}
          {mode !== 'forgot' && mode !== 'verify' && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.99]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Continue with Google
              </button>

              <div className="relative flex py-4 items-center">
                <div className="flex-grow border-t border-gray-800"></div>
                <span className="flex-shrink mx-3 text-[11px] text-gray-500 uppercase tracking-widest font-bold">Or with Email</span>
                <div className="flex-grow border-t border-gray-800"></div>
              </div>
            </div>
          )}

          {/* View: Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="manager@example.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Password</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); clearMessages(); }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold bg-transparent border-0 p-0"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition-all shadow-lg hover:shadow-blue-600/30 disabled:opacity-50 active:scale-[0.99] mt-2"
              >
                {loading ? 'Signing in...' : 'Sign In with Email'}
              </button>
            </form>
          )}

          {/* View: Signup Form */}
          {mode === 'signup' && (
            <form onSubmit={handleEmailSignup} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Manager / Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Hegazi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="manager@example.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Password (Min 6 chars)</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm transition-all shadow-lg hover:shadow-emerald-600/30 disabled:opacity-50 active:scale-[0.99] mt-2"
              >
                {loading ? 'Creating Account...' : 'Create Account 🚀'}
              </button>
            </form>
          )}

          {/* View: Verify Email */}
          {mode === 'verify' && (
            <div className="text-center space-y-4 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-2xl flex items-center justify-center mx-auto text-emerald-400">
                📬
              </div>
              <h3 className="font-bold text-base text-white">Check Your Inbox</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                We sent a verification link to <span className="font-bold text-blue-400">{email}</span>. Click it to activate your manager account!
              </p>

              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={loading || resendCooldown > 0}
                  className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold border border-gray-700 transition-all disabled:opacity-40"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email Link ✉️'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('login'); clearMessages(); }}
                  className="text-xs text-gray-400 hover:text-white block w-full py-1 bg-transparent border-0"
                >
                  ← Back to Sign In
                </button>
              </div>
            </div>
          )}

          {/* View: Forgot Password */}
          {mode === 'forgot' && (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Your Account Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="manager@example.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition-all shadow-lg hover:shadow-blue-600/30 disabled:opacity-50 active:scale-[0.99]"
              >
                {loading ? 'Sending Link...' : 'Send Reset Link ✉️'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setMode('login'); clearMessages(); }}
                  className="text-xs text-gray-400 hover:text-white font-semibold bg-transparent border-0"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <p className="text-[11px] text-gray-600 font-medium mt-6 text-center">
          PredictionFantasy · Real-time Premier League 2026/2027
        </p>

      </div>
    </div>
  );
};

export default AuthOverlay;
