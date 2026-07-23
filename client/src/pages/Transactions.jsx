import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';

const ACTION_TYPES = [
  { value: 'INBOUND', label: 'INBOUND (Delivery)' },
  { value: 'OUTBOUND', label: 'OUTBOUND (Clinical Dispense)' },
  { value: 'DISCARD', label: 'DISCARD (Waste/Expiry)' },
  { value: 'ADJUSTMENT', label: 'ADJUSTMENT (Stocktake count)' },
  { value: 'CANCEL', label: 'CANCEL (Requisition Cancelled)' },
];

const Transactions = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [logs, setLogs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

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
    setCurrentPage(1);
  }, [filterType, filterItemId, filterFrom, filterTo]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedLog) return;

    try {
      setSubmittingComment(true);
      await api.post(`/mgmt/logs/${selectedLog.id}/comment`, { commentText, isFlagged });
      setCommentText('');
      setIsFlagged(false);
      toast.success('Comment added to audit record.');
      await fetchLogs();
    } catch (err) {
      console.error('Failed to submit comment:', err);
      const msg = err.response?.data?.error || 'Failed to add comment.';
      toast.error(msg);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleToggleFlag = async (commentId) => {
    if (!selectedLog) return;
    try {
      await api.patch(`/mgmt/logs/${selectedLog.id}/comments/${commentId}/flag`);
      await fetchLogs();
      toast.info('Comment flag toggled.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to toggle comment flag.');
    }
  };

  const exportAuditCSV = () => {
    if (!logs.length) return;
    const headers = ['Log ID', 'Timestamp', 'Action Type', 'Item Name', 'SKU', 'Qty Adjustment', 'Logged By', 'Role'];
    const rows = logs.map((log) => [
      `"${log.id.slice(-6).toUpperCase()}"`,
      `"${new Date(log.timestamp).toLocaleString()}"`,
      `"${log.type}"`,
      `"${(log.item?.name || '').replace(/"/g, '""')}"`,
      `"${(log.item?.sku || '').replace(/"/g, '""')}"`,
      `${log.type === 'INBOUND' ? '+' : '-'}${log.qty}`,
      `"${(log.user?.name || '').replace(/"/g, '""')}"`,
      `"${log.user?.role || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medops_audit_feed_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit feed exported to CSV!');
  };

  const getActionBadgeClass = (type) => {
    switch (type) {
      case 'INBOUND':
      case 'TRANSFER_IN':
        return 'badge-success';
      case 'OUTBOUND':
      case 'DISPENSE':
      case 'TRANSFER_OUT':
        return 'badge-warning';
      case 'DISCARD':
        return 'badge-critical';
      case 'ADJUSTMENT':
        return 'badge-primary';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>System Audit Feed & Inventory Transaction Logs</h2>
          <p className="page-title-desc">Immutable audit feed of stock movements, direct dispensations, inbound shipments, transfers, and management comments.</p>
        </div>
        <button className="btn btn-outline" onClick={exportAuditCSV} title="Export audit feed logs to CSV">
          📥 Export CSV
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      {/* Filter Chips & Bar */}
      <div className="filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--theme-text-muted)', marginRight: '4px' }}>Quick Type Filter:</span>
          <button className={`btn btn-sm ${filterType === '' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterType('')}>All Types</button>
          <button className={`btn btn-sm ${filterType === 'INBOUND' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterType('INBOUND')}>📥 Inbound</button>
          <button className={`btn btn-sm ${filterType === 'OUTBOUND' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterType('OUTBOUND')}>💊 Outbound</button>
          <button className={`btn btn-sm ${filterType === 'TRANSFER_IN' || filterType === 'TRANSFER_OUT' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterType('TRANSFER_OUT')}>🔄 Transfers</button>
          <button className={`btn btn-sm ${filterType === 'DISCARD' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterType('DISCARD')}>🗑 Discards</button>
          <button className={`btn btn-sm ${filterType === 'ADJUSTMENT' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterType('ADJUSTMENT')}>📝 Adjustments</button>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="filter-item" style={{ flexGrow: 1, minWidth: '200px' }}>
            <label>Filter by Item</label>
            <select className="form-control" value={filterItemId} onChange={(e) => setFilterItemId(e.target.value)}>
              <option value="">All Catalog Items</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  [{item.sku}] {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item" style={{ width: '150px' }}>
            <label>Date From</label>
            <input type="date" className="form-control" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </div>

          <div className="filter-item" style={{ width: '150px' }}>
            <label>Date To</label>
            <input type="date" className="form-control" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>

          <button className="btn btn-secondary btn-sm" onClick={() => { setFilterType(''); setFilterItemId(''); setFilterFrom(''); setFilterTo(''); }} style={{ marginTop: 'auto', padding: '8px 12px' }}>
            Reset Filters
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedLog ? '1.5fr 1fr' : '1fr', gap: '24px', transition: 'grid-template-columns 0.3s ease' }}>
        {/* Left Side: Audit Feed Table */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Transaction History</span>
            <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>{logs.length} records</span>
          </div>

          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading audit log feed...</p>
            ) : logs.length === 0 ? (
              <EmptyState
                icon="📜"
                title="No Transactions Found"
                description="No stock movements matched your filter criteria."
              />
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Location</th>
                      <th>Supply Item</th>
                      <th>Qty Adjustment</th>
                      <th>Logged By</th>
                      <th>Comments</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: selectedLog?.id === log.id ? 'var(--theme-primary-bg)' : undefined,
                        }}
                      >
                        <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td>
                          <span className={`badge ${getActionBadgeClass(log.type)}`}>
                            {log.type}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                            {(log.location || 'ECART') === 'ECART' ? '🛒 eCart' : '🏢 Central'}
                          </span>
                        </td>
                        <td>
                          <strong>{log.item.name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {log.item.sku}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                          <span style={{ color: log.type === 'INBOUND' ? 'var(--color-success)' : 'var(--color-critical)' }}>
                            {log.type === 'INBOUND' ? `+${log.qty}` : `-${log.qty}`}
                          </span>{' '}
                          <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--theme-text-muted)' }}>{log.item.unit}</span>
                        </td>
                        <td style={{ fontSize: '13px' }}>
                          <div><strong>{log.user?.name}</strong></div>
                          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>{log.user?.role?.replace('_', ' ')}</div>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {log.comments && log.comments.length > 0 ? (
                            <span style={{ color: 'var(--theme-primary)', fontWeight: '600' }}>💬 {log.comments.length}</span>
                          ) : (
                            <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedLog(log)}>Inspect</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <Pagination
                  currentPage={currentPage}
                  totalItems={logs.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setCurrentPage(1);
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* Right Side: Log Inspection & Management Comments */}
        {selectedLog && (
          <div className="widget-card" style={{ alignSelf: 'start' }}>
            <div className="widget-header">
              <span className="widget-title">📜 Log Detail #{selectedLog.id.slice(-6).toUpperCase()}</span>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>Close ✕</button>
            </div>

            <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span className={`badge ${getActionBadgeClass(selectedLog.type)}`} style={{ marginBottom: '8px' }}>
                  {selectedLog.type}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>{selectedLog.item.name}</h3>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                  SKU: <code>{selectedLog.item.sku}</code>
                </span>
              </div>

              <div style={{ background: 'var(--theme-bg)', padding: '14px', borderRadius: 'var(--border-radius-md)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div><strong>Timestamp:</strong> {new Date(selectedLog.timestamp).toLocaleString()}</div>
                <div><strong>Quantity Adjusted:</strong> {selectedLog.qty} {selectedLog.item.unit}</div>
                <div><strong>Logged By User:</strong> {selectedLog.user?.name} (@{selectedLog.user?.username})</div>
                <div><strong>User Role:</strong> {selectedLog.user?.role?.replace('_', ' ')}</div>
              </div>

              {/* Management Comments Audit Section */}
              <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Audit Comments & Review Flags</h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                  {selectedLog.comments && selectedLog.comments.length > 0 ? (
                    selectedLog.comments.map((c) => (
                      <div key={c.id} style={{ background: c.isFlagged ? 'var(--color-critical-bg)' : 'var(--theme-card-bg)', padding: '10px 12px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--theme-border)', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <strong>{c.user?.name}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                            {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p style={{ margin: 0 }}>{c.commentText}</p>
                        {hasPermission('create_users') && (
                          <button onClick={() => handleToggleFlag(c.id)} style={{ background: 'none', border: 'none', color: 'var(--theme-primary)', fontSize: '11px', cursor: 'pointer', marginTop: '4px', padding: 0 }}>
                            {c.isFlagged ? '🚩 Flagged (Click to Unflag)' : '🏳️ Flag Comment'}
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>No audit notes or comments attached.</p>
                  )}
                </div>

                {/* Add Comment Form */}
                <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea
                    className="form-control"
                    placeholder="Add audit note or discrepancy comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{ minHeight: '60px', fontSize: '13px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={isFlagged} onChange={(e) => setIsFlagged(e.target.checked)} />
                      <span style={{ color: isFlagged ? 'var(--color-critical)' : 'inherit', fontWeight: isFlagged ? 'bold' : 'normal' }}>🚩 Flag for review</span>
                    </label>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={submittingComment || !commentText.trim()}>
                      {submittingComment ? 'Saving...' : 'Post Audit Note'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;
