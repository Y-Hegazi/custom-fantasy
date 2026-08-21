import { useState } from 'react';
import { supabase } from './supabase';
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
          const userId = user.uid || user.id;

          // 0. Check uniqueness
          const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('display_name', managerName.trim())
            .neq('id', userId);
          
          if (existing && existing.length > 0) {
              setError("This Manager Name is already taken! Please choose another.");
              setLoading(false);
              return;
          }

          // 1. Save to Supabase profiles
          await supabase
            .from('profiles')
            .upsert({
              id: userId,
              display_name: managerName.trim(),
              email: user.email,
              total_score: 0,
              updated_at: new Date().toISOString()
            });

          // 2. Update user metadata
          await supabase.auth.updateUser({
            data: { full_name: managerName.trim() }
          });

          // 3. Notify App
          if (onComplete) onComplete();
          
      } catch (e: any) {
          console.error(e);
          setError("Failed to save profile. Try again: " + e.message);
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
            <button type="button" onClick={() => supabase.auth.signOut()} className="auth-button google">
                Sign Out
            </button>
        </form>
      </div>
    </div>
  );
}

export default ProfileSetup;
