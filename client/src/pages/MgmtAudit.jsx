import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TYPE_BADGES = {
  INBOUND:    'badge-success',
  OUTBOUND:   'badge-neutral',
  DISCARD:    'badge-critical',
  CANCEL:     'badge-critical',
  ADJUSTMENT: 'badge-warning',
};

const FILTER_TYPES = [
  { value: '',           label: 'All Transaction Types' },
  { value: 'INBOUND',   label: 'INBOUND — Stock Received' },
  { value: 'OUTBOUND',  label: 'OUTBOUND — Dispensed' },
  { value: 'DISCARD',   label: 'DISCARD — Waste / Expiry' },
  { value: 'CANCEL',    label: 'CANCEL — Requisition Voided' },
  { value: 'ADJUSTMENT',label: 'ADJUSTMENT — Stocktake Count' },
];

const MgmtAudit = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');
  const [filterLimit, setFilterLimit] = useState('100');

  // Comment form
  const [commentText,      setCommentText]      = useState('');
  const [isFlagged,        setIsFlagged]        = useState(false);
  const [submittingComment,setSubmittingComment] = useState(false);
  const [commentError,     setCommentError]     = useState('');

  const canComment = hasPermission('comment_on_logs');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = { limit: filterLimit };
      if (filterType) params.type = filterType;
      if (filterFrom) params.from = filterFrom;
      if (filterTo)   params.to   = filterTo;

      const res = await api.get('/mgmt/logs', { params });
      setLogs(res.data || []);
      // Refresh selected log details
      if (selectedLog) {
        const refreshed = (res.data || []).find(l => l.id === selectedLog.id);
        if (refreshed) setSelectedLog(refreshed);
      }
      setError('');
    } catch (err) {
      console.error('Error fetching mgmt audit logs:', err);
      setError('Failed to load audit log records.');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterFrom, filterTo, filterLimit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedLog) return;
    setCommentError('');
    try {
      setSubmittingComment(true);
      await api.post(`/mgmt/logs/${selectedLog.id}/comment`, { commentText, isFlagged });
      setCommentText('');
      setIsFlagged(false);
      await fetchLogs();
    } catch (err) {
      console.error('Comment failed:', err);
      setCommentError(err.response?.data?.error || 'Failed to submit comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleToggleFlag = async (commentId) => {
    if (!selectedLog) return;
    try {
      await api.patch(`/mgmt/logs/${selectedLog.id}/comments/${commentId}/flag`);
      await fetchLogs();
    } catch (err) {
      console.error('Toggle flag failed:', err);
      alert(err.response?.data?.error || 'Failed to toggle flag.');
    }
  };

  // Stats derived from logs
  const inboundCount  = logs.filter(l => l.type === 'INBOUND').length;
  const outboundCount = logs.filter(l => l.type === 'OUTBOUND').length;
  const discardCount  = logs.filter(l => l.type === 'DISCARD').length;
  const flaggedCount  = logs.filter(l => l.mgmtComments?.some(c => c.isFlagged)).length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>MedOPS Audit Feed</h2>
          <p className="page-title-desc">
            Real-time read-only view of all inventory transactions. Add remarks and flag anomalies for clinic administration.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchLogs}>↻ Refresh</button>
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Total Entries',    value: logs.length,   color: 'var(--theme-primary)' },
          { label: 'Stock Received',   value: inboundCount,  color: 'var(--color-success)' },
          { label: 'Dispensed',        value: outboundCount, color: 'var(--theme-text-muted)' },
          { label: 'Discarded / Waste',value: discardCount,  color: 'var(--color-warning)' },
          { label: '🚩 Flagged Entries',value: flaggedCount, color: 'var(--color-critical)' },
        ].map(stat => (
          <div key={stat.label} className="widget-card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-item" style={{ minWidth: '220px' }}>
          <label>Transaction Type</label>
          <select className="form-control" value={filterType} onChange={e => setFilterType(e.target.value)}>
            {FILTER_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-item" style={{ minWidth: '140px' }}>
          <label>From Date</label>
          <input type="date" className="form-control" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div className="filter-item" style={{ minWidth: '140px' }}>
          <label>To Date</label>
          <input type="date" className="form-control" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
        <div className="filter-item" style={{ minWidth: '110px' }}>
          <label>Limit</label>
          <select className="form-control" value={filterLimit} onChange={e => setFilterLimit(e.target.value)}>
            <option value="50">Last 50</option>
            <option value="100">Last 100</option>
            <option value="250">Last 250</option>
            <option value="500">Last 500</option>
          </select>
        </div>
      </div>

      {/* Main grid: Logs + Detail panel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedLog ? '1.6fr 1fr' : '1fr',
        gap: '24px',
        transition: 'grid-template-columns 0.3s ease',
      }}>

        {/* ── Left: Audit Log Table ── */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Inventory Transaction Records</span>
            <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
              {loading ? 'Loading...' : `${logs.length} entries`}
            </span>
          </div>
          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Fetching audit records...</p>
            ) : logs.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                No records match the selected filters.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Item</th>
                    <th>Qty Change</th>
                    <th>Batch</th>
                    <th>Logged By</th>
                    <th style={{ width: '60px' }}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const flagged    = log.mgmtComments?.some(c => c.isFlagged);
                    const hasComment = log.mgmtComments?.length > 0;
                    const isSelected = selectedLog?.id === log.id;
                    const loc        = log.location || 'ECART';
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--theme-primary-bg)' : 'transparent',
                          borderLeft: flagged ? '3px solid var(--color-critical)' : undefined,
                        }}
                      >
                        <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td>
                          <span className={`badge ${TYPE_BADGES[log.type] || 'badge-neutral'}`}>
                            {log.type}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                            {loc === 'ECART' ? '🛒 eCart' : '🏢 Central'}
                          </span>
                        </td>
                        <td>
                          <strong style={{ fontSize: '13px' }}>{log.item.name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                            <code>{log.item.sku}</code>
                          </div>
                        </td>
                        <td style={{ fontWeight: '600', fontSize: '13px', color: log.type === 'INBOUND' ? 'var(--color-success)' : 'var(--color-critical)' }}>
                          {log.type === 'INBOUND' ? '+' : '−'}{log.qty} {log.item.unit}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                          {log.batch ? <code>{log.batch.batchNo}</code> : '—'}
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <span 
                            style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--theme-primary)', fontWeight: 'bold' }}
                            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${log.userId || log.user?.id}`); }}
                            title="View Staff Profile & System Audit"
                          >
                            👤 {log.user.name}
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                            {log.user.role.replace(/_/g, ' ')}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {flagged    && <span title="Flagged by Management">🚩</span>}
                          {!flagged && hasComment && <span title="Has management remarks" style={{ opacity: 0.5 }}>💬</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Right: Selected Log Detail + Comment Panel ── */}
        {selectedLog && (
          <div className="widget-card" style={{ alignSelf: 'start', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="widget-header" style={{ position: 'sticky', top: 0, background: 'var(--theme-card-bg)', zIndex: 1 }}>
              <span className="widget-title">📋 Transaction Detail</span>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-text-muted)', fontSize: '14px' }}
              >
                Close ✕
              </button>
            </div>

            <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Core transaction info */}
              <div>
                <span className={`badge ${TYPE_BADGES[selectedLog.type] || 'badge-neutral'}`} style={{ marginBottom: '8px' }}>
                  {selectedLog.type}
                </span>
                <h3 style={{ fontSize: '17px', fontWeight: 'bold' }}>{selectedLog.item.name}</h3>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                  SKU: <code>{selectedLog.item.sku}</code>
                </span>
              </div>

              <div style={{
                background: 'var(--theme-bg)',
                padding: '12px 14px',
                borderRadius: 'var(--border-radius-md)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                <div>
                  <strong>Qty Adjusted:</strong>{' '}
                  <span style={{ color: selectedLog.type === 'INBOUND' ? 'var(--color-success)' : 'var(--color-critical)', fontWeight: '600' }}>
                    {selectedLog.type === 'INBOUND' ? '+' : '−'}{selectedLog.qty} {selectedLog.item.unit}
                  </span>
                </div>
                <div><strong>Logged By:</strong> {selectedLog.user.name} ({selectedLog.user.role.replace(/_/g, ' ')})</div>
                <div><strong>Timestamp:</strong> {new Date(selectedLog.timestamp).toLocaleString()}</div>
                {selectedLog.batch && (
                  <>
                    <div><strong>Batch No.:</strong> <code>{selectedLog.batch.batchNo}</code></div>
                    <div><strong>Batch Expiry:</strong> {new Date(selectedLog.batch.expiryDate).toLocaleDateString()}</div>
                  </>
                )}
                {selectedLog.notes && (
                  <div style={{ paddingTop: '6px', borderTop: '1px solid var(--theme-border)' }}>
                    <strong>Notes:</strong>
                    <p style={{ marginTop: '2px', fontStyle: 'italic', color: 'var(--theme-text-muted)', fontSize: '12px' }}>
                      "{selectedLog.notes}"
                    </p>
                  </div>
                )}
              </div>

              {/* Management Comments Section */}
              <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                <strong style={{ display: 'block', marginBottom: '12px', fontSize: '14px' }}>
                  Management Remarks ({selectedLog.mgmtComments?.length || 0})
                </strong>

                {selectedLog.mgmtComments?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                    {selectedLog.mgmtComments.map(c => (
                      <div
                        key={c.id}
                        style={{
                          padding: '10px 12px',
                          background: c.isFlagged ? 'var(--color-critical-bg)' : 'var(--theme-bg)',
                          borderRadius: 'var(--border-radius-md)',
                          fontSize: '12px',
                          borderLeft: c.isFlagged ? '3px solid var(--color-critical)' : 'none',
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <strong>{c.commentedBy.name}</strong>
                          <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{ color: 'var(--theme-text)', paddingRight: '28px', lineHeight: '1.4' }}>
                          {c.commentText}
                        </p>
                        {canComment && (
                          <button
                            onClick={() => handleToggleFlag(c.id)}
                            title={c.isFlagged ? 'Remove flag' : 'Flag this entry'}
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '14px',
                              opacity: c.isFlagged ? 1 : 0.25,
                              transition: 'opacity 0.15s',
                            }}
                          >
                            🚩
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--theme-text-muted)', fontStyle: 'italic', marginBottom: '16px' }}>
                    No management remarks on this entry yet.
                  </p>
                )}

                {/* Add Comment Form */}
                {canComment && (
                  <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {commentError && (
                      <div style={{ fontSize: '12px', color: 'var(--color-critical)', padding: '8px', background: 'var(--color-critical-bg)', borderRadius: 'var(--border-radius-sm)' }}>
                        {commentError}
                      </div>
                    )}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <textarea
                        className="form-control"
                        placeholder="Add an audit remark, note an anomaly, or document a concern..."
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        required
                        disabled={submittingComment}
                        style={{ minHeight: '70px', resize: 'vertical', fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: isFlagged ? 'var(--color-critical)' : 'var(--theme-text-muted)',
                        fontWeight: isFlagged ? '600' : 'normal',
                      }}>
                        <input
                          type="checkbox"
                          checked={isFlagged}
                          onChange={e => setIsFlagged(e.target.checked)}
                          disabled={submittingComment}
                        />
                        🚩 Flag as anomaly (notifies clinic admin)
                      </label>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={submittingComment || !commentText.trim()}
                      >
                        {submittingComment ? 'Submitting...' : 'Add Remark'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MgmtAudit;
