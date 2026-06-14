import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, useAuth } from '../context/AuthContext';
import { QRScanner } from '../components/QRScanner';
import { 
  Users, 
  Receipt, 
  CreditCard, 
  Plus, 
  Calendar, 
  AlertCircle, 
  X, 
  UserPlus, 
  Camera, 
  FileText,
  TrendingDown,
  Info,
  ChevronRight,
  ArrowRight
} from 'lucide-react';

export const GroupDetails = () => {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses');
  const [expenseSubTab, setExpenseSubTab] = useState('list');

  // Modals state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedLedgerUsers, setSelectedLedgerUsers] = useState({ userA: null, userB: null });
  const [ledgerExplanation, setLedgerExplanation] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Expense details & editing states
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [isSettlementPrepopulated, setIsSettlementPrepopulated] = useState(false);

  // Filtering states
  const [filterSearch, setFilterSearch] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Forms states
  const [expTitle, setExpTitle] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState('INR');
  const [expPayer, setExpPayer] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expSplitType, setExpSplitType] = useState('EQUAL');
  const [expParticipants, setExpParticipants] = useState([]); // Array of user IDs
  const [expSplitDetails, setExpSplitDetails] = useState({}); // {user_id: string_val}
  const [expError, setExpError] = useState('');
  const [expSubmitting, setExpSubmitting] = useState(false);

  // Settlement Form state
  const [settPayer, setSettPayer] = useState('');
  const [settReceiver, setSettReceiver] = useState('');
  const [settAmount, setSettAmount] = useState('');
  const [settCurrency, setSettCurrency] = useState('INR');
  const [settDate, setSettDate] = useState(new Date().toISOString().split('T')[0]);
  const [settNote, setSettNote] = useState('');
  const [settError, setSettError] = useState('');
  const [settSubmitting, setSettSubmitting] = useState(false);

  // Add Member Form state
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [newMemberJoinedAt, setNewMemberJoinedAt] = useState(new Date().toISOString().split('T')[0]);
  const [memberError, setMemberError] = useState('');
  const [memberSubmitting, setMemberSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [groupRes, membershipsRes, expensesRes, settlementsRes, balancesRes] = await Promise.all([
        api.get(`/groups/${groupId}/`),
        api.get(`/memberships/?group_id=${groupId}`), // Note: filter memberships on group in view or custom query
        api.get(`/expenses/?group_id=${groupId}`),
        api.get(`/settlements/?group_id=${groupId}`),
        api.get(`/groups/${groupId}/balances/`)
      ]);

      setGroup(groupRes.data);
      const groupMemberships = membershipsRes.data.filter(m => m.group === groupId && !m.left_at);
      setMemberships(groupMemberships);
      
      setExpenses(expensesRes.data);
      setSettlements(settlementsRes.data);
      setBalances(balancesRes.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [groupId]);

  // Enforce Timeline-Aware active participants based on selected date (show all members except those who left before date)
  const getActiveMembersOnDate = (dateString) => {
    if (!dateString) return memberships;
    const targetDate = new Date(dateString);
    return memberships.filter(m => {
      const leftDate = m.left_at ? new Date(m.left_at) : null;
      return !leftDate || leftDate >= targetDate;
    });
  };

  const activeMembersOnExpDate = getActiveMembersOnDate(expDate);

  // Auto-fill defaults in modals when open
  useEffect(() => {
    if (memberships.length > 0) {
      setExpPayer(memberships[0].user);
      // default all active members as participants
      const activeIds = activeMembersOnExpDate.map(m => m.user);
      setExpParticipants(activeIds);
    }
  }, [showExpenseModal, expDate, memberships]);

  useEffect(() => {
    if (memberships.length > 0 && !isSettlementPrepopulated) {
      setSettPayer(memberships[0].user);
      setSettReceiver(memberships[1]?.user || memberships[0].user);
    }
  }, [showSettlementModal, memberships, isSettlementPrepopulated]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expTitle.trim() || !expAmount || expParticipants.length === 0) {
      setExpError('Please fill in title, amount, and choose participants.');
      return;
    }

    setExpSubmitting(true);
    setExpError('');

    // Prepare split details values
    const splitDetailsToSend = {};
    for (const uid of expParticipants) {
      if (expSplitType !== 'EQUAL') {
        splitDetailsToSend[uid] = expSplitDetails[uid] || '0.00';
      }
    }

    try {
      const payload = {
        group: groupId,
        title: expTitle,
        description: expDesc,
        amount: expAmount,
        currency: expCurrency,
        payer: expPayer,
        date: expDate,
        split_type: expSplitType,
        participant_ids: expParticipants,
        split_details: splitDetailsToSend
      };

      if (editingExpense) {
        await api.patch(`/expenses/${editingExpense.id}/`, payload);
      } else {
        await api.post('/expenses/', payload);
      }

      // Reset
      setExpTitle('');
      setExpDesc('');
      setExpAmount('');
      setExpSplitDetails({});
      setEditingExpense(null);
      setShowExpenseModal(false);
      fetchData();
    } catch (err) {
      setExpError(err.response?.data?.error || 'Failed to save expense.');
    } finally {
      setExpSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    try {
      await api.delete(`/expenses/${expenseId}/`);
      setSelectedExpense(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete expense.');
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm("Are you sure you want to delete this group? This action is permanent and will delete all expenses, settlements, and history.")) return;
    try {
      await api.delete(`/groups/${groupId}/`);
      navigate('/groups');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete group.');
    }
  };

  const handleLeaveGroup = async () => {
    const myMembership = memberships.find(m => m.user === user?.id && !m.left_at);
    if (!myMembership) return;
    if (!window.confirm("Are you sure you want to leave this group? You will no longer be split into future expenses, but your past balances are preserved.")) return;
    try {
      await api.post(`/memberships/${myMembership.id}/leave/`);
      navigate('/groups');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to leave group.');
    }
  };

  const handleQuickSettle = async (payerId, receiverId, amount, note) => {
    try {
      await api.post('/settlements/', {
        group: groupId,
        payer: payerId,
        receiver: receiverId,
        amount: amount,
        currency: 'INR',
        date: new Date().toISOString().split('T')[0],
        note: note || 'Quick simplified settlement'
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to record settlement.');
    }
  };

  const handleSettleAll = async () => {
    if (!balances || balances.simplified_path.length === 0) return;
    if (!window.confirm(`Are you sure you want to settle all ${balances.simplified_path.length} outstanding simplified debts?`)) return;
    
    setLoading(true);
    try {
      for (const tx of balances.simplified_path) {
        await api.post('/settlements/', {
          group: groupId,
          payer: tx.from_user_id,
          receiver: tx.to_user_id,
          amount: tx.amount,
          currency: 'INR',
          date: new Date().toISOString().split('T')[0],
          note: `Auto-settled simplified debt between ${tx.from_user} and ${tx.to_user}`
        });
      }
      fetchData();
    } catch (err) {
      alert('Error settling all debts: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSettleMyDebts = async () => {
    if (!balances || !user) return;
    const myDebts = balances.simplified_path.filter(tx => tx.from_user_id === user.id);
    if (myDebts.length === 0) return;
    if (!window.confirm(`Are you sure you want to pay off all your ${myDebts.length} outstanding simplified debts?`)) return;
    
    setLoading(true);
    try {
      for (const tx of myDebts) {
        await api.post('/settlements/', {
          group: groupId,
          payer: tx.from_user_id,
          receiver: tx.to_user_id,
          amount: tx.amount,
          currency: 'INR',
          date: new Date().toISOString().split('T')[0],
          note: `Auto-settled my simplified debt to ${tx.to_user}`
        });
      }
      fetchData();
    } catch (err) {
      alert('Error settling your debts: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAddSettlement = async (e) => {
    e.preventDefault();
    if (!settAmount || settPayer === settReceiver) {
      setSettError('Payer and receiver must be different, and amount must be positive.');
      return;
    }

    setSettSubmitting(true);
    setSettError('');
    try {
      await api.post('/settlements/', {
        group: groupId,
        payer: settPayer,
        receiver: settReceiver,
        amount: settAmount,
        currency: settCurrency,
        date: settDate,
        note: settNote
      });

      setSettAmount('');
      setSettNote('');
      setShowSettlementModal(false);
      fetchData();
    } catch (err) {
      setSettError(err.response?.data?.error || 'Failed to record settlement.');
    } finally {
      setSettSubmitting(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberUsername.trim()) return;

    setMemberSubmitting(true);
    setMemberError('');
    try {
      // Append Joined At parameter
      const dt = new Date(newMemberJoinedAt).toISOString();
      await api.post(`/memberships/add-by-username/`, {
        group: groupId,
        username: newMemberUsername.trim(),
        joined_at: dt
      });

      setNewMemberUsername('');
      setShowMemberModal(false);
      fetchData();
    } catch (err) {
      setMemberError(err.response?.data?.error || 'User not found or membership creation failed.');
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleRemoveMember = async (membershipId) => {
    if (!window.confirm("Are you sure you want this member to leave the group historically? (This will set their leave date, preserving previous balances but excluding them from future expenses)")) return;
    try {
      await api.post(`/memberships/${membershipId}/leave/`);
      fetchData();
    } catch (err) {
      alert('Failed to remove member.');
    }
  };

  const handleOpenLedger = async (userA, userB) => {
    setSelectedLedgerUsers({ userA, userB });
    setLedgerLoading(true);
    setShowLedgerModal(true);
    try {
      const res = await api.get(`/balances/explanation/?group_id=${groupId}&user_a=${userA.user_id}&user_b=${userB.user_id}`);
      setLedgerExplanation(res.data.ledger);
    } catch (err) {
      console.error(err);
    } finally {
      setLedgerLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  const sortedAndFilteredExpenses = [...expenses]
    .filter(exp => {
      if (filterSearch.trim()) {
        const query = filterSearch.toLowerCase();
        const titleMatch = exp.title?.toLowerCase().includes(query);
        const descMatch = exp.description?.toLowerCase().includes(query);
        const payerMatch = exp.payer_username?.toLowerCase().includes(query);
        const participantMatch = exp.participants?.some(p => p.username?.toLowerCase().includes(query));
        if (!titleMatch && !descMatch && !payerMatch && !participantMatch) return false;
      }
      if (filterMember) {
        if (exp.payer !== filterMember) return false;
      }
      if (filterDateFrom && exp.date < filterDateFrom) return false;
      if (filterDateTo && exp.date > filterDateTo) return false;
      return true;
    })
    .sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at || b.id) - new Date(a.created_at || a.id);
    });

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-100 tracking-tight">{group.name}</h2>
          <p className="text-slate-400 text-sm mt-1">{group.description || 'Manage expenses and payouts'}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {group && group.created_by === user?.id ? (
            <button
              onClick={handleDeleteGroup}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:border-rose-500/50 text-xs font-bold py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
            >
              <span>Delete Group</span>
            </button>
          ) : (
            <button
              onClick={handleLeaveGroup}
              className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 text-xs font-bold py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
            >
              <span>Leave Group</span>
            </button>
          )}

          <button
            onClick={() => setShowMemberModal(true)}
            className="btn-secondary text-xs flex items-center gap-2 cursor-pointer"
          >
            <UserPlus size={14} />
            <span>Invite Member</span>
          </button>
          <button
            onClick={() => {
              if (memberships.length > 0) {
                setSettPayer(memberships[0].user);
                setSettReceiver(memberships[1]?.user || memberships[0].user);
              }
              setSettAmount('');
              setSettNote('');
              setSettError('');
              setIsSettlementPrepopulated(false);
              setShowSettlementModal(true);
            }}
            className="btn-secondary text-xs hidden md:flex items-center gap-2 cursor-pointer"
          >
            <CreditCard size={14} />
            <span>Settle Up</span>
          </button>
          <button
            onClick={() => {
              setEditingExpense(null);
              setExpTitle('');
              setExpDesc('');
              setExpAmount('');
              setExpSplitDetails({});
              setExpError('');
              setShowExpenseModal(true);
            }}
            className="btn-primary text-xs hidden md:flex items-center gap-2 cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Group Quick Overview Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Settlement Status Card */}
        <div className="glass-panel p-6 flex items-center justify-between col-span-1 md:col-span-2 relative overflow-hidden shadow-lg border border-slate-800/80">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-bl-full" />
          <div>
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Group Settlement Status</span>
            <h4 className="text-xl font-bold text-slate-200 mt-2">
              {balances && balances.simplified_path.length === 0 ? "🎉 Group fully settled up" : `Pending Payments: ${balances?.simplified_path.length}`}
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {balances && balances.simplified_path.length === 0 
                ? "All expenses have been netted out and paid off. Excellent!" 
                : "Net debts have been simplified. Settle outstanding amounts using the settlement paths."}
            </p>
          </div>
          <div className="shrink-0 flex items-center justify-center bg-indigo-500/10 text-indigo-400 p-4 border border-indigo-500/20 rounded-2xl w-14 h-14 shadow-lg shadow-indigo-500/5">
            <TrendingDown size={24} className="animate-pulse" />
          </div>
        </div>

        {/* Group Stats Card */}
        <div className="glass-panel p-6 flex flex-col justify-between shadow-lg border border-slate-800/80">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Quick Stats</span>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold">Total Expenses</span>
              <span className="text-xl font-black text-slate-200 block mt-1">{expenses.length}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold">Settlements</span>
              <span className="text-xl font-black text-slate-200 block mt-1">{settlements.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Menu (Segmented Control) */}
      <div className="bg-slate-900/60 p-1.5 rounded-2xl flex border border-slate-800/80 gap-1 overflow-x-auto scrollbar-none mb-6">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer whitespace-nowrap text-center ${
            activeTab === 'expenses'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Expenses & Payouts
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer whitespace-nowrap text-center ${
            activeTab === 'balances'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Balances & Simplification
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer whitespace-nowrap text-center ${
            activeTab === 'members'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Members ({memberships.length})
        </button>
      </div>

      {/* EXPENSES TAB */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {/* Mobile sub-tabs for Expenses vs Payouts */}
          <div className="flex bg-slate-900/40 p-1.5 rounded-2xl border border-slate-800/80 gap-1 lg:hidden mb-2">
            <button
              type="button"
              onClick={() => setExpenseSubTab('list')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center ${
                expenseSubTab === 'list'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Expenses
            </button>
            <button
              type="button"
              onClick={() => setExpenseSubTab('settlements')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center ${
                expenseSubTab === 'settlements'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Settlements
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 space-y-4 ${expenseSubTab === 'list' ? 'block' : 'hidden lg:block'}`}>
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Receipt size={18} className="text-indigo-400" />
              <span>Expense History</span>
            </h3>

            {/* Filter Panel */}
            <div className="glass-panel p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs border border-slate-800/80">
              <div className="col-span-1">
                <label className="block text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">Search</label>
                <input
                  type="text"
                  placeholder="Title, description..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="glass-input w-full py-1.5 px-2.5 text-xs"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">By Member</label>
                <select
                  value={filterMember}
                  onChange={(e) => setFilterMember(e.target.value)}
                  className="glass-input w-full py-1.5 px-2 bg-slate-950 text-xs"
                >
                  <option value="">All Members</option>
                  {memberships.map(m => (
                    <option key={m.user} value={m.user}>{m.username}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">From Date</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="glass-input w-full py-1 px-2 text-xs"
                />
              </div>
              <div className="col-span-1 flex items-end gap-1.5">
                <div className="flex-1">
                  <label className="block text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">To Date</label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="glass-input w-full py-1 px-2 text-xs"
                  />
                </div>
                {(filterSearch || filterMember || filterDateFrom || filterDateTo) && (
                  <button
                    onClick={() => {
                      setFilterSearch('');
                      setFilterMember('');
                      setFilterDateFrom('');
                      setFilterDateTo('');
                    }}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 cursor-pointer flex items-center justify-center shrink-0 h-[30px]"
                    title="Clear Filters"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {expenses.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800/80 rounded-xl bg-slate-900/10">
                <p className="text-slate-500 text-sm">No expenses recorded yet in this group.</p>
                <button
                  onClick={() => {
                    setEditingExpense(null);
                    setExpTitle('');
                    setExpDesc('');
                    setExpAmount('');
                    setExpSplitDetails({});
                    setExpError('');
                    setShowExpenseModal(true);
                  }}
                  className="btn-primary text-xs mt-4 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add First Expense</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedAndFilteredExpenses.length === 0 ? (
                  <div className="text-center py-8 border border-slate-800/60 rounded-xl bg-slate-950/10 text-slate-500 text-xs">
                    No expenses matched your filter criteria.
                  </div>
                ) : (
                  sortedAndFilteredExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      onClick={() => setSelectedExpense(exp)}
                      className="glass-panel p-4 flex justify-between items-center hover:border-slate-700/60 hover:bg-slate-900/10 cursor-pointer transition-all duration-150"
                    >
                      <div>
                        <h4 className="font-semibold text-slate-200 text-sm">{exp.title}</h4>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <span>Paid by <span className="font-semibold text-slate-400">{exp.payer_username}</span></span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>{exp.date}</span>
                          </span>
                          <span>•</span>
                          <span className="bg-slate-800/80 px-2 py-0.5 rounded text-[10px] uppercase font-bold text-indigo-400">
                            {exp.split_type}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-100 text-sm">
                          {exp.currency} {parseFloat(exp.amount).toFixed(2)}
                        </p>
                        {exp.currency !== 'INR' && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            ~₹{parseFloat(exp.converted_amount).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Settlements side block */}
          <div className={`space-y-4 ${expenseSubTab === 'settlements' ? 'block' : 'hidden lg:block'}`}>
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <CreditCard size={18} className="text-indigo-400" />
              <span>Settlement Payments</span>
            </h3>

            {settlements.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-800/80 rounded-xl bg-slate-900/10">
                <p className="text-slate-500 text-xs">No settlements recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {settlements.map((sett) => (
                  <div key={sett.id} className="p-3 border border-slate-800/60 rounded-xl bg-slate-900/20">
                    <p className="text-xs text-slate-400 font-medium">
                      <span className="text-indigo-400 font-bold">{sett.payer_username}</span> paid{' '}
                      <span className="text-indigo-400 font-bold">{sett.receiver_username}</span>
                    </p>
                    <div className="flex justify-between items-center mt-2.5">
                      <span className="text-[10px] text-slate-500">{sett.date}</span>
                      <span className="text-xs font-bold text-emerald-400">
                        {sett.currency} {parseFloat(sett.amount).toFixed(2)}
                      </span>
                    </div>
                    {sett.note && (
                      <p className="text-[10px] text-slate-500 italic mt-1.5 border-t border-slate-800/40 pt-1.5">
                        Note: {sett.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* BALANCES TAB */}
      {activeTab === 'balances' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Individual net summaries & direct debts */}
          <div className="space-y-6">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                <Users size={18} className="text-indigo-400" />
                <span>Net Balances</span>
              </h3>
              
              <div className="space-y-4">
                {balances && Object.entries(balances.summaries).map(([uname, summary]) => {
                  const net = summary.net;
                  return (
                    <div key={uname} className="flex justify-between items-center p-3.5 border border-slate-800/40 rounded-xl bg-slate-950/20 hover:border-slate-700/80 transition duration-200">
                      <div>
                        <p className="font-semibold text-slate-200 text-sm">{uname}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Owed: ₹{summary.owed.toFixed(2)} • Receivable: ₹{summary.receivable.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-extrabold ${net > 0.02 ? 'text-emerald-400' : net < -0.02 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {net > 0.02 ? `Gets back ₹${net.toFixed(2)}` : net < -0.02 ? `Owes ₹${Math.abs(net).toFixed(2)}` : 'Settled Up'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Direct pairwise balances (Rohan's requirement - traceability) */}
            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                <Info size={18} className="text-indigo-400" />
                <span>Direct Debts Ledger</span>
              </h3>
              <p className="text-xs text-slate-500 mb-3">Click on a debt to drill down and see the exact ledger of items explaining the balance.</p>

              {balances && balances.direct_debts.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs border border-slate-850 rounded-xl">
                  No direct debts between group members.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {balances && balances.direct_debts.map((debt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleOpenLedger({ user_id: debt.debtor_id, username: debt.debtor }, { user_id: debt.creditor_id, username: debt.creditor })}
                      className="w-full text-left p-3.5 border border-slate-800 hover:border-indigo-500/50 rounded-xl bg-slate-900/30 flex justify-between items-center group transition-all duration-200 cursor-pointer"
                    >
                      <div className="text-sm">
                        <span className="font-semibold text-slate-200">{debt.debtor}</span> owes{' '}
                        <span className="font-semibold text-slate-200">{debt.creditor}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-400 text-sm">₹{debt.amount.toFixed(2)}</span>
                        <ChevronRight size={14} className="text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Simplified Settlements (Aisha's requirement - Greedy Debt Simplification) */}
          <div className="glass-panel p-6 self-start">
            <h3 className="text-lg font-bold text-slate-200 mb-2 flex items-center gap-2">
              <TrendingDown size={18} className="text-indigo-400" />
              <span>Simplified Debt Settlement Path</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Aisha's View: Minimize the total number of transactions required to balance the group completely.
            </p>

            {balances && balances.simplified_path.length > 0 && (() => {
              const myDebts = balances.simplified_path.filter(tx => tx.from_user_id === user?.id);
              const myDebtsTotal = myDebts.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
              
              return (
                <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-850 pb-4 items-center justify-between w-full">
                  {myDebtsTotal > 0 ? (
                    <button
                      onClick={handleSettleMyDebts}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-2 px-4 rounded-xl transition duration-150 cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                    >
                      Settle My Debts (Pay ₹{myDebtsTotal.toFixed(2)} in 1-Click)
                    </button>
                  ) : (
                    <div className="bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 text-xs font-extrabold py-2 px-4 rounded-xl flex items-center gap-1">
                      🎉 You are Settled Up! (No outstanding debts)
                    </div>
                  )}
                  
                  {user && group && group.created_by === user.id && (
                    <button
                      onClick={handleSettleAll}
                      className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/40 text-xs font-bold py-1.5 px-3 rounded-lg transition cursor-pointer"
                    >
                      Admin: Settle All ({balances.simplified_path.length})
                    </button>
                  )}
                </div>
              );
            })()}

            {balances && balances.simplified_path.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm border border-slate-850 rounded-xl bg-slate-950/20">
                🎉 All balanced! No payments needed.
              </div>
            ) : (
              <div className="space-y-4">
                {balances && balances.simplified_path.map((tx, idx) => (
                  <div key={idx} className="p-4 border border-indigo-500/20 rounded-xl bg-indigo-500/5 flex items-center justify-between hover:border-indigo-500/40 transition duration-200">
                    <div>
                      <span className="text-xs text-indigo-400 font-bold block mb-1">Transaction {idx + 1}</span>
                      <div className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="font-semibold">{tx.from_user}</span>
                        <ArrowRight size={14} className="text-slate-500" />
                        <span className="font-semibold">{tx.to_user}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="text-right mr-1.5">
                        <span className="text-xs text-slate-500 block">Pays</span>
                        <span className="font-extrabold text-slate-100 text-base">₹{tx.amount.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => handleOpenLedger({ user_id: tx.from_user_id, username: tx.from_user }, { user_id: tx.to_user_id, username: tx.to_user })}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 transition duration-150 cursor-pointer"
                        title="Explain exactly which expenses make up this debt"
                      >
                        Explain
                      </button>
                      {(tx.from_user_id === user?.id || tx.to_user_id === user?.id) && (
                        <button
                          onClick={() => {
                            setSettPayer(tx.from_user_id);
                            setSettReceiver(tx.to_user_id);
                            setSettAmount(tx.amount.toFixed(2));
                            setSettNote(`Settled simplified debt between ${tx.from_user} and ${tx.to_user}`);
                            setSettError('');
                            setIsSettlementPrepopulated(true);
                            setShowSettlementModal(true);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 transition duration-150 cursor-pointer shadow-lg shadow-indigo-600/20"
                        >
                          Settle
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <div className="glass-panel p-6 max-w-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-200">Group Memberships History</h3>
            <button
              onClick={() => setShowMemberModal(true)}
              className="btn-primary text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Add Member</span>
            </button>
          </div>

          <div className="divide-y divide-slate-850">
            {memberships.map((m) => (
              <div key={m.id} className="py-4 flex justify-between items-center first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-indigo-400 border border-slate-700/50">
                    {m.username[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-200 text-sm">{m.username}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Joined {new Date(m.joined_at).toLocaleDateString()}
                      {m.left_at && ` • Left ${new Date(m.left_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>

                <div>
                  {m.left_at ? (
                    <span className="text-[10px] bg-slate-800 text-slate-500 border border-slate-700/50 px-2 py-1 rounded-full font-bold uppercase">
                      Inactive (Left)
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-full font-bold uppercase">
                        Active
                      </span>
                      {group?.created_by === user?.id && m.user !== user?.id && (
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="text-xs text-rose-500 hover:text-rose-400 font-semibold px-2 py-1 cursor-pointer transition border border-rose-500/20 rounded-md hover:bg-rose-500/5"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEDGER DRILL DOWN MODAL (Rohan's Traceability Requirement) */}
      {showLedgerModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-2xl overflow-hidden relative max-h-[85vh] flex flex-col">
            {/* Close */}
            <button
              onClick={() => setShowLedgerModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer z-10"
            >
              <X size={20} />
            </button>

            <div className="p-6 border-b border-slate-800/80">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileText size={18} className="text-indigo-400" />
                <span>Audit Ledger Details</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Showing all transaction items explaining what{' '}
                <span className="font-semibold text-slate-300">{selectedLedgerUsers.userA?.debtor || selectedLedgerUsers.userA?.username}</span> owes{' '}
                <span className="font-semibold text-slate-300">{selectedLedgerUsers.userB?.creditor || selectedLedgerUsers.userB?.username}</span>.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {ledgerLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              ) : ledgerExplanation.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No mutual transactions found in this ledger trace.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="py-2.5">Date</th>
                          <th className="py-2.5">Item</th>
                          <th className="py-2.5">Type</th>
                          <th className="py-2.5">Original Amount</th>
                          <th className="py-2.5 text-right">Owed (INR)</th>
                          <th className="py-2.5 text-right">Running Net (INR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {ledgerExplanation.map((item, idx) => {
                          const isOwed = item.effect === 'owed';
                          const isSent = item.effect === 'payment_sent';
                          const isRecv = item.effect === 'payment_received';
                          const isReceivable = item.effect === 'receivable';

                          let owesClass = 'text-slate-300';
                          let effectPrefix = '';
                          if (isOwed) { owesClass = 'text-rose-400'; effectPrefix = '-'; }
                          if (isReceivable) { owesClass = 'text-emerald-400'; effectPrefix = '+'; }
                          if (isSent) { owesClass = 'text-emerald-400'; effectPrefix = '+'; }
                          if (isRecv) { owesClass = 'text-rose-400'; effectPrefix = '-'; }

                          return (
                            <tr key={idx} className="hover:bg-slate-900/10">
                              <td className="py-3 text-slate-500 font-mono">{item.date}</td>
                              <td className="py-3 font-medium text-slate-200">
                                {item.title}
                                <span className="block text-[10px] text-slate-500 font-normal mt-0.5">{item.description}</span>
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${item.type === 'settlement' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="py-3 font-medium text-slate-400">
                                {item.currency} {item.original_amount.toFixed(2)}
                              </td>
                              <td className={`py-3 text-right font-bold ${owesClass}`}>
                                {effectPrefix}₹{item.user_share_converted.toFixed(2)}
                              </td>
                              <td className="py-3 text-right font-semibold text-slate-300">
                                ₹{item.running_balance_converted.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 rounded-xl border border-indigo-500/15 bg-indigo-500/5 text-xs text-indigo-400 flex items-start gap-2">
                    <Info size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Ledger Explanation Trace Formula:</p>
                      <p className="mt-1 text-slate-400 leading-relaxed">
                        Running Net represents what User B ({selectedLedgerUsers.userB?.username}) owes User A ({selectedLedgerUsers.userA?.debtor || selectedLedgerUsers.userA?.username}).
                        Receivable splits (+) increase this debt. Owed splits (-) decrease it. Settlements paid by A to B (+) reduce A's debt, whereas settlements paid by B to A (-) reduce B's debt.
                      </p>
                      <p className="mt-2 text-[10px] text-slate-500 leading-relaxed italic border-t border-slate-800 pt-2">
                        *Note: If you opened this trace from the Simplified Debt Settlement Path, please note that the final transaction amount might be simplified/netted across multiple group members to minimize total transfers. The list above displays all direct historical expenses and settlements between these two members.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-800/80 flex justify-end">
              <button
                onClick={() => setShowLedgerModal(false)}
                className="btn-secondary text-xs cursor-pointer"
              >
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md overflow-hidden relative">
            <button
              onClick={() => setShowMemberModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleAddMember} className="p-6 space-y-5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-400" />
                <span>Invite Member</span>
              </h2>

              {memberError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  {memberError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Username
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter registered username..."
                    value={newMemberUsername}
                    onChange={(e) => setNewMemberUsername(e.target.value)}
                    className="glass-input flex-1 text-sm py-2"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="btn-secondary py-2 px-3 flex items-center gap-1.5 text-xs cursor-pointer"
                    title="Scan QR Code"
                  >
                    <Camera size={14} />
                    <span>Scan QR</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Joined At (Historical Timeline Date)
                </label>
                <input
                  type="date"
                  value={newMemberJoinedAt}
                  onChange={(e) => setNewMemberJoinedAt(e.target.value)}
                  className="glass-input w-full text-sm"
                  required
                />
                <span className="block text-[10px] text-slate-500 mt-1.5">
                  Allows defining a joining history. This user will not split any expenses created before this date.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="btn-secondary text-sm py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="btn-primary text-sm py-2"
                >
                  {memberSubmitting ? 'Inviting...' : 'Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR SCANNER VIEWPORT MODAL OVERLAY */}
      {showScanner && (
        <QRScanner
          onScanSuccess={(scannedUname) => {
            setNewMemberUsername(scannedUname);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* ADD EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg overflow-hidden relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowExpenseModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer z-10"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleAddExpense} className="p-6 flex-1 overflow-y-auto space-y-4">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-2">
                {editingExpense ? <FileText size={18} className="text-indigo-400" /> : <Plus size={18} className="text-indigo-400" />}
                <span>{editingExpense ? 'Edit Group Expense' : 'Add Group Expense'}</span>
              </h2>

              {expError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  {expError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Electricity Bill, Dinner"
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                    className="glass-input w-full text-sm py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Date
                  </label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="glass-input w-full text-sm py-2"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="glass-input w-full text-sm py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Currency
                  </label>
                  <select
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value)}
                    className="glass-input w-full text-sm py-2 bg-slate-950"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Paid By
                  </label>
                  <select
                    value={expPayer}
                    onChange={(e) => setExpPayer(e.target.value)}
                    className="glass-input w-full text-sm py-2 bg-slate-950"
                  >
                    {memberships.map((m) => (
                      <option key={m.user} value={m.user}>
                        {m.username}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Split Type
                  </label>
                  <select
                    value={expSplitType}
                    onChange={(e) => {
                      setExpSplitType(e.target.value);
                      setExpSplitDetails({});
                    }}
                    className="glass-input w-full text-sm py-2 bg-slate-950"
                  >
                    <option value="EQUAL">Equal</option>
                    <option value="UNEQUAL">Unequal (Exact Amounts)</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="SHARE">Shares</option>
                  </select>
                </div>
              </div>

              {/* Timeline-Aware Alert */}
              {activeMembersOnExpDate.length < memberships.length && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Timeline Membership Alert:</p>
                    <p className="text-slate-400 mt-0.5">
                      Some group members are excluded from this split because they were not active on {expDate}.
                    </p>
                  </div>
                </div>
              )}

              {/* Participants list */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                  Participants (Select to Split)
                </label>
                <div className="max-h-[140px] overflow-y-auto border border-slate-800/80 rounded-lg p-2.5 space-y-2">
                  {activeMembersOnExpDate.map((m) => {
                    const isChecked = expParticipants.includes(m.user);
                    return (
                      <div key={m.user} className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 text-slate-300 font-medium">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setExpParticipants([...expParticipants, m.user]);
                              } else {
                                setExpParticipants(expParticipants.filter(id => id !== m.user));
                              }
                            }}
                            className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{m.username}</span>
                        </label>

                        {/* Split details inputs if UNEQUAL / PERCENTAGE / SHARE */}
                        {isChecked && expSplitType !== 'EQUAL' && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              placeholder={
                                expSplitType === 'UNEQUAL' ? 'Amount' : 
                                expSplitType === 'PERCENTAGE' ? '%' : 'Shares'
                              }
                              value={expSplitDetails[m.user] || ''}
                              onChange={(e) => setExpSplitDetails({
                                ...expSplitDetails,
                                [m.user]: e.target.value
                              })}
                              className="glass-input py-1 px-2 w-20 text-[11px] text-right"
                              required
                            />
                            <span className="text-[10px] text-slate-500">
                              {expSplitType === 'UNEQUAL' ? expCurrency : 
                               expSplitType === 'PERCENTAGE' ? '%' : 'shares'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Additional description details..."
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="glass-input w-full text-sm py-2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="btn-secondary text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expSubmitting}
                  className="btn-primary text-xs py-2"
                >
                  {expSubmitting ? 'Saving...' : editingExpense ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD SETTLEMENT MODAL */}
      {showSettlementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md overflow-hidden relative">
            <button
              onClick={() => setShowSettlementModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleAddSettlement} className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-2">
                <CreditCard size={18} className="text-indigo-400" />
                <span>Record Payout Settlement</span>
              </h2>

              {settError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  {settError}
                </div>
              )}

              {isSettlementPrepopulated ? (
                <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center justify-between text-sm text-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Payer</span>
                    <span className="font-semibold text-slate-200">
                      {memberships.find(m => m.user === settPayer)?.username || settPayer}
                    </span>
                  </div>
                  <ArrowRight size={16} className="text-slate-550 mx-2 shrink-0" />
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Receiver</span>
                    <span className="font-semibold text-slate-200">
                      {memberships.find(m => m.user === settReceiver)?.username || settReceiver}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Payer (Paying off debt)
                    </label>
                    <select
                      value={settPayer}
                      onChange={(e) => setSettPayer(e.target.value)}
                      className="glass-input w-full text-sm py-2 bg-slate-950"
                    >
                      {memberships.map((m) => (
                        <option key={m.user} value={m.user}>
                          {m.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Receiver (Receiving money)
                    </label>
                    <select
                      value={settReceiver}
                      onChange={(e) => setSettReceiver(e.target.value)}
                      className="glass-input w-full text-sm py-2 bg-slate-950"
                    >
                      {memberships.map((m) => (
                        <option key={m.user} value={m.user}>
                          {m.username}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={settAmount}
                    onChange={(e) => setSettAmount(e.target.value)}
                    className="glass-input w-full text-sm py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Currency
                  </label>
                  <select
                    value={settCurrency}
                    onChange={(e) => setSettCurrency(e.target.value)}
                    className="glass-input w-full text-sm py-2 bg-slate-950"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Date
                  </label>
                  <input
                    type="date"
                    value={settDate}
                    onChange={(e) => setSettDate(e.target.value)}
                    className="glass-input w-full text-sm py-2"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Memo Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Settle electricity cash transfer..."
                  value={settNote}
                  onChange={(e) => setSettNote(e.target.value)}
                  className="glass-input w-full text-sm py-2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="btn-secondary text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settSubmitting}
                  className="btn-primary text-xs py-2"
                >
                  {settSubmitting ? 'Recording...' : 'Record Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPENSE DETAILS MODAL */}
      {selectedExpense && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md overflow-hidden relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setSelectedExpense(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer z-10"
            >
              <X size={20} />
            </button>

            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Expense Details</span>
                <h3 className="text-xl font-extrabold text-slate-100 mt-1">{selectedExpense.title}</h3>
                {selectedExpense.description && (
                  <p className="text-xs text-slate-400 mt-2 bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/40">
                    {selectedExpense.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-900/20 p-3.5 rounded-xl border border-slate-800/40">
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Paid By</span>
                  <span className="font-semibold text-slate-200">{selectedExpense.payer_username}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Date</span>
                  <span className="font-semibold text-slate-200">{selectedExpense.date}</span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Total Amount</span>
                  <span className="font-bold text-slate-100">
                    {selectedExpense.currency} {parseFloat(selectedExpense.amount).toFixed(2)}
                  </span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Split Type</span>
                  <span className="font-bold text-indigo-400 uppercase text-[10px]">{selectedExpense.split_type}</span>
                </div>
              </div>

              {selectedExpense.currency !== 'INR' && (
                <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10 text-xs text-indigo-400 flex justify-between">
                  <span>Exchange Rate ({selectedExpense.currency} to INR):</span>
                  <span className="font-mono">₹{parseFloat(selectedExpense.exchange_rate).toFixed(4)}</span>
                </div>
              )}

              <div>
                <span className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                  Split Details (Participants)
                </span>
                <div className="border border-slate-800/80 rounded-lg divide-y divide-slate-850 max-h-[180px] overflow-y-auto">
                  {selectedExpense.participants && selectedExpense.participants.map((part) => (
                    <div key={part.id} className="p-2.5 flex justify-between items-center text-xs">
                      <span className="text-slate-300 font-medium">{part.username}</span>
                      <div className="text-right">
                        <span className="font-bold text-slate-200">
                          {selectedExpense.currency} {parseFloat(part.original_amount || 0).toFixed(2)}
                        </span>
                        {selectedExpense.currency !== 'INR' && (
                          <span className="text-[10px] text-slate-500 block">
                            ~₹{parseFloat(part.amount || 0).toFixed(2)}
                          </span>
                        )}
                        {(selectedExpense.split_type === 'PERCENTAGE' || selectedExpense.split_type === 'SHARE') && (
                          <span className="text-[9px] text-indigo-400 block font-semibold">
                            {selectedExpense.split_type === 'PERCENTAGE' 
                              ? `${parseFloat(part.percentage).toFixed(0)}%` 
                              : `${parseFloat(part.share).toFixed(1)} shares`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800/50">
                {selectedExpense.payer === user?.id ? (
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this expense?")) {
                        handleDeleteExpense(selectedExpense.id);
                      }
                    }}
                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:border-rose-500/50 font-bold text-xs py-2 px-3.5 rounded-xl transition cursor-pointer"
                  >
                    Delete
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedExpense(null);
                    }}
                    className="btn-secondary text-xs py-2 px-3.5"
                  >
                    Close
                  </button>
                  {selectedExpense.payer === user?.id && (
                    <button
                      onClick={() => {
                        const expToEdit = selectedExpense;
                        setSelectedExpense(null);
                        
                        setEditingExpense(expToEdit);
                        setExpTitle(expToEdit.title);
                        setExpDesc(expToEdit.description || '');
                        setExpAmount(expToEdit.amount);
                        setExpCurrency(expToEdit.currency);
                        setExpPayer(expToEdit.payer);
                        setExpDate(expToEdit.date);
                        setExpSplitType(expToEdit.split_type);
                        setExpParticipants(expToEdit.participants.map(p => p.user));
                        
                        const details = {};
                        expToEdit.participants.forEach(p => {
                          if (expToEdit.split_type === 'UNEQUAL') details[p.user] = p.original_amount;
                          else if (expToEdit.split_type === 'PERCENTAGE') details[p.user] = p.percentage;
                          else if (expToEdit.split_type === 'SHARE') details[p.user] = p.share;
                        });
                        setExpSplitDetails(details);
                        setShowExpenseModal(true);
                      }}
                      className="btn-primary text-xs py-2 px-3.5"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Action Panel */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-slate-950/80 backdrop-blur-lg border border-slate-800/80 p-3 rounded-2xl shadow-2xl shadow-indigo-500/10 z-40 flex items-center justify-between gap-3 md:hidden">
        <button
          onClick={() => {
            if (memberships.length > 0) {
              setSettPayer(memberships[0].user);
              setSettReceiver(memberships[1]?.user || memberships[0].user);
            }
            setSettAmount('');
            setSettNote('');
            setSettError('');
            setIsSettlementPrepopulated(false);
            setShowSettlementModal(true);
          }}
          className="flex-1 btn-secondary text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 font-bold cursor-pointer"
        >
          <CreditCard size={14} />
          <span>Settle Up</span>
        </button>
        <button
          onClick={() => {
            setEditingExpense(null);
            setExpTitle('');
            setExpDesc('');
            setExpAmount('');
            setExpSplitDetails({});
            setExpError('');
            setShowExpenseModal(true);
          }}
          className="flex-1 btn-primary text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 font-bold cursor-pointer"
        >
          <Plus size={14} />
          <span>Add Expense</span>
        </button>
      </div>
    </div>
  );
};
