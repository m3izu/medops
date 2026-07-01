import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ACTION_TYPES = [
  { value: 'INBOUND', label: 'INBOUND (Delivery)' },
  { value: 'OUTBOUND', label: 'OUTBOUND (Clinical Dispense)' },
  { value: 'DISCARD', label: 'DISCARD (Waste/Expiry)' },
  { value: 'ADJUSTMENT', label: 'ADJUSTMENT (Stocktake count)' },
  { value: 'CANCEL', label: 'CANCEL (Requisition Cancelled)' },
];

const Transactions = () => {
  const { user, hasPermission } = useAuth();

  const [logs, setLogs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected Log for details / comments
  const [selectedLog, setSelectedLog] = useState(null);

  // Filters State
  const [filterType, setFilterType] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Add Comment Form State
  const [commentText, setCommentText] = useState('');
  const [isFlagged, setIsFlagged] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType) params.type = filterType;
      if (filterItemId) params.itemId = filterItemId;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;

      const response = await api.get('/stock/transactions', { params });
      setLogs(response.data || []);
      
      // Update selected log reference if currently open
      if (selectedLog) {
        const updated = response.data.find(l => l.id === selectedLog.id);
        if (updated) setSelectedLog(updated);
      }
      setError('');
    } catch (err) {
      console.error('Error fetching transactions log:', err);
      setError('Failed to fetch transaction log records.');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data || []);
    } catch (err) {
      console.error('Error fetching items list:', err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [filterType, filterItemId, filterFrom, filterTo]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedLog) return;

    try {
      setSubmittingComment(true);
      await api.post(`/mgmt/logs/${selectedLog.id}/comment`, { commentText, isFlagged });
      setCommentText('');
      setIsFlagged(false);
      // Reload logs to fetch updated comments
      await fetchLogs();
    } catch (err) {
      console.error('Failed to submit comment:', err);
      alert(err.response?.data?.error || 'Failed to add comment.');
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

  const getBadgeClass = (type) => {
    switch (type) {
      case 'INBOUND':
        return 'badge-success';
      case 'OUTBOUND':
        return 'badge-neutral';
      case 'DISCARD':
      case 'CANCEL':
        return 'badge-critical';
      default:
        return 'badge-warning';
    }
  };

  if (!hasPermission('view_inventory_logs')) {
    return (
      <div className="page-container">
        <div className="widget-card" style={{ borderLeft: '4px solid var(--color-critical)' }}>
          <div className="widget-header">
            <span className="widget-title">Access Denied</span>
          </div>
          <div className="widget-body">
            <p style={{ color: 'var(--theme-text-muted)' }}>
              You do not have the required permission (`view_inventory_logs`) to view the system transaction logs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const canComment = hasPermission('comment_on_logs');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Inventory Transaction Logs</h2>
          <p className="page-title-desc">View real-time inventory adjustments and co-sign notes or flag anomalies in clinical operations.</p>
        </div>
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-item" style={{ minWidth: '150px' }}>
          <label>Adjustment Type</label>
          <select 
            className="form-control"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All Transactions</option>
            {ACTION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-item" style={{ flexGrow: 1, minWidth: '200px' }}>
          <label>Inventory Item</label>
          <select 
            className="form-control"
            value={filterItemId}
            onChange={(e) => setFilterItemId(e.target.value)}
          >
            <option value="">All Items...</option>
            {items.map(item => (
              <option key={item.id} value={item.id}>
                [{item.sku}] {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-item" style={{ minWidth: '130px' }}>
          <label>From Date</label>
          <input 
            type="date" 
            className="form-control" 
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </div>

        <div className="filter-item" style={{ minWidth: '130px' }}>
          <label>To Date</label>
          <input 
            type="date" 
            className="form-control" 
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedLog ? '1.5fr 1fr' : '1fr', gap: '24px', transition: 'grid-template-columns 0.3s ease' }}>
        
        {/* Left Side: Logs Table */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Audit Trail logs</span>
            <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
              {logs.length} Entries Loaded
            </span>
          </div>

          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading transaction logs...</p>
            ) : logs.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                No transaction logs matched your selected query filters.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Item Name</th>
                    <th>Quantity</th>
                    <th>Logged By</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const hasFlaggedComments = log.mgmtComments?.some(c => c.isFlagged);
                    const qtyPrefix = log.type === 'INBOUND' ? '+' : '-';
                    return (
                      <tr 
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        style={{ 
                          cursor: 'pointer',
                          backgroundColor: selectedLog?.id === log.id ? 'var(--theme-primary-bg)' : 'transparent'
                        }}
                      >
                        <td style={{ fontSize: '13px' }}>
                          {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td>
                          <span className={`badge ${getBadgeClass(log.type)}`}>
                            {log.type}
                          </span>
                        </td>
                        <td>
                          <div>
                            <strong>{log.item.name}</strong>
                            {log.batch && (
                              <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                                Batch: <code>{log.batch.batchNo}</code> • Exp: {new Date(log.batch.expiryDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <strong>{qtyPrefix}{log.qty}</strong> <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{log.item.unit}</span>
                        </td>
                        <td style={{ fontSize: '13px' }}>
                          {log.user.name} <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>({log.user.role.replace('_', ' ')})</span>
                        </td>
                        <td>
                          {hasFlaggedComments && <span style={{ fontSize: '16px', color: 'var(--color-critical)' }}>🚩</span>}
                          {log.mgmtComments?.length > 0 && !hasFlaggedComments && <span style={{ fontSize: '14px', color: 'var(--theme-text-muted)' }}>💬</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: Log Comments & Details */}
        {selectedLog && (
          <div className="widget-card" style={{ alignSelf: 'start' }}>
            <div className="widget-header">
              <span className="widget-title">📜 Log Entry Details</span>
              <button 
                className="modal-close" 
                onClick={() => setSelectedLog(null)}
                style={{ fontSize: '14px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--theme-text-muted)' }}
              >
                Close ✕
              </button>
            </div>

            <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span className={`badge ${getBadgeClass(selectedLog.type)}`} style={{ marginBottom: '8px' }}>{selectedLog.type}</span>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>{selectedLog.item.name}</h3>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>SKU: <code>{selectedLog.item.sku}</code> • Transaction ID: {selectedLog.id}</span>
              </div>

              <div style={{ background: 'var(--theme-bg)', padding: '12px 16px', borderRadius: 'var(--border-radius-md)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>
                  <strong>Quantity Adjusted:</strong> {selectedLog.type === 'INBOUND' ? '+' : '-'}{selectedLog.qty} {selectedLog.item.unit}
                </div>
                <div>
                  <strong>Logged By:</strong> {selectedLog.user.name} ({selectedLog.user.role.replace('_', ' ')})
                </div>
                <div>
                  <strong>Time Logged:</strong> {new Date(selectedLog.timestamp).toLocaleString()}
                </div>
                {selectedLog.batch && (
                  <>
                    <div>
                      <strong>Batch Number:</strong> <code>{selectedLog.batch.batchNo}</code>
                    </div>
                    <div>
                      <strong>Batch Expiry:</strong> {new Date(selectedLog.batch.expiryDate).toLocaleDateString()}
                    </div>
                  </>
                )}
                {selectedLog.notes && (
                  <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--theme-border)' }}>
                    <strong>Intake Notes:</strong>
                    <p style={{ marginTop: '2px', fontStyle: 'italic', color: 'var(--theme-text-muted)' }}>
                      "{selectedLog.notes}"
                    </p>
                  </div>
                )}
              </div>

              {/* Management Comments Section */}
              <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                <strong style={{ display: 'block', marginBottom: '12px', fontSize: '14px' }}>
                  Management Remarks & Flags ({selectedLog.mgmtComments?.length || 0})
                </strong>

                {selectedLog.mgmtComments && selectedLog.mgmtComments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                    {selectedLog.mgmtComments.map(comment => (
                      <div 
                        key={comment.id} 
                        style={{ 
                          padding: '10px 12px', 
                          background: comment.isFlagged ? 'var(--color-critical-bg)' : 'var(--theme-bg)', 
                          borderRadius: 'var(--border-radius-md)',
                          fontSize: '12px',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: '600' }}>
                          <span>{comment.commentedBy.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{ color: 'var(--theme-text)', paddingRight: '24px' }}>{comment.commentText}</p>
                        
                        {/* Flag Indicator / Toggle */}
                        <button
                          onClick={() => canComment && handleToggleFlag(comment.id)}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'none',
                            border: 'none',
                            cursor: canComment ? 'pointer' : 'default',
                            fontSize: '14px',
                            opacity: comment.isFlagged ? 1 : 0.2
                          }}
                          title={canComment ? 'Toggle administrative alert flag' : 'Flag status'}
                          disabled={!canComment}
                        >
                          🚩
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginBottom: '16px', fontStyle: 'italic' }}>
                    No management comments compiled for this transaction log.
                  </p>
                )}

                {/* Add Comment Form */}
                {canComment && (
                  <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Add review notes, flag errors..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        required
                        disabled={submittingComment}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={isFlagged}
                          onChange={(e) => setIsFlagged(e.target.checked)}
                          disabled={submittingComment}
                        />
                        Flag this transaction (triggers Admin Alert)
                      </label>
                      <button 
                        type="submit" 
                        className="btn btn-primary btn-sm"
                        disabled={submittingComment || !commentText.trim()}
                      >
                        Submit
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

export default Transactions;
