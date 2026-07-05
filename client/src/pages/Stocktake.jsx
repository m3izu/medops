import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_BADGE = {
  IN_PROGRESS: 'badge-warning',
  COMPLETED:   'badge-success',
  CANCELLED:   'badge-critical',
};

const Stocktake = () => {
  const { hasPermission } = useAuth();

  const [stocktakes,    setStocktakes]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');

  // Active stocktake detail
  const [activeStocktake, setActiveStocktake]   = useState(null);
  const [stLoading,       setStLoading]         = useState(false);

  // Per-line physical count edits (lineId -> qty string)
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState({});

  // Confirmation dialogs
  const [initiating,  setInitiating]  = useState(false);
  const [completing,  setCompleting]  = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  const canManage = hasPermission('initiate_stocktake');

  const fetchList = async () => {
    try {
      setLoading(true);
      const res = await api.get('/stocktakes');
      setStocktakes(res.data || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load stocktake sessions.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id) => {
    try {
      setStLoading(true);
      const res = await api.get(`/stocktakes/${id}`);
      setActiveStocktake(res.data);
      // Pre-fill counts from existing physicalQty
      const pre = {};
      (res.data.lines || []).forEach(l => {
        pre[l.id] = l.physicalQty !== null ? String(l.physicalQty) : '';
      });
      setCounts(pre);
    } catch (err) {
      console.error(err);
      alert('Failed to load stocktake details.');
    } finally {
      setStLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleInitiate = async () => {
    if (!confirm('Initiate a new stocktake? All clinic staff will be notified to begin a physical count.')) return;
    try {
      setInitiating(true);
      const res = await api.post('/stocktakes');
      await fetchList();
      await fetchDetail(res.data.id);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to initiate stocktake.');
    } finally {
      setInitiating(false);
    }
  };

  const handleSaveLine = async (lineId) => {
    const qty = parseInt(counts[lineId]);
    if (isNaN(qty) || qty < 0) {
      alert('Please enter a valid non-negative quantity.');
      return;
    }
    try {
      setSaving(s => ({ ...s, [lineId]: true }));
      await api.patch(`/stocktakes/${activeStocktake.id}/lines/${lineId}`, { physicalQty: qty });
      // Update local state
      setActiveStocktake(prev => ({
        ...prev,
        lines: prev.lines.map(l => l.id === lineId
          ? { ...l, physicalQty: qty, discrepancy: qty - l.systemQty }
          : l
        ),
      }));
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to save count.');
    } finally {
      setSaving(s => ({ ...s, [lineId]: false }));
    }
  };

  const handleComplete = async () => {
    try {
      setCompleting(true);
      await api.patch(`/stocktakes/${activeStocktake.id}/complete`);
      setConfirmComplete(false);
      await fetchList();
      // Reload detail to reflect new status
      await fetchDetail(activeStocktake.id);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to complete stocktake.');
    } finally {
      setCompleting(false);
    }
  };

  // Derived counts
  const countedLines      = (activeStocktake?.lines || []).filter(l => l.physicalQty !== null);
  const totalLines        = (activeStocktake?.lines || []).length;
  const discrepancyLines  = (activeStocktake?.lines || []).filter(l => l.discrepancy !== 0 && l.discrepancy !== null);
  const uncountedLines    = totalLines - countedLines.length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Stocktake & Reconciliation</h2>
          <p className="page-title-desc">
            Initiate physical inventory counts, record physical quantities, review discrepancies, and apply stock adjustments.
          </p>
        </div>
        {canManage && !activeStocktake && (
          <button
            className="btn btn-primary"
            onClick={handleInitiate}
            disabled={initiating}
          >
            {initiating ? 'Initiating...' : '+ New Stocktake'}
          </button>
        )}
        {canManage && activeStocktake?.status === 'IN_PROGRESS' && (
          <button
            className="btn btn-critical"
            onClick={() => setConfirmComplete(true)}
            disabled={completing}
          >
            ✓ Complete & Apply Adjustments
          </button>
        )}
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Confirm Complete Dialog */}
      {confirmComplete && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Complete Stocktake?</h3>
              <button className="modal-close" onClick={() => setConfirmComplete(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px' }}>
                This will apply ADJUSTMENT transaction logs for all <strong>{discrepancyLines.length}</strong> line(s) with discrepancies and mark the stocktake as completed.
              </p>
              {uncountedLines > 0 && (
                <div style={{ padding: '10px 14px', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', borderRadius: 'var(--border-radius-md)', fontSize: '13px', marginBottom: '12px' }}>
                  ⚠️ <strong>{uncountedLines}</strong> item(s) have not been physically counted yet and will be skipped.
                </div>
              )}
              <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                This action cannot be undone. All adjusted quantities will be reflected immediately in system stock levels.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmComplete(false)}>Cancel</button>
              <button className="btn btn-critical" onClick={handleComplete} disabled={completing}>
                {completing ? 'Applying...' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: activeStocktake ? '280px 1fr' : '1fr', gap: '24px' }}>

        {/* Left: Stocktake history list */}
        <div className="widget-card" style={{ alignSelf: 'start' }}>
          <div className="widget-header">
            <span className="widget-title">Stocktake Sessions</span>
          </div>
          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '20px', color: 'var(--theme-text-muted)' }}>Loading...</p>
            ) : stocktakes.length === 0 ? (
              <p style={{ padding: '20px', color: 'var(--theme-text-muted)', textAlign: 'center', fontSize: '13px' }}>
                No stocktake sessions yet.<br />
                {canManage && 'Click "+ New Stocktake" to begin.'}
              </p>
            ) : (
              <div>
                {stocktakes.map(st => (
                  <div
                    key={st.id}
                    onClick={() => fetchDetail(st.id)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--theme-border)',
                      backgroundColor: activeStocktake?.id === st.id ? 'var(--theme-primary-bg)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span className={`badge ${STATUS_BADGE[st.status] || 'badge-neutral'}`}>
                        {st.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                        {new Date(st.initiatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      By <strong>{st.initiatedBy.name}</strong>
                    </div>
                    {st.completedAt && (
                      <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                        Completed: {new Date(st.completedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Stocktake Detail */}
        {activeStocktake && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">
                Stocktake Count Sheet
                <span className={`badge ${STATUS_BADGE[activeStocktake.status] || 'badge-neutral'}`} style={{ marginLeft: '10px' }}>
                  {activeStocktake.status.replace('_', ' ')}
                </span>
              </span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                <span>✅ {countedLines.length}/{totalLines} counted</span>
                {discrepancyLines.length > 0 && (
                  <span style={{ color: 'var(--color-warning)', fontWeight: '600' }}>
                    ⚠️ {discrepancyLines.length} discrepancies
                  </span>
                )}
              </div>
            </div>

            <div className="widget-body" style={{ padding: 0 }}>
              {stLoading ? (
                <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading count sheet...</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>SKU</th>
                      <th>Unit</th>
                      <th style={{ textAlign: 'right' }}>System Qty</th>
                      <th style={{ textAlign: 'center', minWidth: '130px' }}>Physical Count</th>
                      <th style={{ textAlign: 'right' }}>Discrepancy</th>
                      {activeStocktake.status === 'IN_PROGRESS' && canManage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeStocktake.lines || []).map(line => {
                      const isSaved     = line.physicalQty !== null;
                      const discrepancy = line.discrepancy;
                      const isChanged   = counts[line.id] !== '' && String(line.physicalQty) !== counts[line.id];
                      return (
                        <tr key={line.id} style={{
                          backgroundColor: discrepancy !== 0 && discrepancy !== null
                            ? discrepancy > 0 ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.05)'
                            : 'transparent'
                        }}>
                          <td><strong>{line.item.name}</strong></td>
                          <td><code style={{ fontSize: '11px' }}>{line.item.sku}</code></td>
                          <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{line.item.unit}</td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>{line.systemQty}</td>
                          <td style={{ textAlign: 'center' }}>
                            {activeStocktake.status === 'IN_PROGRESS' && canManage ? (
                              <input
                                type="number"
                                min="0"
                                className="form-control"
                                style={{ width: '90px', textAlign: 'center', padding: '4px 8px', margin: '0 auto' }}
                                placeholder="Count"
                                value={counts[line.id] ?? ''}
                                onChange={e => setCounts(c => ({ ...c, [line.id]: e.target.value }))}
                              />
                            ) : (
                              <span style={{ color: isSaved ? 'var(--theme-text)' : 'var(--theme-text-muted)', fontStyle: isSaved ? 'normal' : 'italic' }}>
                                {isSaved ? line.physicalQty : '—'}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {discrepancy !== null ? (
                              <span style={{
                                fontWeight: '600',
                                color: discrepancy === 0 ? 'var(--color-success)' : discrepancy > 0 ? 'var(--color-success)' : 'var(--color-critical)',
                              }}>
                                {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
                            )}
                          </td>
                          {activeStocktake.status === 'IN_PROGRESS' && canManage && (
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleSaveLine(line.id)}
                                disabled={saving[line.id] || counts[line.id] === ''}
                              >
                                {saving[line.id] ? '...' : isSaved && !isChanged ? '✓' : 'Save'}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stocktake;
