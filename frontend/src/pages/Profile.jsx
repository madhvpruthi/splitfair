import React, { useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Shield, Sparkles, Key } from 'lucide-react';

export const Profile = () => {
  const { user } = useAuth();
  const canvasRef = useRef(null);

  // Custom QR-like Pixel Hash Generator for Canvas
  useEffect(() => {
    if (!user || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const token = user.qr_code_token || `user_${user.username}`;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set background
    ctx.fillStyle = '#1e293b'; // Slate-800
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Simple hashing function to seed pixel generation
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = token.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Draw QR-like pattern
    const gridSize = 16;
    const cellSize = canvas.width / gridSize;
    
    // Standard QR code alignment patterns on corners
    const drawAlignmentPattern = (x, y) => {
      ctx.fillStyle = '#6366f1'; // Indigo-500
      ctx.fillRect(x * cellSize, y * cellSize, 4 * cellSize, 4 * cellSize);
      ctx.fillStyle = '#1e293b'; // Slate-800
      ctx.fillRect((x + 1) * cellSize, (y + 1) * cellSize, 2 * cellSize, 2 * cellSize);
      ctx.fillStyle = '#6366f1'; // Indigo-500
      ctx.fillRect((x + 1.5) * cellSize, (y + 1.5) * cellSize, 1 * cellSize, 1 * cellSize);
    };
    
    // Bottom-left, top-left, top-right
    drawAlignmentPattern(1, 1);
    drawAlignmentPattern(gridSize - 5, 1);
    drawAlignmentPattern(1, gridSize - 5);
    
    // Fill rest of the grid deterministically based on seed
    ctx.fillStyle = '#e2e8f0'; // Slate-200 for data bits
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        // Skip corner alignment locations
        const isCorner = 
          (row < 5 && col < 5) || 
          (row < 5 && col > gridSize - 6) || 
          (row > gridSize - 6 && col < 5);
          
        if (!isCorner) {
          // Deterministic pseudo-random bit
          const val = Math.abs(Math.sin(hash + row * 13 + col * 37));
          if (val > 0.5) {
            ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
          }
        }
      }
    }
  }, [user]);

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-100 tracking-tight">My Profile</h2>
        <p className="text-slate-400 text-sm mt-1">Manage your account information and view your personal QR code.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Info Card */}
        <div className="md:col-span-2 glass-panel p-6 space-y-6">
          <h3 className="font-bold text-slate-200 text-base flex items-center gap-2 pb-3 border-b border-slate-800">
            <Sparkles className="text-indigo-400" size={18} />
            <span>Account Details</span>
          </h3>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/10 flex items-center justify-center shrink-0">
                <User size={20} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Username</span>
                <span className="text-sm font-bold text-slate-200">{user.username}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/10 flex items-center justify-center shrink-0">
                <Mail size={20} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Email Address</span>
                <span className="text-sm font-bold text-slate-200">{user.email || 'No email associated.'}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/10 flex items-center justify-center shrink-0">
                <Shield size={20} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Authorization Token</span>
                <span className="text-xs font-mono text-slate-400 select-all truncate max-w-[250px] block mt-0.5">
                  {user.qr_code_token}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* QR Code Presentation Box */}
        <div className="glass-panel p-6 flex flex-col items-center justify-center text-center">
          <h3 className="font-bold text-slate-200 text-sm mb-4">My Invite QR Code</h3>
          
          <div className="p-3 border border-slate-700/50 rounded-2xl bg-slate-900 shadow-xl mb-4">
            <canvas 
              ref={canvasRef} 
              width={180} 
              height={180}
              className="rounded-lg" 
            />
          </div>
          
          <div className="flex items-start gap-1.5 text-[11px] text-slate-500 max-w-[200px] text-left">
            <Key size={14} className="shrink-0 mt-0.5 text-indigo-400" />
            <span>Show this QR code to another group member so they can scan and invite you instantly.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
