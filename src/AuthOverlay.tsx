import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

interface AuthOverlayProps {
  initialUser?: any;
  onSuccess?: () => void;
}

export const AuthOverlay: React.FC<AuthOverlayProps> = ({ initialUser, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

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

  // 1. Google OAuth Sign-In (via Supabase)
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
        // Immediate login if email confirmation is turned off
        setInfoMessage('Account created successfully! Loading dashboard...');
        if (onSuccess) onSuccess();
      } else {
        setMode('verify');
        setResendCooldown(60);
        setInfoMessage(`Confirmation link sent to ${email.trim()}! Please check your inbox.`);
      }
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err, 'Email Sign-Up'));
    } finally {
      setLoading(false);
    }
  };

  // 4. Resend Verification Email
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
      setInfoMessage(`Fresh confirmation link sent to ${email.trim()}!`);
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err, 'Resend Verification'));
    } finally {
      setLoading(false);
    }
  };

  // 5. Password Reset Email
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address to reset password.');
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setInfoMessage('Password reset link sent! Check your inbox.');
    } catch (err: any) {
      console.error(err);
      setError(formatAuthError(err, 'Password Reset'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutFromVerify = async () => {
    await supabase.auth.signOut();
    setMode('login');
    clearMessages();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white w-full">
      <div className="w-full max-w-md bg-gray-800/95 border border-gray-700/80 rounded-2xl shadow-2xl backdrop-blur-xl p-8 transition-all">
        
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 text-3xl mb-3 shadow-inner">
            ⚽
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">PredictionFantasy</h1>
          <p className="text-sm text-gray-400 mt-1">
            {mode === 'login' && 'Sign in to manage predictions & leagues'}
            {mode === 'signup' && 'Create a new manager account'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'verify' && 'Confirm your email address'}
          </p>
        </div>

        {/* Tab Switcher (Only visible for Login / Signup) */}
        {mode !== 'forgot' && mode !== 'verify' && (
          <div className="flex bg-gray-900/60 p-1 rounded-xl mb-6 border border-gray-700/50">
            <button
              type="button"
              onClick={() => { setMode('login'); clearMessages(); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'login' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); clearMessages(); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'signup' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Error / Info Alerts */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5">
            <span className="text-base leading-none">⚠️</span>
            <span className="flex-1 leading-relaxed">{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs flex items-start gap-2.5">
            <span className="text-base leading-none">✉️</span>
            <span className="flex-1 leading-relaxed">{infoMessage}</span>
          </div>
        )}

        {/* --- 1. GOOGLE FAST LOGIN (Clean & Prominent) --- */}
        {mode !== 'forgot' && mode !== 'verify' && (
          <div className="mb-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-semibold text-sm transition-all shadow hover:shadow-lg disabled:opacity-50"
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
              <div className="flex-grow border-t border-gray-700"></div>
              <span className="flex-shrink mx-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">Or with Email</span>
              <div className="flex-grow border-t border-gray-700"></div>
            </div>
          </div>
        )}

        {/* --- VIEW: SIGN IN WITH EMAIL --- */}
        {mode === 'login' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="manager@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-900/80 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Password</label>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); clearMessages(); }}
                  className="text-xs text-blue-400 hover:underline"
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
                className="w-full px-4 py-2.5 rounded-xl bg-gray-900/80 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-lg hover:shadow-blue-600/30 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In with Email'}
            </button>
          </form>
        )}

        {/* --- VIEW: SIGN UP WITH EMAIL (Sends Confirmation Link) --- */}
        {mode === 'signup' && (
          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="manager@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-900/80 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Password (Min 6 chars)</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-900/80 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-900/80 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-lg hover:shadow-blue-600/30 disabled:opacity-50"
            >
              {loading ? 'Creating Account & Sending Link...' : 'Create Account & Send Verification Link ✉️'}
            </button>
          </form>
        )}

        {/* --- VIEW: EMAIL CONFIRMATION / VERIFICATION SCREEN --- */}
        {mode === 'verify' && (
          <div className="text-center space-y-5">
            <div className="p-4 bg-gray-900/80 rounded-xl border border-gray-700/80">
              <span className="text-3xl block mb-2">📬</span>
              <h3 className="font-bold text-base text-white">Check Your Inbox</h3>
              <p className="text-xs text-gray-300 mt-1">
                We sent an activation link to:
              </p>
              <p className="text-sm font-semibold text-blue-400 mt-1 break-all">
                {activeEmail}
              </p>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Click the link in your email to activate your manager account, then click the button below to start playing!
            </p>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleCheckVerification}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg hover:shadow-emerald-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>{loading ? 'Checking status...' : '✅ I have verified my email'}</span>
              </button>

              <button
                type="button"
                onClick={handleResendVerification}
                disabled={loading || resendCooldown > 0}
                className="w-full py-2.5 rounded-xl bg-gray-700/70 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-600/60 transition-all disabled:opacity-40"
              >
                {resendCooldown > 0 
                  ? `Resend link in ${resendCooldown}s` 
                  : 'Resend Verification Link ✉️'
                }
              </button>
            </div>

            <div className="pt-4 border-t border-gray-700/60">
              <button
                type="button"
                onClick={handleSignOutFromVerify}
                className="text-xs text-gray-400 hover:text-white transition"
              >
                ← Sign Out & Use Another Email
              </button>
            </div>
          </div>
        )}

        {/* --- VIEW: FORGOT PASSWORD --- */}
        {mode === 'forgot' && (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Your Account Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="manager@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-900/80 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white text-sm outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-lg hover:shadow-blue-600/30 disabled:opacity-50"
            >
              {loading ? 'Sending link...' : 'Send Reset Link'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setMode('login'); clearMessages(); }}
                className="text-xs text-gray-400 hover:text-white"
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default AuthOverlay;
