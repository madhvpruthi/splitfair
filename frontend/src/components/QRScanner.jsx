import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { Camera, X, AlertCircle } from 'lucide-react';

export const QRScanner = ({ onScanSuccess, onClose }) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [systemUsers, setSystemUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch registered users to provide scan shortcuts
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/users/check/'); // We will write a simple list view, or we can fetch a few mock shortcuts. Let's use check user or mock names
        // Since list_users might not be open to keep database private, let's fetch a list of all users
        // Wait, let's add an endpoint for searching users if needed, or query recent users.
        // For the scanner demo, we will check usernames
        setLoading(false);
      } catch (err) {
        setLoading(false);
      }
    };
    fetchUsers();
    
    // Default mock demo usernames
    setSystemUsers(['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev']);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/users/check/?username=${usernameInput.trim()}`);
      if (res.data.exists) {
        onScanSuccess(usernameInput.trim());
      } else {
        setError(`User '${usernameInput}' not found in database.`);
      }
    } catch (err) {
      setError('Connection error verifying user.');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateScan = (uname) => {
    onScanSuccess(uname);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Add Member via QR Scan</h2>
          </div>

          {/* Scanner Viewport Box */}
          <div className="relative aspect-square w-full max-w-[280px] mx-auto rounded-xl overflow-hidden border border-slate-700/50 bg-slate-950 mb-6">
            <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/10 to-transparent flex items-center justify-center">
              <Camera size={48} className="text-slate-800 animate-pulse" />
            </div>
            {/* Pulsing Scan Line */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-rose-500 shadow-md shadow-rose-500/80 animate-[bounce_2s_infinite]" />
            
            {/* Crop marks */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-indigo-400" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-indigo-400" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-indigo-400" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-indigo-400" />
          </div>

          {/* Direct input */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Scan Code or Enter Username
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter username manually..."
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="glass-input flex-1 py-2 text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary py-2 text-sm"
                >
                  Verify
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>

          {/* Simulated scanning shortcuts */}
          <div className="mt-6">
            <p className="text-xs font-semibold text-slate-500 mb-2">Simulate scanning a group member QR:</p>
            <div className="flex flex-wrap gap-2">
              {systemUsers.map((uname) => (
                <button
                  key={uname}
                  onClick={() => handleSimulateScan(uname)}
                  className="bg-slate-850 hover:bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-indigo-400 text-xs px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer"
                >
                  Scan {uname}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
