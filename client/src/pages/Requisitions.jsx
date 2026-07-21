import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  PARTIALLY_APPROVED: 'badge-warning',
  FULLY_APPROVED: 'badge-success',
  REJECTED: 'badge-critical',
  CANCELLED: 'badge-neutral',
};

const Requisitions = () => {
  const { user, hasPermission } = useAuth();

  // ── Data State ──
  const [requisitions, setRequisitions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── View State ──
  const [selectedReq, setSelectedReq] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Create Modal State ──
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPatientId, setNewPatientId] = useState('');
  const [newSessionDate, setNewSessionDate] = useState('');
  const [newLines, setNewLines] = useState([{ itemId: '', quantity: '', reason: '' }]);
  const [createError, setCreateError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Resubmit Modal State ──
  const [resubmitLine, setResubmitLine] = useState(null); // the rejected line being resubmitted
  const [resubQuantity, setResubQuantity] = useState('');
  const [resubReason, setResubReason] = useState('');
  const [resubError, setResubError] = useState('');

  // ── Approve Modal State ──
  const [approveLine, setApproveLine] = useState(null);
  const [approveQty, setApproveQty] = useState('');

  // ── Reject Modal State ──
  const [rejectLine, setRejectLine] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const canSubmit = hasPermission('submit_requisition');
  const canApprove = hasPermission('approve_requisition');
  const canCancelAny = hasPermission('cancel_any_requisition');
  const canCancelOwn = hasPermission('cancel_own_requisition');
  const canCoVerify = hasPermission('receive_stock');

  // ── Fetch Helpers ──
  const fetchRequisitions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/requisitions');
      setRequisitions(res.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching requisitions:', err);
      setError('Failed to load requisitions.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = async (id) => {
    try {
      setDetailLoading(true);
      const res = await api.get(`/requisitions/${id}`);
      setSelectedReq(res.data);
    } catch (err) {
      console.error('Error fetching requisition detail:', err);
      alert('Failed to load requisition details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const [pRes, iRes] = await Promise.all([
        api.get('/patients', { params: { status: 'ACTIVE' } }),
        api.get('/items'),
      ]);
      setPatients(pRes.data || []);
      setItems(iRes.data || []);
    } catch (err) {
      console.error('Error fetching lookups:', err);
    }
  };

  useEffect(() => {
    fetchRequisitions();
    fetchLookups();
  }, []);

  // ── Create Requisition ──
  const openCreate = () => {
    setNewPatientId('');
    setNewSessionDate(new Date().toISOString().substring(0, 10));
    setNewLines([{ itemId: '', quantity: '', reason: '' }]);
    setCreateError('');
    setIsCreateOpen(true);
  };

  const addLine = () => setNewLines([...newLines, { itemId: '', quantity: '', reason: '' }]);
  const removeLine = (idx) => setNewLines(newLines.filter((_, i) => i !== idx));

  const updateLine = (idx, field, value) => {
    const updated = [...newLines];
    updated[idx] = { ...updated[idx], [field]: value };
    setNewLines(updated);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!newPatientId) return setCreateError('Please select a patient.');
    if (!newSessionDate) return setCreateError('Please select a session date.');

    const validLines = newLines.filter(l => l.itemId && l.quantity && l.reason);
    if (validLines.length === 0) return setCreateError('At least one complete line item is required (item, quantity, and reason).');

    try {
      setIsSubmitting(true);
      await api.post('/requisitions', {
        patientId: newPatientId,
        sessionDate: newSessionDate,
        lines: validLines.map(l => ({ itemId: l.itemId, quantity: Number(l.quantity), reason: l.reason })),
      });
      setIsCreateOpen(false);
      fetchRequisitions();
    } catch (err) {
      console.error('Create failed:', err);
      setCreateError(err.response?.data?.error || 'Failed to submit requisition.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Cancel ──
  const handleCancel = async (reqId) => {
    if (!window.confirm('Are you sure you want to cancel this requisition? All pending line items will be cancelled.')) return;
    try {
      await api.patch(`/requisitions/${reqId}/cancel`);
      fetchRequisitions();
      if (selectedReq?.id === reqId) fetchDetail(reqId);
    } catch (err) {
      console.error('Cancel failed:', err);
      alert(err.response?.data?.error || 'Failed to cancel requisition.');
    }
  };

  // ── Approve Line ──
  const handleApprove = async () => {
    if (!approveLine) return;
    const qty = Number(approveQty) || approveLine.qtyRequested;
    try {
      await api.patch(`/requisitions/${selectedReq.id}/lines/${approveLine.id}/approve`, { qtyApproved: qty });
      setApproveLine(null);
      fetchDetail(selectedReq.id);
      fetchRequisitions();
    } catch (err) {
      console.error('Approve failed:', err);
      alert(err.response?.data?.error || 'Failed to approve line item.');
    }
  };

  // ── Reject Line ──
  const handleReject = async () => {
    if (!rejectLine || !rejectReason.trim()) return alert('Rejection reason is required.');
    try {
      await api.patch(`/requisitions/${selectedReq.id}/lines/${rejectLine.id}/reject`, { rejectionReason: rejectReason });
      setRejectLine(null);
      setRejectReason('');
      fetchDetail(selectedReq.id);
      fetchRequisitions();
    } catch (err) {
      console.error('Reject failed:', err);
      alert(err.response?.data?.error || 'Failed to reject line item.');
    }
  };

  // ── Resubmit Line ──
  const handleResubmit = async () => {
    if (!resubmitLine) return;
    setResubError('');
    const qty = Number(resubQuantity) || resubmitLine.qtyRequested;
    const reason = resubReason.trim() || resubmitLine.reason;
    try {
      await api.post(`/requisitions/${selectedReq.id}/lines/${resubmitLine.id}/resubmit`, {
        itemId: resubmitLine.itemId,
        quantity: qty,
        reason,
      });
      setResubmitLine(null);
      fetchDetail(selectedReq.id);
      fetchRequisitions();
    } catch (err) {
      console.error('Resubmit failed:', err);
      setResubError(err.response?.data?.error || 'Failed to resubmit line item.');
    }
  };

  const handleCoVerify = async (lineId) => {
    if (!window.confirm('Are you sure you want to co-verify this medication request?')) return;
    try {
      await api.patch(`/requisitions/${selectedReq.id}/lines/${lineId}/co-verify`);
      fetchDetail(selectedReq.id);
      fetchRequisitions();
    } catch (err) {
      console.error('Co-verification failed:', err);
      alert(err.response?.data?.error || 'Failed to co-verify medication.');
    }
  };

  const [isApprovingAll, setIsApprovingAll] = useState(false);

  const handleApproveAllLines = async () => {
    if (!selectedReq?.lines) return;
    const pendingLines = selectedReq.lines.filter(l => l.status === 'PENDING');
    if (pendingLines.length === 0) return;

    if (!window.confirm(`Are you sure you want to approve all ${pendingLines.length} pending line item(s)?`)) return;

    try {
      setIsApprovingAll(true);
      let approvedCount = 0;
      let errors = [];

      for (const line of pendingLines) {
        if (line.item?.itemType === 'MEDICATION' && !line.coVerifiedById) {
          errors.push(`"${line.item.name}" skipped (requires medication co-verification)`);
          continue;
        }
        try {
          await api.patch(`/requisitions/${selectedReq.id}/lines/${line.id}/approve`, {
            qtyApproved: line.qtyRequested,
          });
          approvedCount++;
        } catch (err) {
          errors.push(`"${line.item?.name || 'item'}": ${err.response?.data?.error || err.message}`);
        }
      }

      fetchDetail(selectedReq.id);
      fetchRequisitions();

      if (errors.length > 0) {
        alert(`Approved ${approvedCount} line(s).\n\nNotes:\n- ` + errors.join('\n- '));
      }
    } catch (err) {
      console.error('Approve all lines failed:', err);
      alert('An unexpected error occurred while approving lines.');
    } finally {
      setIsApprovingAll(false);
    }
  };

  const canUserCancel = (req) => {
    if (req.status !== 'PENDING' && req.status !== 'PARTIALLY_APPROVED') return false;
    if (canCancelAny) return true;
    if (canCancelOwn && req.submittedBy?.id === user?.id) return true;
    return false;
  };

  // Count stats
  const pendingCount = requisitions.filter(r => r.status === 'PENDING').length;
  const approvedCount = requisitions.filter(r => r.status === 'FULLY_APPROVED' || r.status === 'PARTIALLY_APPROVED').length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Clinical Requisitions</h2>
          <p className="page-title-desc">Submit, review, and manage per-patient item acquisition requests with line-by-line approval workflows.</p>
        </div>
        {canSubmit && (
          <button className="btn btn-primary" onClick={openCreate}>
            + New Requisition
          </button>
        )}
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Total Forms</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--theme-primary)' }}>{requisitions.length}</div>
        </div>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Pending Approval</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-warning)' }}>{pendingCount}</div>
        </div>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Processed</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-success)' }}>{approvedCount}</div>
        </div>
      </div>

      {/* Main Grid: List + Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedReq ? '1fr 1.2fr' : '1fr', gap: '24px', transition: 'grid-template-columns 0.3s ease' }}>

        {/* Left: Requisitions List */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Requisition Queue</span>
            <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>{requisitions.length} forms</span>
          </div>
          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading requisitions...</p>
            ) : requisitions.length === 0 ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                No requisitions found. {canSubmit ? 'Click "+ New Requisition" to submit one.' : ''}
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Session</th>
                    <th>Items</th>
                    <th>Submitted By</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map(req => (
                    <tr
                      key={req.id}
                      onClick={() => fetchDetail(req.id)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedReq?.id === req.id ? 'var(--theme-primary-bg)' : 'transparent',
                      }}
                    >
                      <td>
                        <strong>{req.patient?.name}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>{req.patient?.chartNumber}</div>
                      </td>
                      <td style={{ fontSize: '13px' }}>{new Date(req.sessionDate).toLocaleDateString()}</td>
                      <td style={{ fontSize: '13px' }}>{req.lines?.length} line{req.lines?.length !== 1 ? 's' : ''}</td>
                      <td style={{ fontSize: '13px' }}>
                        {req.submittedBy?.name}
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>{req.submittedBy?.role?.replace(/_/g, ' ')}</div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[req.status] || 'badge-neutral'}`}>
                          {req.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        {selectedReq && (
          <div className="widget-card" style={{ alignSelf: 'start' }}>
            <div className="widget-header">
              <span className="widget-title">📋 Requisition Detail</span>
              <button
                onClick={() => setSelectedReq(null)}
                style={{ fontSize: '14px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--theme-text-muted)' }}
              >
                Close ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="widget-body"><p style={{ color: 'var(--theme-text-muted)' }}>Loading details...</p></div>
            ) : (
              <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Header Info */}
                <div>
                  <span className={`badge ${STATUS_COLORS[selectedReq.status] || 'badge-neutral'}`} style={{ marginBottom: '8px' }}>
                    {selectedReq.status.replace(/_/g, ' ')}
                  </span>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    {selectedReq.patient?.name}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                    Chart # <code>{selectedReq.patient?.chartNumber}</code> • Session: {new Date(selectedReq.sessionDate).toLocaleDateString()}
                  </span>
                </div>

                {/* Visual Stepper */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '16px 20px', 
                  background: 'var(--theme-card-bg)', 
                  border: '1px solid var(--theme-border)',
                  borderRadius: 'var(--border-radius-lg)', 
                  margin: '8px 0',
                  boxShadow: 'var(--shadow-sm)',
                  position: 'relative'
                }}>
                  {/* Progress Line */}
                  <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '12%', 
                    right: '12%', 
                    height: '2px', 
                    backgroundColor: 'var(--theme-border)', 
                    zIndex: 1, 
                    transform: 'translateY(-50%)' 
                  }} />
                  
                  {/* Steps */}
                  {[
                    { label: 'Submitted', active: true, done: true, color: 'var(--theme-primary)' },
                    { 
                      label: 'Co-Verified', 
                      active: selectedReq.lines?.some(l => l.item?.itemType === 'MEDICATION'),
                      done: selectedReq.lines?.some(l => l.item?.itemType === 'MEDICATION') && selectedReq.lines?.filter(l => l.item?.itemType === 'MEDICATION').every(l => l.coVerifiedById),
                      color: 'var(--color-warning)'
                    },
                    { 
                      label: 'Approved', 
                      active: true, 
                      done: selectedReq.status === 'FULLY_APPROVED' || selectedReq.status === 'PARTIALLY_APPROVED',
                      color: 'var(--theme-primary)' 
                    },
                    { 
                      label: selectedReq.status === 'CANCELLED' ? 'Cancelled' : selectedReq.status === 'REJECTED' ? 'Rejected' : 'Completed', 
                      active: true, 
                      done: selectedReq.status === 'FULLY_APPROVED' || selectedReq.status === 'CANCELLED' || selectedReq.status === 'REJECTED',
                      color: selectedReq.status === 'REJECTED' || selectedReq.status === 'CANCELLED' ? 'var(--color-critical)' : 'var(--color-success)'
                    }
                  ].map((step, idx) => {
                    const isPassed = step.done;
                    return (
                      <div key={idx} style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        zIndex: 2, 
                        position: 'relative', 
                        width: '24%',
                        opacity: step.active || isPassed ? 1 : 0.4 
                      }}>
                        <div style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '50%', 
                          backgroundColor: isPassed ? step.color : 'var(--theme-card-bg)', 
                          border: `2px solid ${isPassed ? step.color : 'var(--theme-border)'}`,
                          color: isPassed ? '#fff' : 'var(--theme-text-muted)',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontWeight: 'bold',
                          fontSize: '12px',
                          boxShadow: isPassed ? `0 0 10px ${step.color}` : 'none',
                          transition: 'all 0.3s ease'
                        }}>
                          {isPassed ? '✓' : idx + 1}
                        </div>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: '500', 
                          marginTop: '6px', 
                          color: isPassed ? 'var(--theme-text-bold)' : 'var(--theme-text-muted)',
                          textAlign: 'center'
                        }}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: 'var(--theme-bg)', padding: '12px 16px', borderRadius: 'var(--border-radius-md)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>Submitted By:</strong> {selectedReq.submittedBy?.name} ({selectedReq.submittedBy?.role?.replace(/_/g, ' ')})</div>
                  <div><strong>Submitted On:</strong> {new Date(selectedReq.createdAt).toLocaleString()}</div>
                  {selectedReq.cancelledBy && (
                    <div style={{ color: 'var(--color-critical)' }}><strong>Cancelled At:</strong> {new Date(selectedReq.cancelledAt).toLocaleString()}</div>
                  )}
                </div>

                {/* Cancel Button */}
                {canUserCancel(selectedReq) && (
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => handleCancel(selectedReq.id)}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Cancel Requisition
                  </button>
                )}

                {/* Line Items */}
                <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '14px' }}>
                      Line Items ({selectedReq.lines?.length || 0})
                    </strong>
                    {canApprove && selectedReq.lines?.some(l => l.status === 'PENDING') && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={handleApproveAllLines}
                        disabled={isApprovingAll}
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                      >
                        {isApprovingAll ? 'Approving...' : '✅ Approve All Pending Lines'}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedReq.lines?.map(line => {
                      const isResubmission = line.isResubmission;
                      const stockInfo = line.item?.stockLevel;
                      const availableStock = stockInfo?.quantityOnHand ?? '?';

                      return (
                        <div
                          key={line.id}
                          style={{
                            padding: '12px 14px',
                            background: line.status === 'REJECTED' ? 'var(--color-critical-bg)' : 'var(--theme-bg)',
                            borderRadius: 'var(--border-radius-md)',
                            borderLeft: `3px solid ${
                              line.status === 'APPROVED' ? 'var(--color-success)' :
                              line.status === 'REJECTED' ? 'var(--color-critical)' :
                              line.status === 'CANCELLED' ? 'var(--theme-text-muted)' :
                              'var(--color-warning)'
                            }`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                            <div>
                              <strong>{line.item?.name}</strong>
                              {isResubmission && (
                                <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', background: 'var(--color-warning)', color: '#fff', borderRadius: '4px' }}>
                                  RESUBMISSION
                                </span>
                              )}
                              {line.item?.itemType === 'MEDICATION' && (
                                <span className={`badge ${line.coVerifiedById ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px' }}>
                                  {line.coVerifiedById ? '✓ Co-Verified' : 'Pending Co-Verification'}
                                </span>
                              )}
                              <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                                Requested: <strong>{line.qtyRequested}</strong> {line.item?.unit}
                                {line.qtyApproved != null && <> • Approved: <strong>{line.qtyApproved}</strong></>}
                                {stockInfo && <> • In Stock: {availableStock}</>}
                              </div>
                            </div>
                            <span className={`badge ${STATUS_COLORS[line.status] || 'badge-neutral'}`}>
                              {line.status}
                            </span>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                            <strong>Reason:</strong> {line.reason}
                          </div>

                          {line.rejectionReason && (
                            <div style={{ fontSize: '12px', color: 'var(--color-critical)', marginTop: '4px' }}>
                              <strong>Rejection Reason:</strong> {line.rejectionReason}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            {/* Co-Verify button for supply officers */}
                            {canCoVerify && line.status === 'PENDING' && line.item?.itemType === 'MEDICATION' && !line.coVerifiedById && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleCoVerify(line.id)}
                              >
                                🛡️ Co-Verify Medication
                              </button>
                            )}

                            {/* Approve/Reject buttons for managers */}
                            {canApprove && line.status === 'PENDING' && (
                              <>
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => {
                                    setApproveLine(line);
                                    setApproveQty(String(line.qtyRequested));
                                  }}
                                  disabled={line.item?.itemType === 'MEDICATION' && !line.coVerifiedById}
                                  title={line.item?.itemType === 'MEDICATION' && !line.coVerifiedById ? "Medication co-verification is required before approval." : ""}
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  className="btn btn-critical btn-sm"
                                  onClick={() => {
                                    setRejectLine(line);
                                    setRejectReason('');
                                  }}
                                >
                                  ✕ Reject
                                </button>
                              </>
                            )}

                            {/* Resubmit button for the submitter on rejected lines */}
                            {line.status === 'REJECTED' && canSubmit && selectedReq.submittedBy?.id === user?.id && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  setResubmitLine(line);
                                  setResubQuantity(String(line.qtyRequested));
                                  setResubReason(line.reason);
                                  setResubError('');
                                }}
                              >
                                ↩ Resubmit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Requisition Modal ── */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <span className="modal-title">New Item Acquisition Form</span>
              <button className="modal-close" onClick={() => setIsCreateOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {createError && <div className="login-error">{createError}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Patient *</label>
                    <select className="form-control" value={newPatientId} onChange={e => setNewPatientId(e.target.value)} required>
                      <option value="">Select patient...</option>
                      {patients.map(p => (
                        <option key={p.id} value={p.id}>[{p.chartNumber}] {p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Session Date *</label>
                    <input type="date" className="form-control" value={newSessionDate} onChange={e => setNewSessionDate(e.target.value)} required />
                  </div>
                </div>

                {/* Dynamic Line Items */}
                <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '14px' }}>Request Items ({newLines.length})</strong>
                    <button type="button" className="btn btn-sm" onClick={addLine}>+ Add Item</button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {newLines.map((line, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          background: 'var(--theme-bg)',
                          borderRadius: 'var(--border-radius-md)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          position: 'relative',
                        }}
                      >
                        {newLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            style={{
                              position: 'absolute', top: '6px', right: '8px',
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--color-critical)', fontSize: '14px',
                            }}
                          >
                            ✕
                          </button>
                        )}
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: '600' }}>LINE #{idx + 1}</div>
                        <div className="form-row">
                          <div className="form-group" style={{ flex: 2 }}>
                            <label className="form-label">Item *</label>
                            <select
                              className="form-control"
                              value={line.itemId}
                              onChange={e => updateLine(idx, 'itemId', e.target.value)}
                              required
                            >
                              <option value="">Select item...</option>
                              {items.map(it => (
                                <option key={it.id} value={it.id}>[{it.sku}] {it.name} ({it.unit})</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group" style={{ flex: 0.5 }}>
                            <label className="form-label">Qty *</label>
                            <input
                              type="number"
                              className="form-control"
                              min="1"
                              value={line.quantity}
                              onChange={e => updateLine(idx, 'quantity', e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Reason / Justification *</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. Routine dialysis session supply"
                            value={line.reason}
                            onChange={e => updateLine(idx, 'reason', e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setIsCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Approve Qty Modal ── */}
      {approveLine && (
        <div className="modal-overlay" onClick={() => setApproveLine(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <span className="modal-title">Approve: {approveLine.item?.name}</span>
              <button className="modal-close" onClick={() => setApproveLine(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                Requested: <strong>{approveLine.qtyRequested}</strong> {approveLine.item?.unit}
                {approveLine.item?.stockLevel && (
                  <> • Available stock: <strong>{approveLine.item.stockLevel.quantityOnHand}</strong></>
                )}
              </p>
              <div className="form-group">
                <label className="form-label">Approved Quantity</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  max={approveLine.item?.stockLevel?.quantityOnHand ?? approveLine.qtyRequested}
                  value={approveQty}
                  onChange={e => setApproveQty(e.target.value)}
                />
                <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                  You may approve a partial quantity. FIFO will auto-deduct from oldest batches for medications.
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setApproveLine(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleApprove}>Confirm Approval</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Reason Modal ── */}
      {rejectLine && (
        <div className="modal-overlay" onClick={() => setRejectLine(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <span className="modal-title">Reject: {rejectLine.item?.name}</span>
              <button className="modal-close" onClick={() => setRejectLine(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                Requested: <strong>{rejectLine.qtyRequested}</strong> {rejectLine.item?.unit} for "{rejectLine.reason}"
              </p>
              <div className="form-group">
                <label className="form-label">Rejection Reason *</label>
                <textarea
                  className="form-control"
                  placeholder="Explain why this line item is being rejected..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  required
                  style={{ minHeight: '80px' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRejectLine(null)}>Cancel</button>
              <button className="btn btn-critical" onClick={handleReject} disabled={!rejectReason.trim()}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resubmit Modal ── */}
      {resubmitLine && (
        <div className="modal-overlay" onClick={() => setResubmitLine(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <span className="modal-title">Resubmit: {resubmitLine.item?.name}</span>
              <button className="modal-close" onClick={() => setResubmitLine(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {resubError && <div className="login-error">{resubError}</div>}
              <div style={{ padding: '10px 12px', background: 'var(--color-critical-bg)', borderRadius: 'var(--border-radius-md)', fontSize: '12px' }}>
                <strong>Previously rejected:</strong> {resubmitLine.rejectionReason}
              </div>
              <div className="form-group">
                <label className="form-label">Revised Quantity</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  value={resubQuantity}
                  onChange={e => setResubQuantity(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Revised Reason / Justification</label>
                <input
                  type="text"
                  className="form-control"
                  value={resubReason}
                  onChange={e => setResubReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setResubmitLine(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResubmit}>Resubmit for Approval</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Requisitions;
