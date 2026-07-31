import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';

const BILLING_STATUS_BADGE = {
  PENDING: { label: 'Pending Billing', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  RECORDED: { label: 'Recorded', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
};

const HighlightText = ({ text, search }) => {
  if (!search || !text) return <span>{text}</span>;
  const regex = new RegExp(`(${search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi');
  const parts = String(text).split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
      )}
    </span>
  );
};

const CashierLog = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Filters State
  const [statusFilter, setStatusFilter] = useState('PENDING'); // 'PENDING' | 'RECORDED' | 'ALL'
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, dateFrom, dateTo]);

  const exportCashierCSV = () => {
    if (!filteredLogs.length) return;
    const headers = ['Dispense ID', 'Dispense Date', 'Date of Log', 'Patient Name', 'Chart #', 'Item Dispensed', 'Quantity', 'Notes / Remarks', 'Dispensed By', 'Billing Status'];
    const rows = filteredLogs.map((log) => [
      `"${log.id.slice(-6).toUpperCase()}"`,
      `"${new Date(log.dispensedAt).toLocaleString()}"`,
      `"${new Date(log.createdAt || log.dispensedAt).toLocaleString()}"`,
      `"${(log.patient?.name || '').replace(/"/g, '""')}"`,
      `"${(log.patient?.chartNumber || '').replace(/"/g, '""')}"`,
      `"${(log.item?.name || '').replace(/"/g, '""')}"`,
      log.qty ?? log.quantity,
      `"${(log.notes || '').replace(/"/g, '""')}"`,
      `"${(log.dispensedBy?.name || '').replace(/"/g, '""')}"`,
      `"${log.billingStatus}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medops_billing_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Billing log exported to CSV!');
  };

  // Selection state
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== 'ALL') {
        params.billingStatus = statusFilter;
      }
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const response = await api.get('/dispense', { params });
      setLogs(response.data || []);
      setError('');
      setSelectedIds([]); // Reset selection on reload
    } catch (err) {
      console.error('Error fetching dispense logs:', err);
      setError('Failed to load dispense logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchLogs();
  }, [statusFilter, dateFrom, dateTo, searchQuery]);

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      fetchLogs();
    }
  };

  const handleRecordOne = async (id, e) => {
    e.stopPropagation();
    if (actionLoading) return;
    try {
      setActionLoading(true);
      await api.patch(`/dispense/${id}/record`);
      fetchLogs();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to record billing.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkRecord = async () => {
    if (selectedIds.length === 0 || actionLoading) return;
    try {
      setActionLoading(true);
      await api.patch('/dispense/bulk-record', { ids: selectedIds });
      fetchLogs();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to bulk record billing.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      // Only select pending items that are currently visible
      const pendingIds = filteredLogs
        .filter(log => log.billingStatus === 'PENDING')
        .map(log => log.id);
      setSelectedIds(pendingIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  // Filter local listings by search query (highlights matching client-side)
  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.patient?.name?.toLowerCase().includes(query) ||
      log.patient?.chartNumber?.toLowerCase().includes(query) ||
      log.item?.name?.toLowerCase().includes(query) ||
      log.item?.sku?.toLowerCase().includes(query) ||
      log.dispensedBy?.name?.toLowerCase().includes(query) ||
      log.notes?.toLowerCase().includes(query)
    );
  });

  const formatDate = (d) => d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="page-container">
      {/* Overview/Stats Summary Panel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div className="widget-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-warning)' }}>
          <div>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px', fontWeight: '600' }}>
              Pending Logs
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--theme-text-bold)', fontFamily: 'var(--font-mono)' }}>
              {logs.filter(l => l.billingStatus === 'PENDING').length}
            </div>
          </div>
        </div>

        <div className="widget-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-success)' }}>
          <div>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px', fontWeight: '600' }}>
              Recorded Logs
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--theme-text-bold)', fontFamily: 'var(--font-mono)' }}>
              {logs.filter(l => l.billingStatus === 'RECORDED').length}
            </div>
          </div>
        </div>
      </div>

      <div className="widget-card">
        {/* Navigation/Tabs Header */}
        <div className="widget-header" style={{ borderBottom: '1px solid var(--theme-border)', paddingBottom: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--theme-text-bold)', margin: 0 }}>
                Direct Dispense Billing Logs
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--theme-text-muted)', margin: '4px 0 0' }}>
                Review and record patient direct dispensations on their accounting billing statement.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="btn btn-outline btn-sm" onClick={exportCashierCSV} title="Export billing log to CSV">
                📥 Export CSV
              </button>
              {selectedIds.length > 0 && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleBulkRecord}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Recording...' : `✓ Record Selected (${selectedIds.length})`}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`tab-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setStatusFilter('PENDING')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: statusFilter === 'PENDING' ? '2px solid var(--theme-primary)' : '2px solid transparent',
                color: statusFilter === 'PENDING' ? 'var(--theme-text-bold)' : 'var(--theme-text-muted)',
                fontWeight: statusFilter === 'PENDING' ? '600' : '400',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Pending Record
            </button>
            <button
              className={`tab-btn ${statusFilter === 'RECORDED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('RECORDED')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: statusFilter === 'RECORDED' ? '2px solid var(--theme-primary)' : '2px solid transparent',
                color: statusFilter === 'RECORDED' ? 'var(--theme-text-bold)' : 'var(--theme-text-muted)',
                fontWeight: statusFilter === 'RECORDED' ? '600' : '400',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Recorded
            </button>
            <button
              className={`tab-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: statusFilter === 'ALL' ? '2px solid var(--theme-primary)' : '2px solid transparent',
                color: statusFilter === 'ALL' ? 'var(--theme-text-bold)' : 'var(--theme-text-muted)',
                fontWeight: statusFilter === 'ALL' ? '600' : '400',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              All History
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="widget-body" style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--theme-border)' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ flex: '1', minWidth: '240px', position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search patient, item sku, name, nurse..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px' }}
              />
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--theme-text-muted)', pointerEvents: 'none' }}>🔍</span>
            </div>

            {/* Date range from */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>From:</span>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ width: '140px', fontSize: '12px', padding: '6px' }}
              />
            </div>

            {/* Date range to */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>To:</span>
              <input
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ width: '140px', fontSize: '12px', padding: '6px' }}
              />
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => { setDateFrom(''); setDateTo(''); setSearchQuery(''); }}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Logs Table */}
        {loading ? (
          <div className="widget-body">
            <p style={{ color: 'var(--theme-text-muted)', fontSize: '13px' }}>Loading dispense list...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon="💵"
            title="No Billing Records Found"
            description="No direct patient dispensations matched your filters."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  {statusFilter === 'PENDING' && (
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        onChange={handleSelectAll}
                        checked={(() => {
                          const pendingLogs = filteredLogs.filter(l => l.billingStatus === 'PENDING');
                          return pendingLogs.length > 0 && pendingLogs.every(l => selectedIds.includes(l.id));
                        })()}
                      />
                    </th>
                  )}
                  <th>Dispense Date</th>
                  <th>Date of Log</th>
                  <th>Location</th>
                  <th>Patient Info</th>
                  <th>Item Details</th>
                  <th>Dispensed Qty</th>
                  <th>Notes / Remarks</th>
                  <th>Dispensed By</th>
                  <th>Status</th>
                  {statusFilter === 'PENDING' && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredLogs
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map(log => {
                  const isPending = log.billingStatus === 'PENDING';
                  const badge = BILLING_STATUS_BADGE[log.billingStatus] || BILLING_STATUS_BADGE.PENDING;
                  const loc = log.location || 'ECART';
                  return (
                    <tr key={log.id} style={{ opacity: isPending ? 1 : 0.8 }}>
                      {statusFilter === 'PENDING' && (
                        <td>
                          {isPending ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(log.id)}
                              onChange={(e) => handleSelectOne(log.id, e.target.checked)}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-bold)', fontWeight: '600' }}>
                        {formatDate(log.dispensedAt)}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                        {formatDate(log.createdAt || log.dispensedAt)}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                          {loc === 'ECART' ? '🛒 eCart' : '🏢 Central'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          <HighlightText text={log.patient?.name} search={searchQuery} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontFamily: 'var(--font-mono)' }}>
                          <HighlightText text={log.patient?.chartNumber} search={searchQuery} />
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          <HighlightText text={log.item?.name} search={searchQuery} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                          SKU: <HighlightText text={log.item?.sku} search={searchQuery} />
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
                        {(() => {
                          const returnedQty = (log.transactions || []).reduce((sum, tx) => sum + tx.qty, 0);
                          const netQty = log.qty - returnedQty;
                          if (returnedQty > 0) {
                            return (
                              <div>
                                <span style={{ textDecoration: 'line-through', color: 'var(--theme-text-muted)', marginRight: '6px' }}>
                                  {log.qty}
                                </span>
                                <strong style={{ color: 'var(--theme-text-bold)' }}>{netQty}</strong>{' '}
                                <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--theme-text-muted)' }}>{log.item?.unit}</span>
                                <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600', marginTop: '2px' }}>
                                  (Returned: {returnedQty})
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div>
                              <strong style={{ color: 'var(--theme-text-bold)' }}>{log.qty}</strong>{' '}
                              <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--theme-text-muted)' }}>{log.item?.unit}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)', maxWidth: '180px' }}>
                        {log.notes ? (
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            <HighlightText text={log.notes} search={searchQuery} />
                          </div>
                        ) : (
                          <span style={{ opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: '500', color: 'var(--theme-text-bold)', fontSize: '12px' }}>
                          <HighlightText text={log.dispensedBy?.name} search={searchQuery} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                          {log.dispensedBy?.role?.replace('_', ' ')}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: badge.color,
                          backgroundColor: badge.bg,
                          display: 'inline-block'
                        }}>
                          {badge.label}
                        </span>
                        {!isPending && log.recordedBy && (
                          <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)', marginTop: '4px' }}>
                            by {log.recordedBy.name}
                          </div>
                        )}
                      </td>
                      {statusFilter === 'PENDING' && (
                        <td style={{ textAlign: 'right' }}>
                          {isPending && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => handleRecordOne(log.id, e)}
                              disabled={actionLoading}
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                            >
                              Record Log
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Pagination
              currentPage={currentPage}
              totalItems={filteredLogs.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CashierLog;
