import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import BackupManager from '../components/BackupManager';

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

  // Selected report detail modal
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

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

  const handleViewDetails = async (reportId) => {
    try {
      setDetailsLoading(true);
      const res = await api.get(`/reports/${reportId}`);
      setSelectedReport(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load report details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleTriggerPrint = () => {
    window.print();
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
                      <th>Actions</th>
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
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleViewDetails(r.id)}
                            disabled={detailsLoading}
                          >
                            {detailsLoading ? 'Loading...' : '🔍 Open & Download'}
                          </button>
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

      {/* Database Backup & Rollback Manager (Top Admin Only) */}
      {isTopAdmin && <BackupManager />}

      {/* Selected report details modal */}
      {selectedReport && (
        <div className="modal-overlay" onClick={() => setSelectedReport(null)}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Monthly Report Overview</span>
              <button className="modal-close" onClick={() => setSelectedReport(null)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--theme-bg)', padding: '16px', borderRadius: 'var(--border-radius-md)', marginBottom: '20px' }}>
                <div>
                  <strong>Report ID:</strong> <code style={{ fontSize: '12px' }}>{selectedReport.report.id}</code><br/>
                  <strong>Period:</strong> {formatPeriod(selectedReport.report.periodStart, selectedReport.report.periodEnd)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>Generated By:</strong> {selectedReport.report.generatedBy.name}<br/>
                  <strong>Generated At:</strong> {new Date(selectedReport.report.generatedAt).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontWeight: '600' }}>Sections Data Tally:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>1. Inventory Snapshot Catalog count:</span>
                    <strong>{selectedReport.data.inventorySummary?.length || 0} items</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>2. Items Below Reorder Warning:</span>
                    <strong>{(selectedReport.data.inventorySummary || []).filter(i => i.stockLevel && i.stockLevel.quantityOnHand <= i.warningLevel).length || 0} items</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>3. Expiring Medication Batches:</span>
                    <strong>{selectedReport.data.expiringBatches?.length || 0} batches</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>4. Inbound Deliveries Logged:</span>
                    <strong>{selectedReport.data.inboundLogs?.length || 0} logs</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>5. Clinical Dispensing (OUTBOUND):</span>
                    <strong>{selectedReport.data.outboundLogs?.length || 0} logs</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>6. Discards / Waste Logs:</span>
                    <strong>{selectedReport.data.discardLogs?.length || 0} logs</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>7. Stocktake Adjustments:</span>
                    <strong>{selectedReport.data.adjustmentLogs?.length || 0} logs</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>8. Requisition Requests:</span>
                    <strong>{selectedReport.data.requisitions?.length || 0} forms</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--theme-border)' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedReport(null)}>
                Close
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleTriggerPrint}
              >
                🖨️ Download PDF / Print Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden print container. Rendered whenever selectedReport is loaded */}
      {selectedReport && (
        <div id="printable-report-area">
          <div className="print-header" style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '15px' }}>
            <h1 style={{ color: '#0d9488', fontSize: '24px', margin: '0 0 6px 0' }}>HEALING HANDS CENTER — MONTHLY INVENTORY REPORT</h1>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>MedOPS Analytics & Compliance Archive</p>
          </div>
          
          <div className="print-metadata" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', fontSize: '12px', color: '#475569' }}>
            <div>
              <strong>Report ID:</strong> {selectedReport.report.id}<br/>
              <strong>Period:</strong> {formatPeriod(selectedReport.report.periodStart, selectedReport.report.periodEnd)}
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong>Generated By:</strong> {selectedReport.report.generatedBy.name}<br/>
              <strong>Generated At:</strong> {new Date(selectedReport.report.generatedAt).toLocaleString()}
            </div>
          </div>

          {/* 1. Inventory Summary Snapshot */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>1. Stock Inventory Summary (Current QoH)</h3>
            {!selectedReport.data.inventorySummary || selectedReport.data.inventorySummary.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>No items registered in catalog.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Item Name</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>SKU</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Classification</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Unit</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Quantity On Hand</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.inventorySummary.map(item => (
                    <tr key={item.id}>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{item.name}</strong></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><code>{item.sku}</code></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{item.itemType}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{item.unit}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right' }}>{item.stockLevel?.quantityOnHand ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 2. Items below warning/critical */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>2. Items Below Warning / Critical Levels</h3>
            {(!selectedReport.data.inventorySummary || selectedReport.data.inventorySummary.filter(item => item.stockLevel && item.stockLevel.quantityOnHand <= item.warningLevel).length === 0) ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>All items currently within safe operating limits.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Item Name</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>SKU</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Current Quantity</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Warning Level</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Critical Level</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'center' }}>Alert Level</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.inventorySummary.filter(item => item.stockLevel && item.stockLevel.quantityOnHand <= item.warningLevel).map(item => {
                    const qty = item.stockLevel?.quantityOnHand ?? 0;
                    const isCritical = qty <= item.criticalLevel;
                    return (
                      <tr key={item.id}>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{item.name}</strong></td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><code>{item.sku}</code></td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right' }}>{qty} {item.unit}</td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right' }}>{item.warningLevel}</td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right' }}>{item.criticalLevel}</td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'center', fontWeight: 'bold', color: isCritical ? '#ef4444' : '#f59e0b' }}>
                          {isCritical ? 'CRITICAL' : 'WARNING'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 3. Expiring Medication Batches */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>3. Expiring Medication Batches (Within 90 Days)</h3>
            {!selectedReport.data.expiringBatches || selectedReport.data.expiringBatches.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>No medication batches are expiring within 90 days.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Medication Name</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Batch Number</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Expiry Date</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Remaining Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.expiringBatches.map(batch => (
                    <tr key={batch.id}>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{batch.item.name}</strong></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><code>{batch.batchNo || 'N/A'}</code></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{new Date(batch.expiryDate).toLocaleDateString()}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right' }}>{batch.quantityRemaining} pcs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 4. Inbound Deliveries */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>4. Inbound Deliveries & Received Stock</h3>
            {!selectedReport.data.inboundLogs || selectedReport.data.inboundLogs.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>No inbound stock deliveries logged in this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Time Logged</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Item Name</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Quantity Received</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.inboundLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{log.item.name}</strong></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>+{log.qty}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{log.user.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 5. Clinical Dispensing Log */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>5. Clinical Dispensing (OUTBOUND) Log</h3>
            {!selectedReport.data.outboundLogs || selectedReport.data.outboundLogs.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>No clinical dispensing transactions logged in this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Time Logged</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Item Name</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Quantity Dispensed</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.outboundLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{log.item.name}</strong></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>-{log.qty}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{log.user.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 6. Waste & Discard Log */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>6. Waste & Discard Log</h3>
            {!selectedReport.data.discardLogs || selectedReport.data.discardLogs.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>No discards logged in this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Time Logged</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Item Name</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Quantity Discarded</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Reason</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Notes</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.discardLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{log.item.name}</strong></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right', color: '#ef4444', fontWeight: 'bold' }}>-{log.qty}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{log.reason}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{log.notes || '—'}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{log.loggedBy.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 7. Stocktake Adjustments */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>7. Stocktake Adjustments</h3>
            {!selectedReport.data.adjustmentLogs || selectedReport.data.adjustmentLogs.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>No stocktake adjustments applied in this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Time Logged</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Item Name</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Quantity Adjusted</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Notes</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.adjustmentLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{log.item.name}</strong></td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'right', fontWeight: 'bold', color: log.qty > 0 ? '#10b981' : '#ef4444' }}>
                        {log.qty > 0 ? `+${log.qty}` : log.qty}
                      </td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{log.notes || '—'}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{log.user.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 8. Requisition Activity */}
          <div className="print-section" style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', textTransform: 'uppercase' }}>8. Requisition Activity Summary</h3>
            {!selectedReport.data.requisitions || selectedReport.data.requisitions.length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '12px', color: '#94a3b8' }}>No requisitions submitted in this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '8px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Time Submitted</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Patient</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Submitted By</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'center' }}>Status</th>
                    <th style={{ borderBottom: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Requested Items</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.data.requisitions.map(req => (
                    <tr key={req.id}>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{new Date(req.createdAt).toLocaleString()}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}><strong>{req.patient.name}</strong> ({req.patient.chartNumber})</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>{req.submittedBy.name}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{req.status}</td>
                      <td style={{ borderBottom: '1px solid #f1f5f9', padding: '6px' }}>
                        {req.lines.map(line => `• ${line.item.name} (Qty requested: ${line.qtyRequested}, approved: ${line.qtyApproved || 0})`).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
