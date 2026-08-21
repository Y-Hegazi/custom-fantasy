import { useRef, useEffect, useState } from 'react';
import { Badge } from './utils/badgeEngine';

interface ShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  managerName: string;
  gameweekNum: string | number;
  gameweekPoints: number;
  totalPoints: number;
  rank?: number;
  badges: Badge[];
}

export function ShareCardModal({
  isOpen,
  onClose,
  managerName,
  gameweekNum,
  gameweekPoints,
  totalPoints,
  rank,
  badges
}: ShareCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardDataUrl, setCardDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const unlockedBadges = badges.filter(b => b.unlocked);
  const shareUrl = window.location.origin;

  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI Canvas rendering (1200 x 630 standard OG image size)
    const width = 1200;
    const height = 630;
    canvas.width = width;
    canvas.height = height;

    // 1. Premium Dark Neon Football Gradient Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0a0f1d');
    bgGradient.addColorStop(0.5, '#0f172a');
    bgGradient.addColorStop(1, '#022c22');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Glow Circles / Ambient Highlights
    const glow1 = ctx.createRadialGradient(200, 150, 20, 200, 150, 350);
    glow1.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
    glow1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, width, height);

    const glow2 = ctx.createRadialGradient(1000, 480, 20, 1000, 480, 400);
    glow2.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    glow2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, width, height);

    // 3. Card Border Frame
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // 4. Header: App Branding
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('⚽ PREDICTION FANTASY', 70, 95);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px sans-serif';
    ctx.fillText(`PREMIER LEAGUE 2025/26 • GW ${gameweekNum}`, 70, 135);

    // 5. Manager Profile Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(managerName || 'Fantasy Manager', 70, 220);

    // 6. Score Showcase Boxes
    // GW Points Card
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    roundRect(ctx, 70, 270, 320, 180, 20, true, true);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('GAMEWEEK POINTS', 100, 320);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 74px sans-serif';
    ctx.fillText(`${gameweekPoints}`, 100, 410);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('PTS', 230 + (String(gameweekPoints).length * 30), 405);

    // Total Season Points Card
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    roundRect(ctx, 420, 270, 320, 180, 20, true, true);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('OVERALL TOTAL', 450, 320);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 74px sans-serif';
    ctx.fillText(`${totalPoints}`, 450, 410);

    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('PTS', 580 + (String(totalPoints).length * 30), 405);

    // Rank Showcase Card (if available)
    if (rank) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      roundRect(ctx, 770, 270, 360, 180, 20, true, true);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('GLOBAL RANK', 800, 320);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 74px sans-serif';
      ctx.fillText(`#${rank}`, 800, 410);
    }

    // 7. Badges Row
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('UNLOCKED ACHIEVEMENTS:', 70, 500);

    const badgeList = unlockedBadges.length > 0 ? unlockedBadges.slice(0, 4) : [
      { emoji: '⚡', name: 'Active Manager' },
      { emoji: '🔮', name: 'Picks Submitted' }
    ];

    badgeList.forEach((b: any, idx) => {
      const bx = 70 + idx * 270;
      const by = 520;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      roundRect(ctx, bx, by, 250, 55, 12, true, true);

      ctx.fillStyle = '#ffffff';
      ctx.font = '24px sans-serif';
      ctx.fillText(`${b.emoji} ${b.name}`, bx + 16, by + 36);
    });

    // 8. Footer URL
    ctx.fillStyle = '#64748b';
    ctx.font = '500 20px sans-serif';
    ctx.fillText('predictionfantasy.app • Challenge your friends!', 780, 590);

    // Save as Data URL for preview & download
    setCardDataUrl(canvas.toDataURL('image/png'));
  }, [isOpen, managerName, gameweekNum, gameweekPoints, totalPoints, rank, badges]);

  if (!isOpen) return null;

  const topBadgeEmoji = unlockedBadges.length > 0 ? unlockedBadges[0].emoji + ' ' + unlockedBadges[0].name : '🔮 Prediction Fantasy';

  // Share text
  const shareText = `🔥 Check out my Premier League Fantasy performance on Prediction Fantasy!\n\n👑 Manager: ${managerName}\n⚽ GW ${gameweekNum} Score: ${gameweekPoints} pts\n🏆 Total Points: ${totalPoints} pts\n🎖️ Badge Unlocked: ${topBadgeEmoji}\n\nThink you can beat my score? Make your picks here:\n${shareUrl}`;

  const handleWhatsAppShare = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const handleTwitterShare = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const handleDownloadImage = () => {
    if (!cardDataUrl) return;
    const a = document.createElement('a');
    a.href = cardDataUrl;
    a.download = `fantasy_score_gw${gameweekNum}_${managerName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-6 text-white max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
              🏆 Share Your Fantasy Card
            </h2>
            <p className="text-xs text-slate-400">Flex your gameweek points and badges to your friends!</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl font-bold p-1 leading-none"
          >
            ✕
          </button>
        </div>

        {/* Hidden Canvas for High-DPI Image Render */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Rendered Preview Card */}
        {cardDataUrl && (
          <div className="rounded-xl overflow-hidden shadow-lg border border-slate-700 bg-slate-950">
            <img 
              src={cardDataUrl} 
              alt="Manager Score Card Preview" 
              className="w-full h-auto object-contain"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {/* WhatsApp */}
          <button
            onClick={handleWhatsAppShare}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow"
          >
            <span className="text-lg">💬</span>
            <span>WhatsApp</span>
          </button>

          {/* Twitter / X */}
          <button
            onClick={handleTwitterShare}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition shadow"
          >
            <span className="text-lg">🐦</span>
            <span>X / Twitter</span>
          </button>

          {/* Download Image */}
          <button
            onClick={handleDownloadImage}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow"
          >
            <span className="text-lg">📥</span>
            <span>Save Image</span>
          </button>

          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition shadow"
          >
            <span className="text-lg">{copied ? '✅' : '📋'}</span>
            <span>{copied ? 'Copied!' : 'Copy Text'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}

// Canvas Rounded Rectangle Helper
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill = true,
  stroke = false
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
