import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { CheckCircle, FileText, ArrowLeft, Calendar, LayoutGrid } from 'lucide-react';

export const ImportReportViewer = () => {
  const { id: jobId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/imports/${jobId}/report/`);
        setReport(res.data);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load report", err);
        setLoading(false);
      }
    };
    fetchReport();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="glass-panel p-8 text-center space-y-4 max-w-md mx-auto mt-12">
        <h3 className="font-bold text-lg text-slate-300">Report Not Found</h3>
        <p className="text-slate-500 text-sm">We couldn't retrieve the report details for this import job.</p>
        <Link to="/dashboard" className="btn-primary py-2 text-xs inline-block">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300">
        <ArrowLeft size={14} />
        <Link to="/dashboard" className="font-semibold">Back to Dashboard</Link>
      </div>

      <div className="glass-panel p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <CheckCircle className="text-emerald-400 shrink-0" size={28} />
          <div>
            <h3 className="text-xl font-bold text-slate-100">Import Complete Report</h3>
            <p className="text-xs text-slate-500 mt-0.5">Report generated at: {new Date(report.timestamp).toLocaleString()}</p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Processed</span>
            <span className="text-xl font-extrabold text-slate-300 mt-1 block">{report.total_rows} rows</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Success</span>
            <span className="text-xl font-extrabold text-emerald-400 mt-1 block">{report.successful_imports}</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Skipped/Failed</span>
            <span className="text-xl font-extrabold text-rose-400 mt-1 block">
              {report.total_rows - report.successful_imports}
            </span>
          </div>
        </div>

        {/* Action Logs */}
        <div className="space-y-3">
          <h4 className="font-bold text-slate-300 text-sm flex items-center gap-1.5">
            <FileText size={16} />
            <span>Row Resolution Logs</span>
          </h4>
          
          <div className="max-h-[350px] overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-850 p-2 space-y-2 bg-slate-950/20">
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

        {/* Resolved list */}
        {report.anomalies_resolved && report.anomalies_resolved.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-300 text-sm">Anomalies Handled</h4>
            <div className="flex flex-wrap gap-2">
              {report.anomalies_resolved.map((anom, idx) => (
                <div key={idx} className="p-2 border border-slate-800 bg-slate-900/10 rounded-lg text-[10px] text-slate-400">
                  <span className="font-bold text-amber-400">Row {anom.row} {anom.type}:</span> {anom.action}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
