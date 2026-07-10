import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';

const REASONS = [
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'RECALLED', label: 'Recalled' },
  { value: 'OTHER', label: 'Other / Discrepancy' },
];

const Discards = () => {
  const { hasPermission } = useAuth();
  
  const [items, setItems] = useState([]);
  const [discards, setDiscards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected item details (for fetching batches)
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);
  const [batchesLoading, setBatchesLoading] = useState(false);

  // Form Fields
  const [itemId, setItemId] = useState('');
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

  // Fetch batches when selected item changes
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

    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity discarded must be a positive integer.');
      return;
    }

    // Check if the selected item is batch-controlled, and if so, enforce batch selection
    const isBatchControlled = selectedItemDetails?.itemType === 'MEDICATION' || (selectedItemDetails?.category?.hasBatchControl ?? false);
    if (isBatchControlled && !batchId) {
      setFormError('Please select the specific batch being discarded.');
      return;
    }

    // Check quantity limit if details are loaded
    if (selectedItemDetails?.stockLevel) {
      const currentStock = selectedItemDetails.stockLevel.quantityOnHand;
      if (qtyNum > currentStock) {
        setFormError(`Insufficient stock level. You cannot discard more than the current quantity on hand (${currentStock} ${selectedItemDetails.unit}).`);
        return;
      }
    }

    // Check quantity limit for specific batch
    if (batchId && selectedItemDetails?.batches) {
      const selectedBatch = selectedItemDetails.batches.find(b => b.id === batchId);
      if (selectedBatch && qtyNum > selectedBatch.quantityRemaining) {
        setFormError(`Insufficient batch quantity. Selected batch has only ${selectedBatch.quantityRemaining} remaining.`);
        return;
      }
    }

    if (!reason) {
      setFormError('Please select a reason for the discard.');
      return;
    }

    const payload = {
      itemId,
      batchId: batchId || null,
      quantity: qtyNum,
      reason,
      notes,
    };

    try {
      setIsSubmitting(true);
      await api.post('/discards', payload);
      setFormSuccess(`Successfully logged discard for ${qtyNum} ${selectedItemDetails?.unit || 'units'} of "${selectedItemDetails?.name || ''}".`);
      
      // Reset form
      setItemId('');
      setBatchId('');
      setQuantity('');
      setReason('');
      setNotes('');

      // Refresh data
      fetchDiscards();
      fetchItems();
    } catch (err) {
      console.error('Discard submission failed:', err);
      setFormError(err.response?.data?.error || 'An error occurred while logging the discard.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canLogDiscard = hasPermission('log_discard');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Waste & Discard Logs</h2>
          <p className="page-title-desc">Log damaged, expired, recalled, or missing clinical inventory items to decrement stock counts and maintain audits.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: canLogDiscard ? '1.2fr 2fr' : '1fr', gap: '24px' }}>
        
        {/* Left Side: Discard Logging Form */}
        {canLogDiscard && (
          <div className="widget-card" style={{ alignSelf: 'start' }}>
            <div className="widget-header">
              <span className="widget-title">Log Waste/Discard Entry</span>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {formError && <div className="login-error">{formError}</div>}
                {formSuccess && (
                  <div style={{ padding: '12px 16px', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 'var(--border-radius-md)', fontSize: '13px', fontWeight: '500' }}>
                    ✓ {formSuccess}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Select Inventory Item *</label>
                  <select 
                    className="form-control"
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    required
                  >
                    <option value="">Choose item...</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        [{item.sku}] {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conditional Batch selection for batch-tracked items */}
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
                      {selectedItemDetails.batches.map(b => (
                        <option key={b.id} value={b.id}>
                          Batch: {b.batchNo || 'N/A'} (Exp: {new Date(b.expiryDate).toLocaleDateString()} — Remaining: {b.quantityRemaining})
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
                    {selectedItemDetails?.stockLevel && (
                      <p style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '4px' }}>
                        In stock: <strong>{selectedItemDetails.stockLevel.quantityOnHand} {selectedItemDetails.unit}</strong>
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
                  {discards.map(log => (
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
                        <strong>-{log.qty}</strong> <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>{log.item.unit}</span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{log.reason}</span>
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {log.loggedBy.name}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.notes}>
                        {log.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Discards;
