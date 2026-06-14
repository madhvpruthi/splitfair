import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { 
  FileUp, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight, 
  HelpCircle, 
  Trash2, 
  Save, 
  FileText,
  TrendingDown,
  Info,
  Clock,
  UserPlus,
  Sparkles
} from 'lucide-react';

export const ImportCSV = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [file, setFile] = useState(null);
  
  // Job and anomalies states
  const [activeJob, setActiveJob] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [allSystemUsers, setAllSystemUsers] = useState([]);
  
  // Loading & logs
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  
  // Report view state
  const [report, setReport] = useState(null);
  const [resolvingAll, setResolvingAll] = useState(false);
  const navigate = useNavigate();

  const handleAutoResolve = async () => {
    if (!activeJob) return;
    setResolvingAll(true);
    setError('');
    try {
      const res = await api.post(`/imports/${activeJob.id}/auto-resolve/`);
      // Refetch anomalies
      await fetchAnomalies(activeJob.id);
      alert(res.data.message || 'AI Auto-Resolve completed!');
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to auto-resolve anomalies.';
      setError(errMsg);
      alert('Failed to auto-resolve: ' + errMsg);
    } finally {
      setResolvingAll(false);
    }
  };

  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        // Fetch groups
        const groupsRes = await api.get('/groups/');
        setGroups(groupsRes.data);
        if (groupsRes.data.length > 0) {
          setSelectedGroup(groupsRes.data[0].id);
        }
        
        // Fetch users to populate user-mapping dropdowns
        const usersRes = await api.get('/profile/'); // We will mock standard list of usernames or fetch them if available
        // Set fallback options
        setAllSystemUsers(['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev']);
        
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    initData();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedGroup || !file) {
      setError('Please select a group and attach a CSV file.');
      return;
    }

    setUploading(true);
    setError('');
    setActiveJob(null);
    setAnomalies([]);
    setReport(null);

    const formData = new FormData();
    formData.append('group', selectedGroup);
    formData.append('file', file);

    try {
      const res = await api.post('/imports/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setActiveJob(res.data);
      
      // Fetch anomalies for this job
      fetchAnomalies(res.data.id);
    } catch (err) {
      setError(err.response?.data?.error || 'CSV Upload or parsing failed. Please check the file structure.');
    } finally {
      setUploading(false);
    }
  };

  const fetchAnomalies = async (jobId) => {
    try {
      const res = await api.get('/anomalies/');
      const jobAnomalies = res.data.filter(a => a.import_job === jobId);
      setAnomalies(jobAnomalies);
      
      const pending = jobAnomalies.filter(a => a.status === 'PENDING').length;
      setUnresolvedCount(pending);
    } catch (err) {
      console.error("Failed to fetch anomalies", err);
    }
  };

  const handleResolveAnomaly = async (anomalyId, actionVal) => {
    try {
      await api.patch(`/anomalies/${anomalyId}/`, {
        resolution_action: actionVal
      });
      
      if (activeJob) {
        fetchAnomalies(activeJob.id);
      }
    } catch (err) {
      alert('Failed to resolve anomaly.');
    }
  };

  const handleCommit = async () => {
    if (!activeJob) return;
    setCommitting(true);
    setError('');
    try {
      const res = await api.post(`/imports/${activeJob.id}/commit/`);
      setReport(res.data.report);
      // Mark active job status as completed
      setActiveJob(prev => ({ ...prev, status: 'COMPLETED' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Commit failed. Make sure all anomalies are resolved.');
    } finally {
      setCommitting(false);
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-100 tracking-tight">CSV Spreadsheet Import</h2>
        <p className="text-slate-400 text-sm mt-1">Upload group expense spreadsheets containing inconsistent entries and resolve anomalies.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-400 bg-rose-500/10 p-3.5 rounded-xl border border-rose-500/20">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Wizard Form */}
      {!activeJob && (
        <div className="glass-panel p-6">
          <form onSubmit={handleUpload} className="space-y-5">
            <h3 className="font-bold text-slate-200 text-base flex items-center gap-2 mb-2">
              <FileUp size={18} className="text-indigo-400" />
              <span>Step 1: Upload Spreadsheet File</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Target Group
                </label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="glass-input w-full text-sm bg-slate-950"
                  required
                >
                  <option value="" disabled>Select a group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Spreadsheet CSV File
                </label>
                <div className="relative group cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    required
                  />
                  <div className="border border-dashed border-slate-700/50 group-hover:border-indigo-500/50 rounded-xl p-4 bg-slate-950/20 text-center transition-all duration-300 flex flex-col items-center justify-center">
                    <FileUp size={24} className="text-slate-500 group-hover:text-indigo-400 transition-colors mb-2" />
                    <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors truncate max-w-[200px]">
                      {file ? file.name : "Click to browse or drop CSV file here"}
                    </span>
                    <span className="text-[10px] text-slate-600 mt-1">
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : "Supports expenses_export.csv"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={uploading}
                className="btn-primary py-2.5 text-sm cursor-pointer"
              >
                {uploading ? 'Parsing CSV & Validating...' : 'Upload & Scan Anomalies'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Anomaly Review Dashboard */}
      {activeJob && activeJob.status === 'PENDING_REVIEW' && (
        <div className="space-y-6">
          {/* Header Summary */}
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-amber-400 animate-bounce" size={24} />
              <div>
                <h3 className="font-bold text-slate-200 text-sm">Validation Scanner Results</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  We scanned {activeJob.total_rows} rows and found <span className="font-bold text-amber-400">{anomalies.length} anomalies</span>. 
                  {unresolvedCount > 0 ? ` Please resolve the remaining ${unresolvedCount} pending items below.` : ' All anomalies resolved. You are ready to commit!'}
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 self-end sm:self-auto shrink-0">
              {unresolvedCount > 0 && (
                <button
                  onClick={handleAutoResolve}
                  disabled={resolvingAll}
                  className="btn-primary text-xs py-2 px-3 bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5 shadow-indigo-600/20 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles size={13} className="text-amber-300 animate-pulse" />
                  <span>{resolvingAll ? 'Resolving...' : 'AI Auto-Resolve'}</span>
                </button>
              )}
              {unresolvedCount === 0 && (
                <button
                  onClick={handleCommit}
                  disabled={committing}
                  className="btn-primary text-xs py-2 px-3 bg-emerald-600 hover:bg-emerald-500 flex items-center gap-1 shadow-emerald-600/20 cursor-pointer"
                >
                  {committing ? 'Importing...' : 'Commit Import'}
                </button>
              )}
            </div>
          </div>

          {/* Anomaly Cards List */}
          <div className="space-y-4">
            {anomalies.map((anom) => {
              const isPending = anom.status === 'PENDING';
              return (
                <div 
                  key={anom.id} 
                  className={`glass-panel p-5 border-l-4 transition-all ${
                    isPending ? 'border-l-amber-500' : 'border-l-emerald-500 bg-slate-900/20 opacity-80'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-bold">
                          Row {anom.row_number}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                          {anom.anomaly_type.replace('_', ' ')}
                        </span>
                        {!isPending && (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                            Resolved: {anom.resolution_action}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-200 text-sm font-semibold mt-2">{anom.description}</p>
                      
                      {/* Raw row preview */}
                      <div className="mt-3 p-3 bg-slate-950/60 rounded-lg text-[10px] text-slate-500 font-mono">
                        <span className="text-slate-400 font-semibold block mb-1">CSV Raw Data:</span>
                        {JSON.stringify(anom.raw_data)}
                      </div>
                    </div>

                    {/* Resolution Action Trigger Panel */}
                    {isPending && (
                      <div className="shrink-0 space-y-2 max-w-[200px]">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Choose Resolution:</span>
                        
                        {/* Duplicate resolutions */}
                        {anom.anomaly_type === 'DUPLICATE' && (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => handleResolveAnomaly(anom.id, 'APPROVED')}
                              className="btn-secondary py-1.5 px-3 text-[11px] text-slate-200 hover:text-emerald-400 hover:border-emerald-500/30"
                            >
                              Import Duplicate
                            </button>
                            <button
                              onClick={() => handleResolveAnomaly(anom.id, 'IGNORED')}
                              className="btn-secondary py-1.5 px-3 text-[11px] text-slate-200 hover:text-rose-400 hover:border-rose-500/30"
                            >
                              Skip Row
                            </button>
                          </div>
                        )}

                        {/* Unknown member mapping */}
                        {anom.anomaly_type === 'UNKNOWN_MEMBER' && (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => handleResolveAnomaly(anom.id, 'CREATE_SHELL_USER')}
                              className="btn-secondary py-1.5 px-3 text-[11px] text-slate-200 hover:text-indigo-400 hover:border-indigo-500/30 flex items-center gap-1"
                            >
                              <UserPlus size={10} />
                              <span>Create Inactive User</span>
                            </button>
                            <select
                              onChange={(e) => handleResolveAnomaly(anom.id, `MAP_TO_USER:${e.target.value}`)}
                              className="glass-input py-1 px-2 text-[10px] bg-slate-950 w-full"
                              defaultValue=""
                            >
                              <option value="" disabled>Map to system user...</option>
                              {allSystemUsers.map(uname => (
                                <option key={uname} value={uname}>{uname}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Inconsistent split */}
                        {anom.anomaly_type === 'INCONSISTENT_SPLIT' && (
                          <button
                            onClick={() => handleResolveAnomaly(anom.id, 'FORCE_EQUAL')}
                            className="btn-secondary py-1.5 px-3 text-[11px] w-full text-slate-200 hover:text-indigo-400"
                          >
                            Force Equal Split
                          </button>
                        )}

                        {/* Settlement suggestions */}
                        {anom.anomaly_type === 'SETTLEMENT_AS_EXPENSE' && (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => handleResolveAnomaly(anom.id, 'IMPORT_AS_SETTLEMENT')}
                              className="btn-secondary py-1.5 px-3 text-[11px] text-slate-200 hover:text-emerald-400"
                            >
                              Import as Settlement
                            </button>
                            <button
                              onClick={() => handleResolveAnomaly(anom.id, 'APPROVED')}
                              className="btn-secondary py-1.5 px-3 text-[11px] text-slate-200 hover:text-indigo-400"
                            >
                              Import as Expense
                            </button>
                          </div>
                        )}

                        {/* Membership Violation */}
                        {anom.anomaly_type === 'MEMBERSHIP_VIOLATION' && (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => handleResolveAnomaly(anom.id, 'AUTO_JOIN_OR_EXTEND')}
                              className="btn-secondary py-1.5 px-3 text-[11px] text-slate-200 hover:text-emerald-400"
                            >
                              Extend Join Dates
                            </button>
                            <button
                              onClick={() => handleResolveAnomaly(anom.id, 'IGNORED')}
                              className="btn-secondary py-1.5 px-3 text-[11px] text-slate-200 hover:text-rose-400"
                            >
                              Skip Row
                            </button>
                          </div>
                        )}

                        {/* Standard Default fallback for error rows */}
                        {!['DUPLICATE', 'UNKNOWN_MEMBER', 'INCONSISTENT_SPLIT', 'SETTLEMENT_AS_EXPENSE', 'MEMBERSHIP_VIOLATION'].includes(anom.anomaly_type) && (
                          <button
                            onClick={() => handleResolveAnomaly(anom.id, 'IGNORED')}
                            className="btn-secondary py-1.5 px-3 text-[11px] w-full text-slate-200 hover:text-rose-400"
                          >
                            Skip Invalid Row
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {unresolvedCount > 0 ? (
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/10 text-xs text-slate-500 text-center">
              Please resolve all anomalies to enable the 'Commit Import' database transaction.
            </div>
          ) : (
            <div className="flex justify-end pt-4">
              <button
                onClick={handleCommit}
                disabled={committing}
                className="btn-primary py-3 px-6 text-sm font-semibold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/15 cursor-pointer"
              >
                {committing ? 'Applying database records...' : 'Commit Import'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* IMPORT REPORT VIEWER */}
      {report && (
        <div className="glass-panel p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <CheckCircle className="text-emerald-400 shrink-0" size={28} />
            <div>
              <h3 className="text-xl font-bold text-slate-100">Import Complete Report</h3>
              <p className="text-xs text-slate-500 mt-0.5">Report generated at: {new Date(report.timestamp).toLocaleString()}</p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Processed</span>
              <span className="text-2xl font-extrabold text-slate-300 mt-1.5 block">{report.total_rows} rows</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Success</span>
              <span className="text-2xl font-extrabold text-emerald-400 mt-1.5 block">{report.successful_imports}</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Skipped/Failed</span>
              <span className="text-2xl font-extrabold text-rose-400 mt-1.5 block">{report.failed_imports + (report.total_rows - report.successful_imports - report.failed_imports)}</span>
            </div>
          </div>

          {/* Detail Logs */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-300 text-sm flex items-center gap-1.5">
              <FileText size={16} />
              <span>Row Resolution Logs</span>
            </h4>
            
            <div className="max-h-[300px] overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-850 p-2 space-y-2 bg-slate-950/20">
              {report.row_details.map((detail, idx) => (
                <div key={idx} className="py-2.5 px-3 flex items-center justify-between text-xs hover:bg-slate-900/10">
                  <div>
                    <span className="font-mono text-slate-500 font-bold mr-2">Row {detail.row}</span>
                    <span className="font-semibold text-slate-200">{detail.title || 'Untitled'}</span>
                    {detail.error && (
                      <span className="block text-rose-400 text-[10px] mt-0.5 italic">{detail.error}</span>
                    )}
                    {detail.reason && (
                      <span className="block text-slate-500 text-[10px] mt-0.5">{detail.reason}</span>
                    )}
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    detail.status === 'IMPORTED_AS_EXPENSE' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10' :
                    detail.status === 'IMPORTED_AS_SETTLEMENT' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
                    detail.status === 'SKIPPED' ? 'bg-slate-800 text-slate-500' : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    {detail.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              onClick={() => {
                setFile(null);
                setActiveJob(null);
                setReport(null);
              }}
              className="btn-primary text-xs cursor-pointer"
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
