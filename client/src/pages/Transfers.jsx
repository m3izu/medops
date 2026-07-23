import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import ContextualHelp from '../components/ContextualHelp';
import EmptyState from '../components/EmptyState';
import SearchableSelect from '../components/SearchableSelect';

const LOCATION_LABELS = {
  ECART: '🛒 eCart Inventory Pool',
  CENTRAL: '🏢 Central Storage',
};

const Transfers = () => {
  const { hasPermission } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [items, setItems] = useState([]);
  const [itemBatches, setItemBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('PENDING'); // 'PENDING' | 'ALL'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form Fields
  const [fromLocation, setFromLocation] = useState('CENTRAL');
  const [toLocation, setToLocation] = useState('ECART');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');

  // Rejection modal
  const [rejectingTransferId, setRejectingTransferId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/stock/transfers');
      setTransfers(res.data || []);
      setError('');
    } catch (err) {
      console.error('Failed to fetch transfers:', err);
      setError('Failed to load stock transfer requests.');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const res = await api.get('/items');
      setItems(res.data || []);
    } catch (err) {
      console.error('Failed to fetch catalog items:', err);
    }
  };

  useEffect(() => {
    fetchTransfers();
    fetchItems();
  }, []);

  // When selected item or fromLocation changes, load relevant batches
  useEffect(() => {
    if (!selectedItemId) {
      setItemBatches([]);
      setSelectedBatchId('');
      return;
    }
    const item = items.find((i) => i.id === selectedItemId);
    if (item) {
      api.get(`/items/${item.id}`).then((res) => {
        const activeBatches = (res.data.batches || []).filter(
          (b) => b.location === fromLocation && b.quantityRemaining > 0
        );
        setItemBatches(activeBatches);
      }).catch(console.error);
    }
  }, [selectedItemId, fromLocation, items]);

  const handleOpenRequestModal = () => {
    setFromLocation('CENTRAL');
    setToLocation('ECART');
    setSelectedItemId('');
    setSelectedBatchId('');
    setQty('');
    setNotes('');
    setModalError('');
    setIsModalOpen(true);
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!fromLocation || !toLocation || !selectedItemId || !qty) {
      setModalError('Source location, target location, item, and quantity are required.');
      return;
    }

    if (fromLocation === toLocation) {
      setModalError('Source and target locations must be different.');
      return;
    }

    const numQty = Number(qty);
    if (isNaN(numQty) || numQty <= 0 || !Number.isInteger(numQty)) {
      setModalError('Quantity must be a positive whole number.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post('/stock/transfers/request', {
        fromLocation,
        toLocation,
        itemId: selectedItemId,
        batchId: selectedBatchId || undefined,
        qty: numQty,
        notes,
      });
      setIsModalOpen(false);
      fetchTransfers();
    } catch (err) {
      console.error('Submit transfer request failed:', err);
      setModalError(err.response?.data?.error || 'Failed to submit transfer request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve and execute this internal stock transfer? Stock will be updated immediately.')) {
      return;
    }
    try {
      await api.post(`/stock/transfers/${id}/approve`);
      fetchTransfers();
    } catch (err) {
      console.error('Approve transfer failed:', err);
      alert(err.response?.data?.error || 'Failed to approve transfer.');
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectingTransferId) return;
    try {
      await api.post(`/stock/transfers/${rejectingTransferId}/reject`, { rejectionReason });
      setRejectingTransferId(null);
      setRejectionReason('');
      fetchTransfers();
    } catch (err) {
      console.error('Reject transfer failed:', err);
      alert(err.response?.data?.error || 'Failed to reject transfer.');
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this pending transfer request?')) return;
    try {
      await api.post(`/stock/transfers/${id}/cancel`);
      fetchTransfers();
    } catch (err) {
      console.error('Cancel transfer failed:', err);
      alert(err.response?.data?.error || 'Failed to cancel transfer.');
    }
  };

  const selectedItemObj = items.find((i) => i.id === selectedItemId);
  const isBatchRequired = selectedItemObj?.itemType === 'MEDICATION' || selectedItemObj?.category?.hasBatchControl;

  const filteredTransfers = transfers.filter((t) => {
    if (activeTab === 'PENDING') return t.status === 'PENDING';
    return true;
  });

  const canManageTransfers = hasPermission('receive_stock') || hasPermission('manage_items');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Internal Stock Transfers</h2>
          <p className="page-title-desc">
            Request, track, and approve two-step internal inventory transfers between <strong>eCart Pool</strong> and <strong>Central Storage</strong>.
          </p>
        </div>
        <div>
          <button className="btn btn-primary" onClick={handleOpenRequestModal}>
            🔄 Request Stock Transfer
          </button>
        </div>
      </div>

      <ContextualHelp
        title="Stock Transfer Workflow"
        content="Stock transfers use a 2-step verification workflow: (1) Staff submits a transfer request from source to target pool. (2) Inventory Manager or authorized personnel approves the transfer, executing stock deduction from the source and credit to the target pool."
      />

      {error && <div className="login-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* Filter Tabs */}
      <div className="tab-container" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          className={`btn ${activeTab === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('PENDING')}
        >
          Pending Requests ({transfers.filter((t) => t.status === 'PENDING').length})
        </button>
        <button
          className={`btn ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('ALL')}
        >
          All Transfer History ({transfers.length})
        </button>
      </div>

      {/* Transfers Table */}
      <div className="widget-card">
        <div className="widget-body" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading transfer records...</p>
          ) : filteredTransfers.length === 0 ? (
            <EmptyState
              icon="🔄"
              title="No Transfer Requests Found"
              description="There are currently no internal transfer requests matching this view filter."
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Requested Date</th>
                  <th>Item Details</th>
                  <th>Route (From ➔ To)</th>
                  <th>Batch / Lot</th>
                  <th>Quantity</th>
                  <th>Requested By</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontSize: '13px' }}>
                      {new Date(t.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td>
                      <strong>{t.item?.name || '—'}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>SKU: {t.item?.sku}</div>
                    </td>
                    <td>
                      <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                        {t.fromLocation} ➔ {t.toLocation}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {t.batch?.batchNo ? (
                        <code>{t.batch.batchNo}</code>
                      ) : (
                        <span style={{ color: 'var(--theme-text-muted)' }}>Non-batch</span>
                      )}
                    </td>
                    <td>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {t.qty} {t.item?.unit}
                      </strong>
                    </td>
                    <td style={{ fontSize: '13px' }}>{t.requestedBy?.name || '—'}</td>
                    <td>
                      {t.status === 'PENDING' && <span className="badge badge-warning">⏳ Pending Approval</span>}
                      {t.status === 'APPROVED' && <span className="badge badge-success">✅ Approved</span>}
                      {t.status === 'REJECTED' && (
                        <span className="badge badge-critical" title={t.rejectionReason}>
                          ❌ Rejected
                        </span>
                      )}
                      {t.status === 'CANCELLED' && <span className="badge badge-secondary">🚫 Cancelled</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {t.status === 'PENDING' && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          {canManageTransfers && (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => handleApprove(t.id)}>
                                Approve
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => setRejectingTransferId(t.id)}>
                                Reject
                              </button>
                            </>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => handleCancel(t.id)}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Request Transfer */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3>Request Internal Stock Transfer</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleRequestSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {modalError && <div className="login-error">{modalError}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>From Location (Source)</label>
                    <select
                      className="form-control"
                      value={fromLocation}
                      onChange={(e) => {
                        setFromLocation(e.target.value);
                        if (e.target.value === toLocation) {
                          setToLocation(e.target.value === 'CENTRAL' ? 'ECART' : 'CENTRAL');
                        }
                      }}
                    >
                      <option value="CENTRAL">Central Storage</option>
                      <option value="ECART">eCart Inventory Pool</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>To Location (Target)</label>
                    <select
                      className="form-control"
                      value={toLocation}
                      onChange={(e) => {
                        setToLocation(e.target.value);
                        if (e.target.value === fromLocation) {
                          setFromLocation(e.target.value === 'ECART' ? 'CENTRAL' : 'ECART');
                        }
                      }}
                    >
                      <option value="ECART">eCart Inventory Pool</option>
                      <option value="CENTRAL">Central Storage</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Select Item *</label>
                  <SearchableSelect
                    options={items.map((i) => ({
                      value: i.id,
                      label: `${i.name} (${i.sku}) — ${LOCATION_LABELS[fromLocation]}: ${fromLocation === 'ECART' ? i.ecartQty : i.centralQty} ${i.unit} available`,
                      sku: i.sku,
                      item: i,
                    }))}
                    value={selectedItemId}
                    onChange={(val) => setSelectedItemId(val)}
                    placeholder="Type to search item by name or SKU..."
                    required
                  />
                </div>

                {isBatchRequired && (
                  <div className="form-group">
                    <label>Select Batch / Lot *</label>
                    <select
                      className="form-control"
                      value={selectedBatchId}
                      onChange={(e) => setSelectedBatchId(e.target.value)}
                      required
                    >
                      <option value="">-- Select Available Batch --</option>
                      {itemBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          Batch #{b.batchNo || 'N/A'} (Exp: {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : 'N/A'}) — {b.quantityRemaining} available
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label>Transfer Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    placeholder="Enter quantity to transfer..."
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Notes / Reason</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    placeholder="Optional transfer reason or clinical station note..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit Transfer Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rejection Reason */}
      {rejectingTransferId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Reject Transfer Request</h3>
              <button className="btn-close" onClick={() => setRejectingTransferId(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                Please provide a reason for rejecting this transfer request:
              </p>
              <textarea
                className="form-control"
                rows="3"
                placeholder="Rejection reason..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectingTransferId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleRejectSubmit}>
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transfers;
