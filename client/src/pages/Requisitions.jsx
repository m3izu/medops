import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/Pagination';

const STATUS_COLORS = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  PARTIALLY_APPROVED: 'badge-warning',
  FULLY_APPROVED: 'badge-success',
  REJECTED: 'badge-critical',
  CANCELLED: 'badge-neutral',
};

const CLASSIFICATIONS = [
  { key: 'MEDICATION', label: 'Medications', color: '#1E40AF', bgColor: '#F0F9FF' },
  { key: 'MEDICAL_CONSUMABLE', label: 'Medical Consumables', color: '#065F46', bgColor: '#ECFDF5' },
  { key: 'MEDICAL_EQUIPMENT', label: 'Medical Equipment', color: '#5B21B6', bgColor: '#F5F3FF' },
  { key: 'PPE', label: 'PPE & Protective Wear', color: '#92400E', bgColor: '#FFFBEB' },
  { key: 'OFFICE_SUPPLY', label: 'Office & Clinic Supplies', color: '#334155', bgColor: '#F8FAFC' },
];

const Requisitions = () => {
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  // ── Pagination State ──
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── Data State ──
  const [requisitions, setRequisitions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── View State ──
  const [selectedReq, setSelectedReq] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  // ── Grid Sheet State ──
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [gridSessionDate, setGridSessionDate] = useState(new Date().toISOString().substring(0, 10));
  const [gridColumns, setGridColumns] = useState([]); // [{ patientId, notes, isAdditional }]
  const [sheetItemIds, setSheetItemIds] = useState([]); // Array of item IDs added to today's grid sheet
  const [gridQuantities, setGridQuantities] = useState({}); // { [`${patientId}_${itemId}`]: qty }
  const [selectedPatientPicker, setSelectedPatientPicker] = useState('');
  const [gridError, setGridError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState({});

  // ── Resubmit Modal State ──
  const [resubmitLine, setResubmitLine] = useState(null);
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

  // Items grouped by top-level classification
  const itemsByClassification = useMemo(() => {
    const map = {
      MEDICATION: [],
      MEDICAL_CONSUMABLE: [],
      MEDICAL_EQUIPMENT: [],
      PPE: [],
      OFFICE_SUPPLY: [],
    };
    items.forEach(it => {
      const type = it.itemType || 'MEDICAL_CONSUMABLE';
      if (!map[type]) map[type] = [];
      map[type].push(it);
    });
    return map;
  }, [items]);

  // Group past requisitions by sessionDate into Presets
  const pastSessionPresets = useMemo(() => {
    const map = {};
    requisitions.forEach(r => {
      if (!r.sessionDate) return;
      const dateKey = new Date(r.sessionDate).toISOString().substring(0, 10);
      if (!map[dateKey]) {
        map[dateKey] = {
          dateKey,
          displayDate: new Date(r.sessionDate).toLocaleDateString(),
          patientIds: new Set(),
          itemIds: new Set(),
          requisitions: []
        };
      }
      if (r.patientId && r.patientId !== 'ADDITIONAL') {
        map[dateKey].patientIds.add(r.patientId);
      }
      r.lines?.forEach(l => {
        if (l.itemId) map[dateKey].itemIds.add(l.itemId);
      });
      map[dateKey].requisitions.push(r);
    });

    return Object.values(map).sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey));
  }, [requisitions]);

  const handleLoadPreset = (dateKey, copyQuantities = true) => {
    if (!dateKey) return;
    const preset = pastSessionPresets.find(p => p.dateKey === dateKey);
    if (!preset) return;

    // 1. Load Patients from preset
    const newCols = Array.from(preset.patientIds).map(pId => ({
      patientId: pId,
      notes: '',
      isAdditional: false
    }));
    newCols.push({ patientId: 'ADDITIONAL', notes: '', isAdditional: true });
    setGridColumns(newCols);

    // 2. Load Item IDs from preset into sheet
    const newItemIds = Array.from(preset.itemIds);
    setSheetItemIds(newItemIds);

    // 3. Optionally load past quantities
    const newQuants = {};
    if (copyQuantities) {
      preset.requisitions.forEach(r => {
        const pId = r.patientId || 'ADDITIONAL';
        r.lines?.forEach(l => {
          if (l.itemId && l.qtyRequested > 0) {
            newQuants[`${pId}_${l.itemId}`] = l.qtyRequested;
          }
        });
      });
    }
    setGridQuantities(newQuants);
  };

  // ── Grid Sheet Controls ──
  // Starts 100% BLANK as requested by user (no pre-populated patients or items)
  const openGridSheet = () => {
    setGridSessionDate(new Date().toISOString().substring(0, 10));
    setGridColumns([{ patientId: 'ADDITIONAL', notes: '', isAdditional: true }]);
    setSheetItemIds([]);
    setGridQuantities({});
    setGridError('');
    setIsGridOpen(true);
  };

  const addPatientFromRegistry = (patientId) => {
    if (!patientId) return;
    if (gridColumns.some(c => c.patientId === patientId)) {
      alert('This patient is already added to today\'s requisition sheet.');
      return;
    }
    const newCols = [...gridColumns];
    const addIndex = newCols.findIndex(c => c.isAdditional);
    const newCol = { patientId, notes: '', isAdditional: false };
    if (addIndex >= 0) {
      newCols.splice(addIndex, 0, newCol);
    } else {
      newCols.push(newCol);
    }
    setGridColumns(newCols);
    setSelectedPatientPicker('');
  };

  const removePatientColumn = (idx) => {
    if (gridColumns[idx]?.isAdditional) return;
    setGridColumns(gridColumns.filter((_, i) => i !== idx));
  };

  const addItemToSheet = (itemId) => {
    if (!itemId) return;
    if (sheetItemIds.includes(itemId)) {
      alert('This item is already added to today\'s sheet.');
      return;
    }
    setSheetItemIds(prev => [...prev, itemId]);
  };

  const removeItemFromSheet = (itemId) => {
    setSheetItemIds(prev => prev.filter(id => id !== itemId));
    setGridQuantities(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => {
        if (k.endsWith(`_${itemId}`)) delete copy[k];
      });
      return copy;
    });
  };

  const handleCellChange = (patientId, itemId, value) => {
    const parsed = parseInt(value, 10);
    const key = `${patientId}_${itemId}`;
    setGridQuantities(prev => {
      const copy = { ...prev };
      if (isNaN(parsed) || parsed <= 0) {
        delete copy[key];
      } else {
        copy[key] = parsed;
      }
      return copy;
    });
  };

  const handleNotesChange = (idx, value) => {
    const updated = [...gridColumns];
    updated[idx] = { ...updated[idx], notes: value };
    setGridColumns(updated);
  };

  const calculateRowTotal = (itemId) => {
    let total = 0;
    gridColumns.forEach(col => {
      const qty = gridQuantities[`${col.patientId}_${itemId}`];
      if (qty && qty > 0) total += qty;
    });
    return total;
  };

  const handleGridSubmit = async (e) => {
    e.preventDefault();
    setGridError('');

    // Package columns into requisition payloads
    const reqs = gridColumns.map(col => {
      const colLines = [];
      sheetItemIds.forEach(itemId => {
        const qty = gridQuantities[`${col.patientId}_${itemId}`];
        if (qty && qty > 0) {
          colLines.push({ itemId, quantity: qty, reason: col.notes || 'Grid Requisition entry' });
        }
      });
      return {
        patientId: col.patientId,
        isAdditional: col.isAdditional,
        notes: col.notes,
        lines: colLines
      };
    }).filter(r => r.lines.length > 0);

    if (reqs.length === 0) {
      return setGridError('Please add at least one item and enter a quantity before submitting.');
    }

    try {
      setIsSubmitting(true);
      await api.post('/requisitions/batch', {
        sessionDate: gridSessionDate,
        requisitions: reqs
      });
      setIsGridOpen(false);
      fetchRequisitions();
      toast.success('Requisition Sheet submitted successfully!');
    } catch (err) {
      console.error('Batch requisition submit failed:', err);
      const msg = err.response?.data?.error || 'Failed to submit Requisition Sheet.';
      setGridError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Single Requisition Actions ──
  const handleCancel = async (reqId) => {
    if (!window.confirm('Are you sure you want to cancel this requisition? All pending line items will be cancelled.')) return;
    try {
      await api.patch(`/requisitions/${reqId}/cancel`);
      fetchRequisitions();
      if (selectedReq?.id === reqId) fetchDetail(reqId);
      toast.info('Requisition cancelled.');
    } catch (err) {
      console.error('Cancel failed:', err);
      const msg = err.response?.data?.error || 'Failed to cancel requisition.';
      alert(msg);
      toast.error(msg);
    }
  };

  const handleApprove = async () => {
    if (!approveLine) return;
    const qty = Number(approveQty) || approveLine.qtyRequested;
    try {
      await api.patch(`/requisitions/${selectedReq.id}/lines/${approveLine.id}/approve`, { qtyApproved: qty });
      setApproveLine(null);
      fetchDetail(selectedReq.id);
      fetchRequisitions();
      toast.success('Line item approved!');
    } catch (err) {
      console.error('Approve failed:', err);
      const msg = err.response?.data?.error || 'Failed to approve line item.';
      alert(msg);
      toast.error(msg);
    }
  };

  const handleApproveAllLines = async () => {
    if (!selectedReq) return;
    const pendingLines = selectedReq.lines?.filter(l => l.status === 'PENDING') || [];
    if (pendingLines.length === 0) return;
    if (!window.confirm(`Approve all ${pendingLines.length} pending line item(s) for ${selectedReq.patient?.name}?`)) return;

    try {
      setIsApprovingAll(true);
      for (const line of pendingLines) {
        await api.patch(`/requisitions/${selectedReq.id}/lines/${line.id}/approve`, { qtyApproved: line.qtyRequested });
      }
      toast.success(`Approved all ${pendingLines.length} pending line item(s) for ${selectedReq.patient?.name}`);
    } catch (err) {
      console.error('Approve all lines failed:', err);
      const msg = err.response?.data?.error || 'Error while approving line items.';
      toast.error(msg);
    } finally {
      fetchDetail(selectedReq.id);
      fetchRequisitions();
      setIsApprovingAll(false);
    }
  };

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

  const canUserCancel = (req_) => {
    if (!req_ || req_.status !== 'PENDING') return false;
    if (req_.lines?.some(l => l.status === 'APPROVED')) return false;
    if (canCancelAny) return true;
    if (canCancelOwn && req_.submittedById === user?.id) return true;
    return false;
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Item Requisition Management</h2>
          <p className="page-title-desc">
            Submit multi-patient requisition sheets, approve line items, and audit inventory acquisitions.
          </p>
        </div>
        {canSubmit && (
          <button className="btn btn-primary" onClick={openGridSheet} style={{ fontWeight: '600', padding: '10px 18px' }}>
            New Requisition Sheet
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedReq ? '1fr 1.2fr' : '1fr', gap: '24px' }}>
        {/* ── Left Side: Requisition List ── */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Requisitions Log ({requisitions.length})</span>
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
              Loading requisitions...
            </div>
          ) : requisitions.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
              No requisitions found. Click "New Requisition Sheet" to get started.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient / Subject</th>
                    <th>Session Date</th>
                    <th>Submitted By</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions
                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                    .map(r => {
                    const isSelected = selectedReq?.id === r.id;
                    const pendingCount = r.lines?.filter(l => l.status === 'PENDING').length || 0;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => fetchDetail(r.id)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--theme-card-bg-hover)' : undefined,
                        }}
                      >
                        <td>
                          <strong>{r.patient?.name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                            Chart #{r.patient?.chartNumber}
                          </div>
                        </td>
                        <td>{new Date(r.sessionDate).toLocaleDateString()}</td>
                        <td>{r.submittedBy?.name}</td>
                        <td>
                          <span className={`badge ${STATUS_COLORS[r.status] || 'badge-neutral'}`}>
                            {r.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          {r.lines?.length || 0} line(s)
                          {pendingCount > 0 && (
                            <span style={{ fontSize: '11px', marginLeft: '6px', color: 'var(--color-warning)', fontWeight: '600' }}>
                              ({pendingCount} pending)
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchDetail(r.id);
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <Pagination
                currentPage={currentPage}
                totalItems={requisitions.length}
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

        {/* ── Right Side: Requisition Details ── */}
        {selectedReq && (
          <div className="widget-card">
            <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="widget-title">
                Requisition #{selectedReq.id.slice(-6).toUpperCase()}
              </span>
              <button className="modal-close" onClick={() => setSelectedReq(null)}>✕</button>
            </div>

            {detailLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
                Loading details...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>{selectedReq.patient?.name}</h3>
                    <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                      Chart #{selectedReq.patient?.chartNumber} • Session Date: {new Date(selectedReq.sessionDate).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`badge ${STATUS_COLORS[selectedReq.status] || 'badge-neutral'}`}>
                    {selectedReq.status.replace(/_/g, ' ')}
                  </span>
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
                        {isApprovingAll ? 'Approving...' : 'Approve All Pending Lines'}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedReq.lines?.map(line => {
                      const isResubmission = line.isResubmission;
                      const lineLoc = line.location || 'ECART';
                      const stockLevels = line.item?.stockLevels || [];
                      const availableStock = stockLevels.find(s => s.location === lineLoc)?.quantityOnHand ?? 0;

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
                                  RESUBMITTED
                                </span>
                              )}
                            </div>
                            <span className={`badge ${STATUS_COLORS[line.status] || 'badge-neutral'}`} style={{ fontSize: '10px' }}>
                              {line.status}
                            </span>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginBottom: '8px' }}>
                            <div>
                              Target Pool: <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>{lineLoc === 'ECART' ? '🛒 eCart' : '🏢 Central'}</span> • Requested: <strong>{line.qtyRequested}</strong> {line.item?.unit} | Pool Stock: <strong>{availableStock}</strong>
                            </div>
                            <div>Notes/Reason: <em>"{line.reason}"</em></div>
                            {line.qtyApproved && (
                              <div style={{ color: 'var(--color-success)', fontWeight: '600' }}>Approved: {line.qtyApproved} {line.item?.unit}</div>
                            )}
                            {line.rejectionReason && (
                              <div style={{ color: 'var(--color-critical)', fontWeight: '600' }}>Rejected: {line.rejectionReason}</div>
                            )}
                          </div>

                          {/* Line Action Buttons */}
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--theme-border)', paddingTop: '8px' }}>
                            {canCoVerify && line.item?.itemType === 'MEDICATION' && line.status === 'PENDING' && !line.coVerifiedById && (
                              <button
                                className="btn btn-sm btn-outline-info"
                                onClick={async () => {
                                  try {
                                    await api.patch(`/requisitions/${selectedReq.id}/lines/${line.id}/co-verify`);
                                    fetchDetail(selectedReq.id);
                                    fetchRequisitions();
                                  } catch (err) {
                                    alert(err.response?.data?.error || 'Co-verify failed');
                                  }
                                }}
                              >
                                Co-Verify
                              </button>
                            )}

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
                                  Approve
                                </button>
                                <button
                                  className="btn btn-critical btn-sm"
                                  onClick={() => {
                                    setRejectLine(line);
                                    setRejectReason('');
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}

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
                                Resubmit
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

      {/* ── HIGH-READABILITY CLASSIFICATION-BASED SPREADSHEET GRID MODAL ── */}
      {isGridOpen && (
        <div className="modal-overlay" onClick={() => setIsGridOpen(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '96vw',
              width: '1400px',
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '2px solid var(--theme-border)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>
                  REQUISITION FORM
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                  Multi-patient session inventory acquisition sheet (Classifications & Patients Registry)
                </span>
              </div>
              <button className="modal-close" onClick={() => setIsGridOpen(false)}>✕</button>
            </div>

            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Session Date:</label>
                  <input
                    type="date"
                    className="form-control"
                    value={gridSessionDate}
                    onChange={e => setGridSessionDate(e.target.value)}
                    style={{ width: '160px' }}
                  />
                </div>

                {/* QoL Preset Copy Selector */}
                {pastSessionPresets.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--theme-text-muted)' }}>Load Preset:</label>
                    <select
                      className="form-control"
                      onChange={e => {
                        if (e.target.value) {
                          handleLoadPreset(e.target.value, true);
                          e.target.value = '';
                        }
                      }}
                      style={{ width: '270px', fontSize: '12px' }}
                    >
                      <option value="">Copy Preset from Past Session...</option>
                      {pastSessionPresets.map(p => (
                        <option key={p.dateKey} value={p.dateKey}>
                          Session: {p.displayDate} ({p.patientIds.size} Patients, {p.itemIds.size} Items)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Patient Selector from Patients Registry */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  className="form-control"
                  value={selectedPatientPicker}
                  onChange={e => {
                    setSelectedPatientPicker(e.target.value);
                    if (e.target.value) addPatientFromRegistry(e.target.value);
                  }}
                  style={{ width: '260px' }}
                >
                  <option value="">+ Add Patient from Registry...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.chartNumber}] {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {gridError && <div className="login-error" style={{ marginBottom: '12px' }}>{gridError}</div>}

            {/* Scrollable Sticky Spreadsheet Grid Container */}
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--theme-border)', borderRadius: 'var(--border-radius-md)', position: 'relative' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' }}>
                <thead>
                  {/* Top Header Row: Patients */}
                  <tr>
                    {/* Top-Left Cell (Sticky Top & Left) */}
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'left',
                        minWidth: '280px',
                        position: 'sticky',
                        top: 0,
                        left: 0,
                        zIndex: 30,
                        background: 'var(--theme-card-bg)',
                        borderBottom: '2px solid var(--theme-border)',
                        borderRight: '2px solid var(--theme-border)',
                      }}
                    >
                      ITEM CLASSIFICATIONS & DESCRIPTION
                    </th>

                    {/* Patient Column Headers (Sticky Top) */}
                    {gridColumns.map((col, idx) => {
                      if (col.isAdditional) {
                        return (
                          <th
                            key="additional"
                            style={{
                              padding: '10px 8px',
                              textAlign: 'center',
                              minWidth: '130px',
                              position: 'sticky',
                              top: 0,
                              zIndex: 20,
                              background: '#FEF3C7',
                              color: '#92400E',
                              borderBottom: '2px solid var(--theme-border)',
                              borderLeft: '2px solid #F59E0B',
                            }}
                          >
                            <div style={{ fontWeight: '700', fontSize: '13px' }}>ADDITIONAL</div>
                            <div style={{ fontSize: '10px', fontWeight: '400' }}>Station Stock</div>
                          </th>
                        );
                      }
                      const pat = patients.find(p => p.id === col.patientId);
                      return (
                        <th
                          key={col.patientId}
                          style={{
                            padding: '10px 8px',
                            textAlign: 'center',
                            minWidth: '140px',
                            position: 'sticky',
                            top: 0,
                            zIndex: 20,
                            background: 'var(--theme-card-bg)',
                            borderBottom: '2px solid var(--theme-border)',
                            borderLeft: '1px solid var(--theme-border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--theme-text-bold)' }}>
                              {pat?.name || 'Patient'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removePatientColumn(idx)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: '12px' }}
                              title="Remove patient column"
                            >
                              ✕
                            </button>
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                            Chart #{pat?.chartNumber}
                          </div>
                          {pat?.diagnosis && (
                            <div style={{ fontSize: '9px', background: 'var(--theme-bg)', padding: '2px 4px', borderRadius: '3px', marginTop: '4px' }}>
                              {pat.diagnosis}
                            </div>
                          )}
                        </th>
                      );
                    })}

                    {/* Rightmost Total Header (Sticky Top & Right) */}
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        minWidth: '95px',
                        position: 'sticky',
                        top: 0,
                        right: 0,
                        zIndex: 30,
                        background: '#E0F2FE',
                        color: '#0369A1',
                        borderBottom: '2px solid var(--theme-border)',
                        borderLeft: '2px solid #0284C7',
                      }}
                    >
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Render Sections per Top-Level Item Classification */}
                  {CLASSIFICATIONS.map(cls => {
                    const clsCatalogItems = itemsByClassification[cls.key] || [];
                    const clsSheetItemIds = sheetItemIds.filter(id => {
                      const found = items.find(i => i.id === id);
                      return found && (found.itemType || 'MEDICAL_CONSUMABLE') === cls.key;
                    });

                    return (
                      <React.Fragment key={cls.key}>
                        {/* Classification Header Row */}
                        <tr style={{ background: cls.bgColor }}>
                          <td
                            colSpan={gridColumns.length + 2}
                            style={{
                              padding: '8px 14px',
                              fontWeight: '700',
                              fontSize: '12px',
                              letterSpacing: '0.3px',
                              color: cls.color,
                              borderTop: '2px solid var(--theme-border)',
                              borderBottom: '1px solid var(--theme-border)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{cls.label} ({clsSheetItemIds.length} added)</span>

                              {/* Quick Search & Picker specifically for this classification */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                                {/* Quick Search Box */}
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder={`Quick search ${cls.label.toLowerCase()}...`}
                                  value={searchQuery[cls.key] || ''}
                                  onChange={e => setSearchQuery(prev => ({ ...prev, [cls.key]: e.target.value }))}
                                  style={{ fontSize: '11px', padding: '3px 8px', height: '28px', width: '220px' }}
                                />

                                {/* Popover Search Results */}
                                {searchQuery[cls.key]?.trim() && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '32px',
                                      right: 0,
                                      width: '320px',
                                      maxHeight: '220px',
                                      overflowY: 'auto',
                                      background: 'var(--theme-card-bg)',
                                      border: '1px solid var(--theme-border)',
                                      borderRadius: 'var(--border-radius-md)',
                                      boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                                      zIndex: 100,
                                      padding: '4px',
                                    }}
                                  >
                                    {clsCatalogItems.filter(it =>
                                      it.name?.toLowerCase().includes(searchQuery[cls.key].toLowerCase()) ||
                                      it.sku?.toLowerCase().includes(searchQuery[cls.key].toLowerCase())
                                    ).length === 0 ? (
                                      <div style={{ padding: '8px', fontSize: '11px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                                        No matching items found.
                                      </div>
                                    ) : (
                                      clsCatalogItems.filter(it =>
                                        it.name?.toLowerCase().includes(searchQuery[cls.key].toLowerCase()) ||
                                        it.sku?.toLowerCase().includes(searchQuery[cls.key].toLowerCase())
                                      ).map(it => (
                                        <div
                                          key={it.id}
                                          onClick={() => {
                                            addItemToSheet(it.id);
                                            setSearchQuery(prev => ({ ...prev, [cls.key]: '' }));
                                          }}
                                          style={{
                                            padding: '6px 10px',
                                            fontSize: '11px',
                                            cursor: 'pointer',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            justify: 'space-between',
                                            alignItems: 'center',
                                            borderBottom: '1px solid var(--theme-border)',
                                            background: 'var(--theme-card-bg)',
                                          }}
                                        >
                                          <div>
                                            <strong style={{ display: 'block', color: 'var(--theme-text-bold)' }}>{it.name}</strong>
                                            <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>[{it.sku}] • {it.unit}</span>
                                          </div>
                                          <span style={{ fontSize: '10px', fontWeight: '700', color: ((it.stockLevels || []).reduce((sum, s) => sum + (s.quantityOnHand || 0), 0)) < 10 ? 'var(--color-critical)' : 'var(--color-success)' }}>
                                            Stock: {(it.stockLevels || []).reduce((sum, s) => sum + (s.quantityOnHand || 0), 0)}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}

                                {/* Fallback Dropdown Selector */}
                                <select
                                  className="form-control"
                                  onChange={e => {
                                    addItemToSheet(e.target.value);
                                    e.target.value = '';
                                  }}
                                  style={{ fontSize: '11px', padding: '3px 8px', height: '28px', minWidth: '160px' }}
                                >
                                  <option value="">Select from list...</option>
                                  {clsCatalogItems.map(it => (
                                    <option key={it.id} value={it.id}>
                                      {it.name} (Stock: {(it.stockLevels || []).reduce((sum, s) => sum + (s.quantityOnHand || 0), 0)})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Item Rows under this classification */}
                        {clsSheetItemIds.length === 0 ? (
                          <tr>
                            <td
                              colSpan={gridColumns.length + 2}
                              style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--theme-text-muted)', fontStyle: 'italic', borderBottom: '1px solid var(--theme-border)' }}
                            >
                              No items added under {cls.label} yet. Use the "+ Add Item" picker above to add items to today's sheet.
                            </td>
                          </tr>
                        ) : (
                          clsSheetItemIds.map(itemId => {
                            const item = items.find(i => i.id === itemId);
                            if (!item) return null;

                            const availStock = (item.stockLevels || []).reduce((sum, s) => sum + (s.quantityOnHand || 0), 0);
                            const rowTotal = calculateRowTotal(item.id);
                            const isLowStock = rowTotal > availStock;

                            return (
                              <tr key={item.id} style={{ borderBottom: '1px solid var(--theme-border)' }}>
                                {/* Left Item Column (Sticky Left) */}
                                <td
                                  style={{
                                    padding: '8px 12px',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 10,
                                    background: 'var(--theme-card-bg)',
                                    borderRight: '2px solid var(--theme-border)',
                                    fontWeight: '500',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)' }}>{item.name}</div>
                                      <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                                        Unit: {item.unit} | Stock: <span style={{ fontWeight: '700', color: availStock < 10 ? 'var(--color-critical)' : 'var(--color-success)' }}>{availStock}</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeItemFromSheet(item.id)}
                                      style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: '12px' }}
                                      title="Remove item row"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>

                                {/* Patient Cells */}
                                {gridColumns.map(col => {
                                  const val = gridQuantities[`${col.patientId}_${item.id}`] || '';
                                  return (
                                    <td
                                      key={col.patientId}
                                      style={{
                                        padding: '4px',
                                        textAlign: 'center',
                                        borderLeft: col.isAdditional ? '2px solid #F59E0B' : '1px solid var(--theme-border)',
                                        background: col.isAdditional ? '#FFFBEB' : undefined,
                                      }}
                                    >
                                      <input
                                        type="number"
                                        min="0"
                                        className="form-control"
                                        value={val}
                                        onChange={e => handleCellChange(col.patientId, item.id, e.target.value)}
                                        style={{
                                          width: '100%',
                                          textAlign: 'center',
                                          padding: '4px',
                                          fontWeight: val ? '700' : 'normal',
                                          backgroundColor: val ? '#FEF08A' : undefined,
                                          borderColor: val ? '#F59E0B' : undefined,
                                        }}
                                      />
                                    </td>
                                  );
                                })}

                                {/* Rightmost Total Cell (Sticky Right) */}
                                <td
                                  style={{
                                    padding: '8px',
                                    textAlign: 'center',
                                    fontWeight: '700',
                                    background: isLowStock ? '#FEE2E2' : '#F0F9FF',
                                    color: isLowStock ? 'var(--color-critical)' : rowTotal > 0 ? '#0369A1' : 'var(--theme-text-muted)',
                                    borderLeft: '2px solid #0284C7',
                                    position: 'sticky',
                                    right: 0,
                                    zIndex: 10,
                                  }}
                                >
                                  {rowTotal || 0}
                                  {isLowStock && (
                                    <div style={{ fontSize: '9px', color: 'var(--color-critical)', fontWeight: '700' }}>EXCEEDS STOCK</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Bottom Patient Notes / Remarks Row */}
                  <tr style={{ background: 'var(--theme-card-bg)', borderTop: '2px solid var(--theme-border)' }}>
                    <td
                      style={{
                        padding: '12px',
                        fontWeight: '700',
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        background: 'var(--theme-card-bg)',
                        borderRight: '2px solid var(--theme-border)',
                      }}
                    >
                      PATIENT SESSION NOTES / REMARKS
                    </td>
                    {gridColumns.map((col, idx) => (
                      <td key={col.patientId} style={{ padding: '6px', borderLeft: col.isAdditional ? '2px solid #F59E0B' : '1px solid var(--theme-border)' }}>
                        <textarea
                          className="form-control"
                          placeholder={col.isAdditional ? "Station notes..." : "Session notes..."}
                          rows="2"
                          value={col.notes || ''}
                          onChange={e => handleNotesChange(idx, e.target.value)}
                          style={{ fontSize: '11px', resize: 'vertical' }}
                        />
                      </td>
                    ))}
                    <td style={{ position: 'sticky', right: 0, zIndex: 10, background: '#F0F9FF', borderLeft: '2px solid #0284C7' }}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ marginTop: '16px', borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
              <button type="button" className="btn" onClick={() => setIsGridOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleGridSubmit} disabled={isSubmitting} style={{ fontWeight: '700', padding: '10px 24px' }}>
                {isSubmitting ? 'Submitting Requisition Sheet...' : 'Submit Requisition Sheet'}
              </button>
            </div>
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
              {(() => {
                const lineLoc = approveLine.location || 'ECART';
                const stockLevels = approveLine.item?.stockLevels || [];
                const availStock = stockLevels.find(s => s.location === lineLoc)?.quantityOnHand ?? 0;
                return (
                  <>
                    <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                      Requested: <strong>{approveLine.qtyRequested}</strong> {approveLine.item?.unit} • Target Pool: <strong style={{ color: 'var(--theme-primary)' }}>{lineLoc === 'ECART' ? '🛒 eCart' : '🏢 Central'}</strong> • Available Pool Stock: <strong>{availStock}</strong>
                    </p>
                    <div className="form-group">
                      <label className="form-label">Approved Quantity</label>
                      <input
                        type="number"
                        className="form-control"
                        min="1"
                        max={availStock || approveLine.qtyRequested}
                        value={approveQty}
                        onChange={e => setApproveQty(e.target.value)}
                      />
                    </div>
                  </>
                );
              })()}
                <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                  You may approve a partial quantity. FIFO will auto-deduct from oldest batches for medications.
                </span>
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
