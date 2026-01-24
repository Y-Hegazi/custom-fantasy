import React from 'react';

const FormBadge = ({ formString }) => {
  if (!formString) return null;

  // Form string from API comes like "W,L,D,W,W" or "WLDWW". 
  // We want to normalize it.
  const forms = formString.replace(/,/g, '').split('');

  // We usually want to show last 5.
  // API usually returns last 5.
  
  return (
    <div className="form-badges" style={{ display: 'flex', gap: '3px', marginTop:'4px' }}>
      {forms.map((result, i) => {
        let bg = '#ccc';
        let text = result;
        
        if (result === 'W') bg = '#2ecc71'; // Green
        else if (result === 'D') bg = '#95a5a6'; // Grey
        else if (result === 'L') bg = '#e74c3c'; // Red
        
        return (
          <div key={i} style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: bg,
              color: 'white',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold'
          }} title={result}>
              {result}
          </div>
        );
      })}
    </div>
  );
};

export default FormBadge;
