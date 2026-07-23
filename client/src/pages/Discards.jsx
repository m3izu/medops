import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';

const REASONS = [
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'RECALLED', label: 'Recalled' },
  { value: 'OTHER', label: 'Other / Discrepancy' },
];

const Discards = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const toast = useToast();
  
  const [items, setItems] = useState([]);
  const [discards, setDiscards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selected item details (for fetching batches)
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);
  const [batchesLoading, setBatchesLoading] = useState(false);

  // Form Fields
  const [itemId, setItemId] = useState('');
  const [location, setLocation] = useState('');
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data || []);
    } catch (err) {
      console.error('Error fetching items list:', err);
    }
  };

  const fetchDiscards = async () => {
    try {
      setLoading(true);
      const response = await api.get('/discards');
      setDiscards(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching discards list:', err);
      setError('Failed to fetch discard/waste log history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchDiscards();
  }, []);

  useEffect(() => {
    const fetchBatches = async () => {
      if (!itemId) {
        setSelectedItemDetails(null);
        setBatchId('');
        return;
      }

      try {
        setBatchesLoading(true);
        const res = await api.get(`/items/${itemId}`);
        setSelectedItemDetails(res.data);
        setBatchId('');
      } catch (err) {
        console.error('Error fetching item details & batches:', err);
      } finally {
        setBatchesLoading(false);
      }
    };

    fetchBatches();
    setFormError('');
    setFormSuccess('');
  }, [itemId]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!itemId) {
      setFormError('Please select an item.');
      return;
    }

    if (!location) {
      setFormError('Please select the source inventory location (eCart or Central Storage).');
      return;
    }

    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be a positive integer.');
      return;
    }

    if (!reason) {
      setFormError('Please select a discard reason.');
      return;
    }

    const isBatchControlled = selectedItemDetails?.itemType === 'MEDICATION' || (selectedItemDetails?.category?.hasBatchControl ?? false);
    if (isBatchControlled && selectedItemDetails?.batches && selectedItemDetails.batches.length > 0 && !batchId) {
      setFormError('Please select the specific expiring/damaged batch.');
      return;
    }

    const payload = {
      itemId,
      location,
      quantity: qtyNum,
      reason,
      notes,
    };

    if (batchId) {
      payload.batchId = batchId;
    }

    try {
      setIsSubmitting(true);
      await api.post('/discards', payload);
      setFormSuccess(`Successfully logged discard of ${qtyNum} ${selectedItemDetails.unit} of "${selectedItemDetails.name}".`);
      toast.success(`Logged discard of ${qtyNum} ${selectedItemDetails.name}`);

      setItemId('');
      setBatchId('');
      setQuantity('');
      setReason('');
      setNotes('');
      setSelectedItemDetails(null);

      fetchDiscards();
      fetchItems();
    } catch (err) {
      console.error('Discard submission failed:', err);
      const msg = err.response?.data?.error || 'Failed to submit discard entry.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportDiscardsCSV = () => {
    if (!discards.length) return;
    const headers = ['Timestamp', 'Item Name', 'Batch No', 'Quantity', 'Unit', 'Reason', 'Logged By', 'Notes'];
    const rows = discards.map((log) => [
      `"${new Date(log.timestamp).toLocaleString()}"`,
      `"${(log.item?.name || '').replace(/"/g, '""')}"`,
      `"${(log.batch?.batchNo || '').replace(/"/g, '""')}"`,
      log.qty,
      `"${log.item?.unit || ''}"`,
      `"${log.reason}"`,
      `"${(log.loggedBy?.name || '').replace(/"/g, '""')}"`,
      `"${(log.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medops_discards_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Discard logs exported to CSV!');
  };

  const totalExpiredQty = discards.filter(d => d.reason === 'EXPIRED').reduce((sum, d) => sum + d.qty, 0);
  const totalDamagedQty = discards.filter(d => d.reason === 'DAMAGED' || d.reason === 'RECALLED').reduce((sum, d) => sum + d.qty, 0);

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Waste & Discard Logging</h2>
          <p className="page-title-desc">Report expired, damaged, recalled, or lost clinical inventory and automatically update stock levels.</p>
        </div>
        <button className="btn btn-outline" onClick={exportDiscardsCSV} title="Export discard logs to CSV">
          📥 Export CSV
        </button>
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Waste Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Total Discard Logs</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--theme-primary)' }}>{discards.length}</div>
        </div>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Expired Items</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-critical)' }}>{totalExpiredQty}</div>
        </div>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Damaged / Recalled</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-warning)' }}>{totalDamagedQty}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: hasPermission('log_discard') ? '1fr 1.5fr' : '1fr', gap: '24px' }}>
        {/* Left Side: Discard Form */}
        {hasPermission('log_discard') && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">Log Waste Entry</span>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {formError && <div className="login-error">{formError}</div>}
                {formSuccess && <div className="login-error" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', borderColor: 'rgba(5,150,105,0.2)' }}>{formSuccess}</div>}

                <div className="form-group">
                  <label className="form-label">Select Item to Discard *</label>
                  <SearchableSelect
                    options={items.map(item => ({
                      value: item.id,
                      label: `[${item.sku}] ${item.name} (${item.unit})`,
                      sku: item.sku,
                      item,
                    }))}
                    value={itemId}
                    onChange={(val) => setItemId(val)}
                    placeholder="Type to search item by name or SKU..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Source Inventory Location *</label>
                  <select
                    className="form-control"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                  >
                    <option value="">-- Explicitly Choose Source Location --</option>
                    <option value="ECART">🛒 eCart Inventory Pool</option>
                    <option value="CENTRAL">🏢 Central Storage</option>
                  </select>
                </div>

                {itemId && !batchesLoading && (selectedItemDetails?.itemType === 'MEDICATION' || (selectedItemDetails?.category?.hasBatchControl ?? false)) && selectedItemDetails?.batches && selectedItemDetails.batches.length > 0 && (
                  <div className="form-group" style={{ background: 'var(--theme-bg)', padding: '12px', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--theme-border)' }}>
                    <label className="form-label">Select Batch & Expiry *</label>
                    <select 
                      className="form-control"
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                      required
                    >
                      <option value="">Select expiring batch...</option>
                      {selectedItemDetails.batches
                        .filter(b => !location || b.location === location)
                        .map(b => (
                          <option key={b.id} value={b.id}>
                            Batch: {b.batchNo || 'N/A'} [{b.location === 'ECART' ? 'eCart' : 'Central'}] (Exp: {new Date(b.expiryDate).toLocaleDateString()} — Qty: {b.quantityRemaining})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {batchesLoading && <p style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Loading batches details...</p>}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Quantity Discarded *</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      placeholder="e.g. 5"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                    {selectedItemDetails && location && (
                      <p style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '4px' }}>
                        Available in {location}: <strong>{(selectedItemDetails.stockLevels || []).find(s => s.location === location)?.quantityOnHand ?? 0} {selectedItemDetails.unit}</strong>
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reason *</label>
                    <select 
                      className="form-control"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                    >
                      <option value="">Select reason...</option>
                      {REASONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Intake / Disposal Notes</label>
                  <textarea 
                    className="form-control" 
                    placeholder="Enter reason details, dispose method, or notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ minHeight: '80px', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--theme-border)' }}>
                <button 
                  type="submit" 
                  className="btn btn-critical" 
                  disabled={isSubmitting || batchesLoading}
                  style={{ width: '100%' }}
                >
                  {isSubmitting ? 'Logging waste entry...' : '🗑 Log Discard & Deduct Stock'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Right Side: Discards List history */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Waste & Discard Log History</span>
            <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
              {discards.length} Entries
            </span>
          </div>

          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading logs...</p>
            ) : discards.length === 0 ? (
              <EmptyState
                icon="🗑️"
                title="No Discards Logged"
                description="No medication discards, damage logs, or chemical disposal records have been registered yet."
              />
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Item Name</th>
                      <th>Qty</th>
                      <th>Reason</th>
                      <th>Logged By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discards
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map(log => (
                      <tr key={log.id}>
                        <td style={{ fontSize: '12px' }}>
                          {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td>
                          <strong>{log.item.name}</strong>
                          {log.batch && (
                            <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                              Batch: <code>{log.batch.batchNo}</code>
                            </div>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: 'var(--color-critical)' }}>-{log.qty}</strong> <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>{log.item.unit}</span>
                        </td>
                        <td>
                          <span className="badge badge-neutral">{log.reason}</span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <span 
                            style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--theme-primary)' }}
                            onClick={() => navigate(`/profile/${log.loggedById || log.loggedBy?.id}`)}
                            title="View Staff Profile & System Audit"
                          >
                            👤 {log.loggedBy?.name || 'Staff'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.notes}>
                          {log.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <Pagination
                  currentPage={currentPage}
                  totalItems={discards.length}
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
      </div>
    </div>
  );
};

export default Discards;
