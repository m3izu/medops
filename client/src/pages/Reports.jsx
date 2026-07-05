import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const REPORT_SECTIONS = [
  'Stock Inventory Summary (all items, current QoH)',
  'Items Below Warning / Critical Level',
  'Expiring Medication Batches (within 90 days)',
  'Inbound Deliveries & Received Stock',
  'Clinical Dispensing (OUTBOUND) Log',
  'Waste & Discard Log',
  'Stocktake Adjustments',
  'Requisition Activity Summary (per patient / per nurse)',
];

const Reports = () => {
  const { user } = useAuth();

  const [reports,      setReports]      = useState([]);
  const [schedule,     setSchedule]     = useState({ dayOfMonth: 1, isActive: true });
  const [loading,      setLoading]      = useState(true);
  const [schedLoading, setSchedLoading] = useState(true);
  const [error,        setError]        = useState('');

  // Generate report
  const [generating,   setGenerating]   = useState(false);
  const [genSuccess,   setGenSuccess]   = useState('');

  // Schedule editing
  const [editDay,      setEditDay]      = useState(1);
  const [editActive,   setEditActive]   = useState(true);
  const [savingSched,  setSavingSched]  = useState(false);
  const [schedSaved,   setSchedSaved]   = useState(false);

  const isTopAdmin = user?.role === 'TOP_ADMIN';

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reports');
      setReports(res.data || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load report archive.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedule = async () => {
    if (!isTopAdmin) return;
    try {
      setSchedLoading(true);
      const res = await api.get('/reports/schedule');
      setSchedule(res.data);
      setEditDay(res.data.dayOfMonth);
      setEditActive(res.data.isActive);
    } catch (err) {
      console.error(err);
    } finally {
      setSchedLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    fetchSchedule();
  }, []);

  const handleGenerate = async () => {
    if (!confirm('Manually generate a monthly report now? This will compile all 8 report sections for the current period.')) return;
    try {
      setGenerating(true);
      setGenSuccess('');
      const res = await api.post('/reports/generate');
      const r = res.data;
      setGenSuccess(
        `Report generated for period ${new Date(r.periodStart).toLocaleDateString()} – ${new Date(r.periodEnd).toLocaleDateString()}`
      );
      await fetchReports();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      setSavingSched(true);
      setSchedSaved(false);
      await api.put('/reports/schedule', { dayOfMonth: editDay, isActive: editActive });
      setSchedule({ dayOfMonth: editDay, isActive: editActive });
      setSchedSaved(true);
      setTimeout(() => setSchedSaved(false), 3000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to update schedule.');
    } finally {
      setSavingSched(false);
    }
  };

  const formatPeriod = (start, end) =>
    `${new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Monthly Report Archive</h2>
          <p className="page-title-desc">
            View generated monthly inventory reports. Top Admins can manually trigger report generation and configure the automatic report schedule.
          </p>
        </div>
        {isTopAdmin && (
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '⏳ Generating...' : '⚡ Generate Report Now'}
          </button>
        )}
      </div>

      {error    && <div className="login-error" style={{ margin: 0 }}>{error}</div>}
      {genSuccess && (
        <div style={{ padding: '12px 16px', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 'var(--border-radius-md)', fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
          ✓ {genSuccess}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isTopAdmin ? '1fr 360px' : '1fr', gap: '24px' }}>

        {/* Main: Report Archive List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Report archive */}
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">Generated Report Archive</span>
              <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                {reports.length} report(s) on record
              </span>
            </div>
            <div className="widget-body" style={{ padding: 0 }}>
              {loading ? (
                <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading report archive...</p>
              ) : reports.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
                  <p style={{ fontWeight: '500', marginBottom: '6px' }}>No reports generated yet.</p>
                  {isTopAdmin && (
                    <p style={{ fontSize: '13px' }}>
                      Use the <strong>"Generate Report Now"</strong> button to create the first monthly inventory report.
                    </p>
                  )}
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Report Period</th>
                      <th>Generated By</th>
                      <th>Generated At</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r, idx) => (
                      <tr key={r.id}>
                        <td style={{ color: 'var(--theme-text-muted)', fontSize: '12px' }}>
                          #{reports.length - idx}
                        </td>
                        <td>
                          <strong>{formatPeriod(r.periodStart, r.periodEnd)}</strong>
                        </td>
                        <td style={{ fontSize: '13px' }}>
                          {r.generatedBy.name}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                          {new Date(r.generatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td>
                          {r.pdfPath ? (
                            <span className="badge badge-success">PDF Ready</span>
                          ) : (
                            <span className="badge badge-warning">Data Record</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Report Sections Reference */}
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">📑 Monthly Report Contents</span>
              <span className="badge badge-neutral">8 Sections</span>
            </div>
            <div className="widget-body">
              <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginBottom: '16px' }}>
                Each generated monthly report compiles the following 8 sections covering the full reporting period:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                {REPORT_SECTIONS.map((section, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 14px',
                      background: 'var(--theme-bg)',
                      borderRadius: 'var(--border-radius-md)',
                      fontSize: '13px',
                    }}
                  >
                    <span style={{
                      minWidth: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'var(--theme-primary)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ color: 'var(--theme-text)', lineHeight: '1.4' }}>{section}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Top Admin controls */}
        {isTopAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Auto-schedule config */}
            <div className="widget-card" style={{ alignSelf: 'start' }}>
              <div className="widget-header">
                <span className="widget-title">⏰ Auto-Schedule Config</span>
                {schedule.isActive ? (
                  <span className="badge badge-success">Active</span>
                ) : (
                  <span className="badge badge-neutral">Paused</span>
                )}
              </div>
              <div className="widget-body">
                <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginBottom: '16px' }}>
                  Configure the day of month when a monthly report is automatically generated by the system scheduler.
                </p>

                {schedLoading ? (
                  <p style={{ color: 'var(--theme-text-muted)', fontSize: '13px' }}>Loading schedule...</p>
                ) : (
                  <form onSubmit={handleSaveSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-group">
                      <label className="form-label">Day of Month</label>
                      <select
                        className="form-control"
                        value={editDay}
                        onChange={e => setEditDay(Number(e.target.value))}
                      >
                        {DAYS.map(d => (
                          <option key={d} value={d}>
                            {d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of each month
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={editActive}
                          onChange={e => setEditActive(e.target.checked)}
                        />
                        <span style={{ fontSize: '14px' }}>
                          Enable automatic report generation
                        </span>
                      </label>
                    </div>

                    {schedSaved && (
                      <div style={{ padding: '8px 12px', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 'var(--border-radius-sm)', fontSize: '12px', fontWeight: '500' }}>
                        ✓ Schedule saved successfully
                      </div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={savingSched}
                      style={{ width: '100%' }}
                    >
                      {savingSched ? 'Saving...' : 'Save Schedule'}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="widget-card" style={{ alignSelf: 'start' }}>
              <div className="widget-header">
                <span className="widget-title">Report Stats</span>
              </div>
              <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--theme-text-muted)' }}>Total Reports Generated</span>
                  <strong>{reports.length}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--theme-text-muted)' }}>Last Report</span>
                  <strong>
                    {reports.length > 0
                      ? new Date(reports[0].generatedAt).toLocaleDateString()
                      : '—'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--theme-text-muted)' }}>Auto-Schedule</span>
                  <strong style={{ color: schedule.isActive ? 'var(--color-success)' : 'var(--theme-text-muted)' }}>
                    {schedule.isActive ? `Day ${schedule.dayOfMonth} of month` : 'Disabled'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--theme-text-muted)' }}>Report Sections</span>
                  <strong>8</strong>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
