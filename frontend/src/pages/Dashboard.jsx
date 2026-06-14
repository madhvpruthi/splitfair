import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuth } from '../context/AuthContext';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp, 
  Plus, 
  ArrowRight, 
  Receipt, 
  CreditCard,
  FileUp, 
  History,
  Activity,
  Users
} from 'lucide-react';

export const Dashboard = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ owed: 0, receivable: 0, net: 0 });
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [recentSettlements, setRecentSettlements] = useState([]);
  const [recentImports, setRecentImports] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        // 1. Fetch user groups
        const groupsRes = await api.get('/groups/');
        const groupsData = groupsRes.data;
        setGroups(groupsData);

        // 2. Fetch balances for each group to aggregate overall summaries
        let overallOwed = 0;
        let overallReceivable = 0;
        let overallNet = 0;

        const balancePromises = groupsData.map(g => api.get(`/groups/${g.id}/balances/`));
        const balanceResponses = await Promise.all(balancePromises);

        // Fetch current user username from profiles or use auth context
        const profileRes = await api.get('/profile/');
        const username = profileRes.data.username;

        balanceResponses.forEach(res => {
          const summaries = res.data.summaries;
          if (summaries && summaries[username]) {
            const userSummary = summaries[username];
            overallOwed += userSummary.owed;
            overallReceivable += userSummary.receivable;
            overallNet += userSummary.net;
          }
        });

        setTotals({
          owed: overallOwed,
          receivable: overallReceivable,
          net: overallNet
        });

        // 3. Fetch recent expenses (limit to 5)
        const expRes = await api.get('/expenses/');
        // Sort descending by date or creation
        const sortedExps = expRes.data.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        setRecentExpenses(sortedExps.slice(0, 5));

        // 4. Fetch recent settlements
        const settRes = await api.get('/settlements/');
        const sortedSetts = settRes.data.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        setRecentSettlements(sortedSetts.slice(0, 5));

        // 5. Fetch recent imports
        const importsRes = await api.get('/import-jobs/');
        const sortedImports = importsRes.data.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        setRecentImports(sortedImports.slice(0, 3));

        setLoading(false);
      } catch (err) {
        console.error("Error loading dashboard data", err);
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative rounded-2xl overflow-hidden p-6 md:p-8 bg-gradient-to-r from-slate-900/60 via-indigo-950/20 to-purple-950/20 border border-slate-800/80 shadow-2xl">
        {/* Abstract blur orb background */}
        <div className="absolute top-0 right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-100 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300">
              Welcome back, {user?.username || 'Guest'}
            </h2>
            <p className="text-slate-400 text-xs md:text-sm mt-1.5 font-medium max-w-xl leading-relaxed">
              Manage shared expenses, inspect spreadsheets for anomalies, and settle balances with complete traceability.
            </p>
          </div>
          <div className="flex gap-2.5 shrink-0">
            <Link to="/groups" className="btn-secondary text-xs py-2.5 px-4 flex items-center gap-1.5 shadow-lg">
              <Users size={14} className="text-indigo-400 animate-pulse" />
              <span>My Groups</span>
            </Link>
            <Link to="/import" className="btn-primary text-xs py-2.5 px-4 flex items-center gap-1.5 shadow-lg">
              <Plus size={14} />
              <span>Import CSV</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Net balance */}
        <div className={`glass-panel p-6 relative overflow-hidden hover:scale-[1.02] transition-all duration-300 border ${totals.net >= 0 ? 'border-emerald-500/20 shadow-emerald-500/5' : 'border-rose-500/20 shadow-rose-500/5'} shadow-lg`}>
          <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${totals.net >= 0 ? 'from-emerald-500/10' : 'from-rose-500/10'} to-transparent rounded-bl-full`} />
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Net Balance</p>
          <p className={`text-4xl font-extrabold mt-3 tracking-tight ${totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totals.net >= 0 ? '+' : ''}₹{totals.net.toFixed(2)}
          </p>
          
          {/* Visual Balance Distribution Bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] text-slate-500 font-semibold uppercase">
              <span>Owed: {((totals.owed / (totals.owed + totals.receivable || 1)) * 100).toFixed(0)}%</span>
              <span>Receivable: {((totals.receivable / (totals.owed + totals.receivable || 1)) * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800/30">
              <div style={{ width: `${(totals.owed / (totals.owed + totals.receivable || 1)) * 100}%` }} className="bg-rose-500 shadow-lg shadow-rose-500/40" />
              <div style={{ width: `${(totals.receivable / (totals.owed + totals.receivable || 1)) * 100}%` }} className="bg-emerald-500 shadow-lg shadow-emerald-500/40" />
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-4 pt-3 border-t border-slate-800/40">
            <Activity size={14} className="text-indigo-400" />
            <span>Combined settlement ledger</span>
          </div>
        </div>

        {/* Total Owed */}
        <div className="glass-panel p-6 relative overflow-hidden hover:scale-[1.02] transition-all duration-300 border border-slate-800/80 hover:border-rose-500/30 shadow-lg shadow-slate-950/20">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-rose-500/10 to-transparent rounded-bl-full" />
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">You Owe</p>
          <p className="text-4xl font-extrabold mt-3 tracking-tight text-rose-400">
            ₹{totals.owed.toFixed(2)}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-9">
            <ArrowDownLeft size={14} className="text-rose-400" />
            <span>Awaiting payment from you</span>
          </div>
        </div>

        {/* Total Receivable */}
        <div className="glass-panel p-6 relative overflow-hidden hover:scale-[1.02] transition-all duration-300 border border-slate-800/80 hover:border-emerald-500/30 shadow-lg shadow-slate-950/20">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">You are Owed</p>
          <p className="text-4xl font-extrabold mt-3 tracking-tight text-emerald-400">
            ₹{totals.receivable.toFixed(2)}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-9">
            <ArrowUpRight size={14} className="text-emerald-400" />
            <span>Awaiting receipt from others</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left column (Recent Activity), Right column (Imports status) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Recent Activity Feed */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Recent Expenses List */}
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <Receipt size={18} className="text-indigo-400" />
                <span>Recent Expenses</span>
              </h3>
              <span className="text-xs text-slate-500">Last 5 entries</span>
            </div>

            {recentExpenses.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-800/80 rounded-xl">
                <p className="text-slate-500 text-sm">No expenses found.</p>
                <Link to="/groups" className="text-indigo-400 text-xs mt-2 inline-block hover:underline">
                  Visit groups to add expenses
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {recentExpenses.map((exp) => (
                  <div key={exp.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                    <div>
                      <p className="font-medium text-slate-200 text-sm">{exp.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Paid by <span className="font-semibold text-slate-400">{exp.payer_username}</span> • {exp.date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-slate-200">
                        {exp.currency} {parseFloat(exp.amount).toFixed(2)}
                      </p>
                      {exp.currency !== 'INR' && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          ~₹{parseFloat(exp.converted_amount).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Settlements List */}
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <CreditCard size={18} className="text-indigo-400" />
                <span>Recent Settlements</span>
              </h3>
              <span className="text-xs text-slate-500">Last 5 entries</span>
            </div>

            {recentSettlements.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-800/80 rounded-xl">
                <p className="text-slate-500 text-sm">No settlements recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {recentSettlements.map((sett) => (
                  <div key={sett.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                    <div>
                      <p className="font-medium text-slate-200 text-sm">
                        <span className="font-semibold text-indigo-400">{sett.payer_username}</span> paid{' '}
                        <span className="font-semibold text-indigo-400">{sett.receiver_username}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{sett.note || 'Settlement'} • {sett.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-emerald-400">
                        {sett.currency} {parseFloat(sett.amount).toFixed(2)}
                      </p>
                      {sett.currency !== 'INR' && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          ~₹{parseFloat(sett.converted_amount).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: CSV Import Job Tracker */}
        <div className="space-y-6">
          <div className="glass-panel p-6">
            <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2 mb-4">
              <FileUp size={18} className="text-indigo-400" />
              <span>Import Status</span>
            </h3>

            {recentImports.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-800/80 rounded-xl">
                <p className="text-slate-500 text-xs">No spreadsheets uploaded yet.</p>
                <Link to="/import" className="text-indigo-400 text-xs font-semibold mt-2 inline-block hover:underline">
                  Upload CSV
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {recentImports.map((job) => {
                  const statusColors = {
                    'PENDING_REVIEW': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    'COMPLETED': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    'FAILED': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                  };
                  return (
                    <div key={job.id} className="p-3.5 border border-slate-800/60 rounded-xl bg-slate-950/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 truncate max-w-[150px]">
                          {job.file_name.split('/').pop()}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 border rounded-full ${statusColors[job.status] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {job.status === 'PENDING_REVIEW' ? 'Review Needed' : job.status}
                        </span>
                      </div>
                      
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Group: {job.group_name}</span>
                        <span>{new Date(job.created_at).toLocaleDateString()}</span>
                      </div>

                      {/* View Report Link */}
                      <div className="mt-3 pt-3 border-t border-slate-800/50 flex justify-end">
                        {job.status === 'PENDING_REVIEW' ? (
                          <Link 
                            to="/import" 
                            className="text-amber-400 hover:text-amber-300 text-xs font-bold flex items-center gap-1"
                          >
                            <span>Resolve Anomalies</span>
                            <ArrowRight size={12} />
                          </Link>
                        ) : job.status === 'COMPLETED' ? (
                          <Link 
                            to={`/import-report/${job.id}`} 
                            className="text-indigo-400 hover:text-indigo-300 text-xs font-bold flex items-center gap-1"
                          >
                            <span>View Report</span>
                            <ArrowRight size={12} />
                          </Link>
                        ) : (
                          <span className="text-rose-400 text-xs">Parsing Failed</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
