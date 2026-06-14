import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { Users, Plus, X, Folder, Calendar, ArrowRight } from 'lucide-react';

export const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const res = await api.get('/groups/');
      setGroups(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setCreateLoading(true);
    setError('');
    try {
      await api.post('/groups/', { name, description });
      setName('');
      setDescription('');
      setShowModal(false);
      fetchGroups();
    } catch (err) {
      setError('Failed to create group. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-100 tracking-tight">My Groups</h2>
          <p className="text-slate-400 text-sm mt-1">Select a group to manage members, add expenses, or settle balances.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary text-sm flex items-center gap-2 cursor-pointer"
        >
          <Plus size={16} />
          <span>Create Group</span>
        </button>
      </div>

      {/* Group Cards Grid */}
      {groups.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800/80 rounded-2xl bg-slate-900/10">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 mx-auto mb-4 border border-slate-800/50">
            <Folder size={24} />
          </div>
          <h3 className="font-bold text-lg text-slate-300">No Groups Found</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
            Get started by creating a new group and inviting your flatmates or travel companions!
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary text-xs mt-6 flex items-center gap-2 mx-auto cursor-pointer"
          >
            <Plus size={14} />
            <span>Create First Group</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((g) => (
            <Link
              key={g.id}
              to={`/groups/${g.id}`}
              className="glass-card p-6 flex flex-col justify-between h-[180px] relative group"
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-lg border border-indigo-500/10">
                    <Users size={16} />
                  </div>
                  <h3 className="font-bold text-slate-100 text-lg group-hover:text-indigo-400 transition-colors truncate max-w-[200px]">
                    {g.name}
                  </h3>
                </div>
                <p className="text-slate-400 text-xs line-clamp-2 mt-1">
                  {g.description || 'No description provided.'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800/30 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  <span>Created {new Date(g.created_at).toLocaleDateString()}</span>
                </span>
                <span className="text-indigo-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Enter</span>
                  <ArrowRight size={12} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md overflow-hidden relative">
            {/* Close */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleCreateGroup} className="p-6 space-y-5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Folder size={18} className="text-indigo-400" />
                <span>Create New Group</span>
              </h2>

              {error && (
                <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Group Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Flat 402, Trip to Goa"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input w-full text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  placeholder="What is this group for?..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="glass-input w-full text-sm min-h-[80px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary text-sm py-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="btn-primary text-sm py-2 cursor-pointer"
                >
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
