import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import SearchableSelect from '../components/SearchableSelect';

const ReturnItem = () => {
  const { user } = useAuth();
  const toast = useToast();

  const queryParams = new URLSearchParams(window.location.search);
  const urlSourceType = queryParams.get('sourceType');
  const urlSourceId = queryParams.get('sourceId');

  // Form State
  const [sourceType, setSourceType] = useState(urlSourceType || 'DISPENSE'); // 'DISPENSE' | 'REQUISITION'
  const [dispenseLogs, setDispenseLogs] = useState([]);
  const [requisitionLines, setRequisitionLines] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(urlSourceId || '');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Dynamic validation helper state
  const [selectedRecordDetails, setSelectedRecordDetails] = useState(null);
  const [alreadyReturnedQty, setAlreadyReturnedQty] = useState(0);
  const [maxReturnable, setMaxReturnable] = useState(0);
  const [loadingReturnedQty, setLoadingReturnedQty] = useState(false);

  // Lists & history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active nurse records
  const fetchSourceRecords = async () => {
    try {
      setLoadingRecords(true);
      setFormError('');
      if (!isInitialLoad) {
        setSelectedSourceId('');
        setSelectedRecordDetails(null);
        setMaxReturnable(0);
      } else {
        setIsInitialLoad(false);
      }

      if (sourceType === 'DISPENSE') {
        const res = await api.get('/dispense');
        const data = res.data || [];
        // Filter out fully-returned dispenses (Bug #11)
        const filtered = data.filter(log => {
          const returned = (log.transactions || []).reduce((sum, tx) => sum + tx.qty, 0);
          return log.qty - returned > 0;
        });
        setDispenseLogs(filtered);
        
        // If query param matches an item not in logs (e.g. nurse doesn't own it or already fully returned), set select to empty
        if (urlSourceId && !filtered.some(d => d.id === urlSourceId)) {
          setSelectedSourceId('');
        }
      } else {
        const res = await api.get('/requisitions');
        // Flatten all approved lines of all nurse's requisitions
        const approvedLines = [];
        (res.data || []).forEach(req => {
          (req.lines || []).forEach(line => {
            if (line.status === 'APPROVED' && (line.qtyApproved || 0) > 0) {
              approvedLines.push({
                ...line,
                patient: req.patient,
                createdAt: req.createdAt,
                requisitionId: req.id
              });
            }
          });
        });
        setRequisitionLines(approvedLines);
        if (urlSourceId && !approvedLines.some(a => a.id === urlSourceId)) {
          setSelectedSourceId('');
        }
      }
    } catch (err) {
      console.error('Failed to fetch records', err);
      setFormError('Failed to load transaction records.');
    } finally {
      setLoadingRecords(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/returns');
      setHistory(res.data || []);
    } catch (err) {
      console.error('Failed to load return history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchSourceRecords();
  }, [sourceType]);

  useEffect(() => {
    fetchHistory();
  }, []);

  // Fetch already returned qty when a record is selected
  useEffect(() => {
    if (!selectedSourceId) {
      setSelectedRecordDetails(null);
      setMaxReturnable(0);
      return;
    }

    let record = null;
    let originalQty = 0;

    if (sourceType === 'DISPENSE') {
      record = dispenseLogs.find(log => log.id === selectedSourceId);
      originalQty = record ? record.qty : 0;
    } else {
      record = requisitionLines.find(line => line.id === selectedSourceId);
      originalQty = record ? (record.qtyApproved || 0) : 0;
    }

    if (!record) return;

    setSelectedRecordDetails(record);

    const getReturnedQty = async () => {
      try {
        setLoadingReturnedQty(true);
        const res = await api.get(`/returns/by-source/${sourceType}/${selectedSourceId}`);
        const returned = res.data?.totalReturned || 0;
        setAlreadyReturnedQty(returned);
        const returnable = originalQty - returned;
        setMaxReturnable(returnable);
        setQty(returnable > 0 ? 1 : 0);
      } catch (err) {
        console.error('Failed to load returned quantity', err);
        setFormError('Failed to check previously returned quantities.');
      } finally {
        setLoadingReturnedQty(false);
      }
    };

    getReturnedQty();
  }, [selectedSourceId, sourceType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!selectedSourceId) {
      setFormError('Please select a transaction to return items from.');
      return;
    }
    const parsedQty = parseInt(qty, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setFormError('Quantity must be a positive whole number.');
      return;
    }
    if (parsedQty > maxReturnable) {
      setFormError(`Cannot return more than available (max: ${maxReturnable}).`);
      return;
    }
    if (!reason.trim()) {
      setFormError('Please provide a reason for the return.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post('/returns', {
        sourceType,
        sourceId: selectedSourceId,
        qty: parsedQty,
        reason: reason.trim()
      });
      const msg = 'Items returned to inventory successfully.';
      setFormSuccess(msg);
      toast.success(msg);
      setSelectedSourceId('');
      setReason('');
      setQty(1);
      fetchHistory();
      fetchSourceRecords();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to submit return.';
      setFormError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="page-container">
      {/* Return Form Card */}
      <div className="widget-card" style={{ marginBottom: '24px' }}>
        <div className="widget-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', flexShrink: 0
          }}>🔄</div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--theme-text-bold)', margin: 0 }}>
              Return Unused Stock
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: '2px 0 0' }}>
              Return unused items back to the general inventory. Stock counts will be instantly restored.
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
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '8px' }}>
                Select Return Pathway
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSourceType('DISPENSE')}
                  className={`btn ${sourceType === 'DISPENSE' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '10px' }}
                >
                  Direct Dispenses
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('REQUISITION')}
                  className={`btn ${sourceType === 'REQUISITION' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '10px' }}
                >
                  Clinical Requisitions
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Select Original Transaction Record *
              </label>
              {loadingRecords ? (
                <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>Loading logs...</p>
              ) : (
                <SearchableSelect
                  options={
                    sourceType === 'DISPENSE'
                      ? dispenseLogs.map(log => ({
                          value: log.id,
                          label: `${log.patient?.name} — ${log.item?.name} (Qty: ${log.qty} ${log.item?.unit}) [${formatDate(log.dispensedAt)}]`,
                          sku: log.item?.sku,
                        }))
                      : requisitionLines.map(line => ({
                          value: line.id,
                          label: `${line.patient?.name} — ${line.item?.name} (Approved: ${line.qtyApproved} ${line.item?.unit}) [${formatDate(line.createdAt)}]`,
                          sku: line.item?.sku,
                        }))
                  }
                  value={selectedSourceId}
                  onChange={(val) => setSelectedSourceId(val)}
                  placeholder="Type to search transaction by patient name or item..."
                  required
                />
              )}
            </div>

            {selectedRecordDetails && (
              <div style={{
                background: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                borderRadius: 'var(--border-radius-lg)',
                padding: '16px',
                marginBottom: '20px',
                fontSize: '13px'
              }}>
                {loadingReturnedQty ? (
                  <p style={{ color: 'var(--theme-text-muted)', margin: 0 }}>Checking previous returns...</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <span style={{ color: 'var(--theme-text-muted)', display: 'block' }}>Patient</span>
                      <strong style={{ color: 'var(--theme-text-bold)', fontSize: '14px' }}>
                        {selectedRecordDetails.patient?.name} ({selectedRecordDetails.patient?.chartNumber})
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--theme-text-muted)', display: 'block' }}>Item</span>
                      <strong style={{ color: 'var(--theme-text-bold)', fontSize: '14px' }}>
                        {sourceType === 'DISPENSE' ? selectedRecordDetails.item?.name : selectedRecordDetails.item?.name}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--theme-text-muted)', display: 'block' }}>Original Quantity</span>
                      <strong style={{ color: 'var(--theme-text-bold)' }}>
                        {sourceType === 'DISPENSE' ? selectedRecordDetails.qty : selectedRecordDetails.qtyApproved} {sourceType === 'DISPENSE' ? selectedRecordDetails.item?.unit : selectedRecordDetails.item?.unit}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--theme-text-muted)', display: 'block' }}>Max Returnable</span>
                      <strong style={{ color: maxReturnable > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {maxReturnable} {sourceType === 'DISPENSE' ? selectedRecordDetails.item?.unit : selectedRecordDetails.item?.unit}
                        {alreadyReturnedQty > 0 && ` (${alreadyReturnedQty} already returned)`}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="form-row">
              <div className="form-group" style={{ maxWidth: '160px' }}>
                <label className="form-label">Return Quantity *</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  max={maxReturnable || 1}
                  step="1"
                  value={qty}
                  disabled={maxReturnable <= 0}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setQty(isNaN(parsed) ? '' : parsed);
                  }}
                  required
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Reason for Return *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Patient refused, unused clinical waste"
                  value={reason}
                  disabled={maxReturnable <= 0}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: '8px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || maxReturnable <= 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {isSubmitting ? 'Submitting Return...' : '🔄 Log Return'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Return History Card */}
      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-title">My Return History</span>
        </div>

        {historyLoading ? (
          <div className="widget-body">
            <p style={{ color: 'var(--theme-text-muted)', fontSize: '13px' }}>Loading return history...</p>
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon="🔄"
            title="No Returns Found"
            description="Items you return back to inventory will be cataloged here."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Location</th>
                  <th>Patient</th>
                  <th>Item Returned</th>
                  <th>Qty</th>
                  <th>Reason</th>
                  <th>Pathway Source</th>
                </tr>
              </thead>
              <tbody>
                {history.map(log => {
                  const patient = log.dispenseLog?.patient || log.requisitionLine?.requisition?.patient;
                  const pathway = log.dispenseLogId ? 'Direct Dispense' : 'Clinical Requisition';
                  const loc = log.location || 'ECART';
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                        {formatDate(log.timestamp)}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                          {loc === 'ECART' ? '🛒 eCart' : '🏢 Central'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          {patient?.name || '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                          {patient?.chartNumber || '—'}
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
                      <td style={{ fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>
                        +{log.qty} {log.item?.unit}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                        {log.notes?.split('. Reason: ')[1] || log.notes}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: log.dispenseLogId ? '#3b82f6' : '#8b5cf6',
                          background: log.dispenseLogId ? 'rgba(59, 130, 246, 0.12)' : 'rgba(139, 92, 246, 0.12)'
                        }}>
                          {pathway}
                        </span>
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

export default ReturnItem;
