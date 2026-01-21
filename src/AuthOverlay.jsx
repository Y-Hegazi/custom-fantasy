import { useState } from 'react';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  updateProfile 
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import './App.css'; // We'll add styles to App.css

function AuthOverlay({ user, onProfileComplete }) {
  const [view, setView] = useState('login'); // 'login', 'signup', 'profile'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // Only for signup
  const [managerName, setManagerName] = useState(''); // Only for profile
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If user is already logged in but caught by this overlay, 
  // it means they need to set their profile. Force 'profile' view.
  if (user && view !== 'profile') {
      setView('profile');
  }

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // App.jsx will handle the state change and profile check
    } catch (e) {
      console.error(e);
      setError("Google Sign-In failed. Try again.");
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // App.jsx will handle the rest
    } catch (e) {
      console.error(e);
      setError("Invalid email or password.");
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
    }
    
    setLoading(true);
    setError('');
    try {
      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. We don't automatically create the Firestore doc here.
      // We let the App.jsx logic detect "Missing Profile" and switch this overlay to "Profile Setup".
      // This ensures a consistent flow for Google vs Email users.
      
    } catch (e) {
      console.error(e);
      if (e.code === 'auth/email-already-in-use') {
          setError("Email already in use. Try logging in.");
      } else if (e.code === 'auth/operation-not-allowed') {
          setError("Email/Password sign-in is not enabled in Firebase Console.");
      } else {
          setError(`Signup failed: ${e.message}`);
      }
      setLoading(false);
    }
  };

  const handleProfileSetup = async (e) => {
      e.preventDefault();
      if (!managerName.trim()) {
          setError("Please enter a name.");
          return;
      }
      
      setLoading(true);
      try {
          // 1. Save to Firestore
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, {
              displayName: managerName,
              email: user.email,
              photoURL: user.photoURL || '',
              createdAt: new Date().toISOString()
          }, { merge: true }); // Merge just in case
          
          // 2. Update Auth Profile (optional but good for consistency)
          await updateProfile(user, { displayName: managerName });

          // 3. Notify App
          if (onProfileComplete) onProfileComplete();
          
      } catch (e) {
          console.error(e);
          setError("Failed to save profile. Try again.");
          setLoading(false);
      }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        
        {/* LOGO or HEADER */}
        <h2>
            {view === 'login' && 'Welcome Back'}
            {view === 'signup' && 'Create Account'}
            {view === 'profile' && 'One Last Step'}
        </h2>
        
        {error && <div className="auth-error">{error}</div>}

        {/* --- LOGIN VIEW --- */}
        {view === 'login' && (
          <>
            <form onSubmit={handleEmailLogin}>
              <div className="input-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                  <label>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <button type="submit" className="auth-button primary" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            
            <div className="divider"><span>OR</span></div>
            
            <button onClick={handleGoogleLogin} className="auth-button google" disabled={loading}>
                Sign in with Google
            </button>
            
            <p className="switch-view">
                Don't have an account? <span onClick={() => setView('signup')}>Sign Up</span>
            </p>
          </>
        )}

        {/* --- SIGNUP VIEW --- */}
        {view === 'signup' && (
          <>
            <form onSubmit={handleSignup}>
              <div className="input-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                  <label>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="input-group">
                  <label>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
              <button type="submit" className="auth-button primary" disabled={loading}>
                  {loading ? 'Creating Account...' : 'Sign Up'}
              </button>
            </form>
            
            <p className="switch-view">
                Already have an account? <span onClick={() => setView('login')}>Sign In</span>
            </p>
          </>
        )}

        {/* --- PROFILE VIEW --- */}
        {view === 'profile' && (
          <form onSubmit={handleProfileSetup}>
            <p className="profile-msg">Choose your Manager Name for the leaderboards.</p>
            <div className="input-group">
                <label>Manager Name</label>
                <input 
                    type="text" 
                    value={managerName} 
                    onChange={e => setManagerName(e.target.value)} 
                    placeholder="e.g. TheSpecialOne"
                    maxLength={20}
                    required 
                    autoFocus
                />
            </div>
            <button type="submit" className="auth-button primary" disabled={loading}>
                {loading ? 'Starting Season...' : 'Start Playing ⚽'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

export default AuthOverlay;
