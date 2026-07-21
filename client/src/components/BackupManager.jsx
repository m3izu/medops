import React, { useState, useEffect } from 'react';
import api from '../services/api';

const TYPE_BADGES = {
  MANUAL: { label: 'Manual Snapshot', color: 'var(--theme-primary)', bg: 'var(--theme-primary-bg)' },
  AUTOMATED: { label: 'Daily Auto-Backup', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  EMERGENCY_PRE_ROLLBACK: { label: 'Emergency Pre-Rollback', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
};

const BackupManager = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create Checkpoint Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [checkpointLabel, setCheckpointLabel] = useState('');
  const [creating, setCreating] = useState(false);

  // Rollback Modal State
  const [rollbackTarget, setRollbackTarget] = useState(null); // backup object
  const [adminPassword, setAdminPassword] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [rollbackError, setRollbackError] = useState('');

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const res = await api.get('/backup/list');
      setBackups(res.data || []);
      setError('');
    } catch (err) {
      console.error('Failed to load backup checkpoints:', err);
      setError(err.response?.data?.error || 'Failed to load database backup checkpoints.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateCheckpoint = async (e) => {
    e.preventDefault();
    if (!checkpointLabel.trim()) return;

    try {
      setCreating(true);
      setError('');
      await api.post('/backup/checkpoint', { label: checkpointLabel.trim() });
      setSuccess(`Snapshot "${checkpointLabel}" created successfully.`);
      setCheckpointLabel('');
      setIsCreateOpen(false);
      fetchBackups();
    } catch (err) {
      console.error('Create checkpoint failed:', err);
      setError(err.response?.data?.error || 'Failed to create checkpoint.');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadDb = (id) => {
    window.open(`${api.defaults.baseURL}/backup/download/${id}`, '_blank');
  };

  const handleExportJson = () => {
    window.open(`${api.defaults.baseURL}/backup/export-json`, '_blank');
  };

  const handleOpenRollbackModal = (backup) => {
    setRollbackTarget(backup);
    setAdminPassword('');
    setRollbackError('');
  };

  const handleConfirmRollback = async (e) => {
    e.preventDefault();
    if (!adminPassword || !rollbackTarget) return;

    try {
      setRestoring(true);
      setRollbackError('');
      const res = await api.post(`/backup/restore/${rollbackTarget.id}`, { password: adminPassword });
      setSuccess(res.data.message || 'Database successfully restored.');
      setRollbackTarget(null);
      setAdminPassword('');
      fetchBackups();
    } catch (err) {
      console.error('Rollback failed:', err);
      setRollbackError(err.response?.data?.error || 'Failed to execute database rollback.');
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteCheckpoint = async (id, label) => {
    if (!window.confirm(`Are you sure you want to delete checkpoint "${label}"? This file will be removed from disk.`)) return;

    try {
      await api.delete(`/backup/${id}`);
      fetchBackups();
    } catch (err) {
      console.error('Delete failed:', err);
      alert(err.response?.data?.error || 'Failed to delete checkpoint.');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ marginTop: '24px' }}>
      {/* Header & Quick Action Buttons */}
      <div className="widget-card" style={{ marginBottom: '20px', padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--theme-text-bold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💾</span> Database Backups & Point-in-Time Checkpoints
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--theme-text-muted)' }}>
              Manage automatic daily snapshots, create manual point-in-time checkpoints, and safely rollback database state.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportJson} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>📄</span> Export JSON Dump
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setIsCreateOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>📸</span> Create Checkpoint
            </button>
          </div>
        </div>
      </div>

      {error && <div className="login-error-banner" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && (
        <div className="badge badge-success" style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: 'var(--border-radius-sm)', fontSize: '13px' }}>
          ✓ {success}
        </div>
      )}

      {/* Checkpoints Timeline Table */}
      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-title">Point-in-Time Checkpoint Timeline</span>
          <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>{backups.length} snapshot(s) stored</span>
        </div>
        <div className="widget-body" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading backup timeline...</p>
          ) : backups.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>💾</div>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '500' }}>No Checkpoint Snapshots Found</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Click "📸 Create Checkpoint" above to take an immediate database snapshot.</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Checkpoint Label</th>
                  <th>Snapshot Type</th>
                  <th>File Size</th>
                  <th>Created By</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => {
                  const badge = TYPE_BADGES[b.type] || TYPE_BADGES.MANUAL;
                  return (
                    <tr key={b.id}>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          {new Date(b.createdAt).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(b.createdAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontSize: '14px', color: 'var(--theme-text-bold)' }}>{b.label}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontFamily: 'var(--font-mono)' }}>{b.filename}</div>
                      </td>
                      <td>
                        <span 
                          className="badge" 
                          style={{ color: badge.color, backgroundColor: badge.bg, border: `1px solid ${badge.color}30`, fontSize: '11px' }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
                        {formatBytes(b.sizeBytes)}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {b.createdBy?.name || <span style={{ color: 'var(--theme-text-muted)' }}>System Scheduler</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => handleDownloadDb(b.id)}
                            title="Download .db file"
                            style={{ fontSize: '12px' }}
                          >
                            📥 Download
                          </button>
                          <button 
                            className="btn btn-warning btn-sm" 
                            onClick={() => handleOpenRollbackModal(b)}
                            title="Rollback database state to this exact point in time"
                            style={{ fontSize: '12px' }}
                          >
                            ⏪ Rollback
                          </button>
                          <button 
                            className="btn btn-danger btn-sm" 
                            onClick={() => handleDeleteCheckpoint(b.id, b.label)}
                            title="Delete checkpoint file"
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Create Checkpoint */}
      {isCreateOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>📸 Create Point-in-Time Checkpoint</h3>
              <button className="help-drawer-close" onClick={() => setIsCreateOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCheckpoint}>
              <div className="modal-body">
                <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginBottom: '16px' }}>
                  An uncorrupted, atomic snapshot of your database file will be saved. You can restore back to this point in time whenever needed.
                </p>
                <div className="form-group">
                  <label className="form-label">Checkpoint Label</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="e.g., Pre-Stocktake Count / Before Bulk Import"
                    value={checkpointLabel}
                    onChange={e => setCheckpointLabel(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--theme-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating Snapshot...' : 'Create Snapshot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rollback Confirmation */}
      {rollbackTarget && (
        <div className="modal-backdrop" onClick={() => setRollbackTarget(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--theme-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: 'var(--color-critical)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span> Confirm Database Rollback
              </h3>
              <button className="help-drawer-close" onClick={() => setRollbackTarget(null)}>✕</button>
            </div>
            <form onSubmit={handleConfirmRollback}>
              <div className="modal-body" style={{ padding: '16px 0' }}>
                <div style={{ backgroundColor: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 'var(--border-radius-sm)', padding: '12px 14px', fontSize: '13px', marginBottom: '16px' }}>
                  <strong>Warning:</strong> Restoring will rewind active database records back to state:
                  <div style={{ margin: '6px 0 0 0', fontWeight: '700', fontSize: '14px', color: 'var(--theme-text-bold)' }}>
                    "{rollbackTarget.label}" ({new Date(rollbackTarget.createdAt).toLocaleString()})
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--theme-primary-bg)', padding: '10px 12px', borderRadius: 'var(--border-radius-sm)', fontSize: '12px', color: 'var(--theme-primary)', marginBottom: '16px' }}>
                  🛡️ <strong>Safety Guarantee:</strong> The system will automatically generate an <strong>Emergency Pre-Rollback Snapshot</strong> right before restoring, so you can always revert back if needed.
                </div>

                {rollbackError && <div className="login-error-banner" style={{ marginBottom: '16px' }}>{rollbackError}</div>}

                <div className="form-group">
                  <label className="form-label">Confirm Top Admin Password</label>
                  <input 
                    type="password" 
                    className="form-control"
                    placeholder="Enter your admin password"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '16px 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--theme-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRollbackTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={restoring}>
                  {restoring ? 'Rolling Back Database...' : 'Execute Point-in-Time Rollback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupManager;
