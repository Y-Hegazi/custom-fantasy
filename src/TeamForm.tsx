import React from 'react';

interface TeamFormProps {
  formString?: string;
  className?: string;
}

export const TeamForm: React.FC<TeamFormProps> = ({ formString = '', className = '' }) => {
  // Normalize results array (take last 5 matches)
  const cleanStr = formString ? formString.replace(/[^WDL]/gi, '').toUpperCase() : '';
  const results = cleanStr.split('').slice(-5);
  
  // Pad up to 5 slots with empty placeholders for early season
  const slots: Array<{ char: string; isPlaceholder: boolean }> = [];
  
  for (let i = 0; i < 5; i++) {
    if (i < results.length) {
      slots.push({ char: results[i], isPlaceholder: false });
    } else {
      slots.push({ char: '-', isPlaceholder: true });
    }
  }

  return (
    <div 
      className={`inline-flex items-center gap-1 mt-1 ${className}`} 
      title={results.length > 0 ? `Form (Last ${results.length} matches): ${results.join('-')}` : 'No matches played yet this season'}
    >
      {slots.map((slot, idx) => {
        if (slot.isPlaceholder) {
          return (
            <span
              key={idx}
              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-gray-800/60 border border-gray-700 text-gray-500 select-none"
            >
              ·
            </span>
          );
        }

        const isWin = slot.char === 'W';
        const isDraw = slot.char === 'D';
        const isLoss = slot.char === 'L';

        return (
          <span
            key={idx}
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm select-none ${
              isWin 
                ? 'bg-emerald-500 border border-emerald-400' 
                : isDraw 
                  ? 'bg-gray-500 border border-gray-400' 
                  : isLoss 
                    ? 'bg-rose-500 border border-rose-400' 
                    : 'bg-gray-700 border border-gray-600'
            }`}
          >
            {slot.char}
          </span>
        );
      })}
    </div>
  );
};

export default TeamForm;
