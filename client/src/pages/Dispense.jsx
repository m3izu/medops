import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';

const DISPENSE_MODE_BADGE = {
  DIRECT_DISPENSE: { label: 'Direct Dispense', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  FLEXIBLE: { label: 'Flexible', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
};

const BILLING_STATUS_BADGE = {
  PENDING: { label: 'Pending Billing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  RECORDED: { label: 'Recorded', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

const Dispense = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPatientId = searchParams.get('patientId') || '';

  // Dispense form state
  const [patients, setPatients] = useState([]);
  const [dispensableItems, setDispensableItems] = useState([]);
  const [patientId, setPatientId] = useState(initialPatientId);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchPatients = async () => {
    try {
      const res = await api.get('/patients');
      setPatients((res.data || []).filter(p => p.status === 'ACTIVE'));
    } catch (err) {
      console.error('Failed to load patients', err);
    }
  };

  const fetchDispensableItems = async () => {
    try {
      // Fetch all non-archived items
      const res = await api.get('/items');
      // Filter to only items the nurse can directly dispense
      const dispensable = (res.data || []).filter(
        item => item.dispenseMode === 'DIRECT_DISPENSE' || item.dispenseMode === 'FLEXIBLE'
      );
      setDispensableItems(dispensable);
    } catch (err) {
      console.error('Failed to load items', err);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/dispense');
      setHistory(res.data || []);
    } catch (err) {
      console.error('Failed to load dispense history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
    fetchDispensableItems();
    fetchHistory();
  }, []);

  const selectedItem = dispensableItems.find(i => i.id === itemId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!patientId) { setFormError('Please select a patient.'); return; }
    if (!itemId) { setFormError('Please select an item.'); return; }
    if (!qty || Number(qty) <= 0) { setFormError('Quantity must be a positive number.'); return; }

    try {
      setIsSubmitting(true);
      await api.post('/dispense', {
        patientId,
        itemId,
        qty: Number(qty),
        notes: notes.trim() || undefined,
      });
      setFormSuccess('Item dispensed successfully. Cashier has been notified.');
      // Reset form
      setPatientId('');
      setItemId('');
      setQty(1);
      setNotes('');
      fetchHistory();
      fetchDispensableItems();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to dispense item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="page-container">

      {/* Dispense Form Card */}
      <div className="widget-card" style={{ marginBottom: '24px' }}>
        <div className="widget-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(16,185,129,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', flexShrink: 0
          }}>💊</div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--theme-text-bold)', margin: 0 }}>
              Direct Item Dispense
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: '2px 0 0' }}>
              Dispense items directly to a patient. Stock is deducted immediately and the cashier will be notified for billing.
            </p>
          </div>
        </div>

        <div className="widget-body">
          {formError && (
            <div className="alert alert-error" style={{ marginBottom: '16px' }}>{formError}</div>
          )}
          {formSuccess && (
            <div className="alert alert-success" style={{ marginBottom: '16px' }}>✅ {formSuccess}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              {/* Patient Selection */}
              <div className="form-group">
                <label className="form-label">Patient *</label>
                <select
                  className="form-control"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                >
                  <option value="">Select active patient...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.chartNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Item Selection */}
              <div className="form-group">
                <label className="form-label">Item to Dispense *</label>
                <select
                  className="form-control"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  required
                >
                  <option value="">Select item...</option>
                  {dispensableItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.stockLevel?.quantityOnHand ?? 0} {item.unit} available
                    </option>
                  ))}
                </select>
                {dispensableItems.length === 0 && (
                  <p style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: '6px' }}>
                    No items are configured for direct dispensing. An admin must set items to "Direct Dispense" or "Flexible" mode.
                  </p>
                )}
              </div>
            </div>

            {/* Selected item info */}
            {selectedItem && (
              <div style={{
                background: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: 'var(--border-radius-lg)',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                gap: '20px',
                flexWrap: 'wrap',
                fontSize: '13px',
              }}>
                <span>
                  <strong style={{ color: 'var(--theme-text-muted)' }}>Current Stock:</strong>{' '}
                  <strong style={{ color: 'var(--theme-text-bold)' }}>
                    {selectedItem.stockLevel?.quantityOnHand ?? 0} {selectedItem.unit}
                  </strong>
                </span>
                {DISPENSE_MODE_BADGE[selectedItem.dispenseMode] && (
                  <span style={{
                    padding: '2px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: DISPENSE_MODE_BADGE[selectedItem.dispenseMode].color,
                    background: DISPENSE_MODE_BADGE[selectedItem.dispenseMode].bg,
                  }}>
                    {DISPENSE_MODE_BADGE[selectedItem.dispenseMode].label}
                  </span>
                )}
              </div>
            )}


            <div className="form-row">
              {/* Quantity */}
              <div className="form-group" style={{ maxWidth: '160px' }}>
                <label className="form-label">Quantity *</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                />
              </div>

              {/* Notes */}
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Notes <span style={{ color: 'var(--theme-text-muted)' }}>(Optional)</span></label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. post-procedure pain management"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '8px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}></span>
                    Dispensing...
                  </>
                ) : '💊 Log Dispense'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Dispense History */}
      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-title">My Dispense History</span>
        </div>

        {historyLoading ? (
          <div className="widget-body">
            <p style={{ color: 'var(--theme-text-muted)', fontSize: '13px' }}>Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon="💊"
            title="No Dispense Records Yet"
            description="Items you dispense directly to patients will appear here."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Patient</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Notes</th>
                  <th>Billing Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map(log => {
                  const badge = BILLING_STATUS_BADGE[log.billingStatus] || BILLING_STATUS_BADGE.PENDING;
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                        {formatDate(log.dispensedAt)}
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          {log.patient?.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                          {log.patient?.chartNumber}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          {log.item?.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                          {log.item?.sku}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
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
                                <div style={{ fontSize: '10px', color: '#3b82f6', fontWeight: '600', marginTop: '2px' }}>
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
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)', fontStyle: log.notes ? 'normal' : 'italic' }}>
                        {log.notes || 'No notes'}
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: badge.color,
                          background: badge.bg,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {(() => {
                          const returnedQty = (log.transactions || []).reduce((sum, tx) => sum + tx.qty, 0);
                          if (returnedQty < log.qty) {
                            return (
                              <Link
                                to={`/returns?sourceType=DISPENSE&sourceId=${log.id}`}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                🔄 Return
                              </Link>
                            );
                          }
                          return <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontStyle: 'italic' }}>Returned</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dispense;
