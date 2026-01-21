import { useState } from 'react';
import { db, auth } from './firebase';
import { updateProfile } from "firebase/auth";
import { doc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import './App.css';

function ProfileSetup({ user, onComplete }) {
  const [managerName, setManagerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const handleProfileSetup = async (e) => {
      e.preventDefault();
      if (!managerName.trim()) {
          setError("Please enter a name.");
          return;
      }
      
      setLoading(true);
      try {
          // 0. Check for uniqueness
          const q = query(collection(db, "users"), where("displayName", "==", managerName));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
              // Ensure we don't block if the user is just updating their own profile (future-proofing)
              const existingDoc = querySnapshot.docs[0];
              if (existingDoc.id !== user.uid) {
                  setError("This Manager Name is already taken! Please choose another.");
                  setLoading(false);
                  return;
              }
          }

          // 1. Save to Firestore
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, {
              displayName: managerName,
              email: user.email,
              photoURL: user.photoURL || '',
              createdAt: new Date().toISOString()
          }, { merge: true });
          
          // 2. Update Auth Profile
          await updateProfile(user, { displayName: managerName });

          // 3. Notify App
          if (onComplete) onComplete();
          
      } catch (e) {
          console.error(e);
          setError("Failed to save profile. Try again. " + e.message);
          setLoading(false);
      }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <h2>One Last Step</h2>
        
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleProfileSetup}>
            <p className="profile-msg">Choose your Manager Name for the leaderboards.</p>
            <div className="input-group">
                <label>Manager Name (Max 15 chars)</label>
                <input 
                    type="text" 
                    value={managerName} 
                    onChange={e => {
                        const val = e.target.value;
                        // Regex: Only Letters, Numbers, Underscore
                        if (/^[a-zA-Z0-9_]*$/.test(val) && val.length <= 15) {
                            setManagerName(val);
                            setError('');
                        }
                    }} 
                    placeholder="e.g. TheSpecialOne"
                    required 
                    autoFocus
                    style={{letterSpacing: '1px'}}
                />
                <div style={{textAlign:'right', fontSize:'0.75rem', color: managerName.length === 15 ? '#e63946' : '#888', marginTop:'4px'}}>
                    {managerName.length}/15 {managerName.length === 15 && '(Max)'}
                </div>
                <div style={{fontSize:'0.75rem', color:'#aaa', marginTop:'2px'}}>
                    Allowed: Letters, Numbers, Underscore (_)
                </div>
            </div>
            <button type="submit" className="auth-button primary" disabled={loading}>
                {loading ? 'Starting Season...' : 'Start Playing ⚽'}
            </button>
            <div className="divider"><span>OR</span></div>
            <button type="button" onClick={() => auth.signOut()} className="auth-button google">
                Sign Out
            </button>
        </form>
      </div>
    </div>
  );
}

export default ProfileSetup;
