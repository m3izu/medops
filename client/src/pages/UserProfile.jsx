import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';

const CATEGORY_BADGES = {
  DISPENSE: { bg: 'var(--color-info-bg)', color: 'var(--color-info)', label: '💊 Dispense' },
  REQUISITION: { bg: 'var(--theme-primary-bg)', color: 'var(--theme-primary)', label: '📋 Requisition' },
  DISCARD: { bg: 'var(--color-critical-bg)', color: 'var(--color-critical)', label: '🗑️ Discard' },
  TRANSFER: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', label: '🔄 Transfer' },
  INVENTORY: { bg: 'var(--theme-card-bg)', color: 'var(--theme-text)', label: '📦 Inventory' },
  SECURITY: { bg: 'var(--theme-primary-bg)', color: 'var(--theme-primary)', label: '🛡️ Security' },
};

const UserProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const targetId = id || 'me';

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState('');

  // Tab State
  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'permissions' | 'security'

  // Activity Log Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/users/${targetId}/profile`);
      setProfileData(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load user profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [targetId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterSearch, filterCategory]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }
    try {
      setIsChangingPassword(true);
      await api.put('/users/me/password', { currentPassword, newPassword });
      toast.success('Your password has been updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      setPasswordError(err.response?.data?.error || 'Failed to update password.');
      toast.error('Failed to update password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ padding: '32px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
        <p>Loading user profile and system activity audit stream...</p>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="page-container">
        <EmptyState
          icon="⚠️"
          title="Profile Access Error"
          description={error || 'Unable to load target user profile.'}
          actionText="← Back to Staff Directory"
          onAction={() => navigate('/users')}
        />
      </div>
    );
  }

  const { user, summary, activityStream } = profileData;
  const isSelf = user.id === currentUser?.id;

  const filteredStream = activityStream.filter(act => {
    const searchMatch = !filterSearch || 
      act.action.toLowerCase().includes(filterSearch.toLowerCase()) || 
      act.details.toLowerCase().includes(filterSearch.toLowerCase());
    const categoryMatch = !filterCategory || act.category === filterCategory;
    return searchMatch && categoryMatch;
  });

  return (
    <div className="page-container">
      {/* Back Button */}
      <div style={{ marginBottom: '16px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/users')}>
          ← Back to Staff Directory
        </button>
      </div>

      {/* User Header Profile Card */}
      <div className="widget-card" style={{ marginBottom: '24px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <div 
              style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                background: 'var(--theme-primary)', 
                color: '#fff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '26px', 
                fontWeight: 'bold',
                boxShadow: 'var(--theme-shadow-md)'
              }}
            >
              {(user.name || 'U')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '22px' }}>{user.name}</h2>
                <span className="badge badge-primary" style={{ fontSize: '12px' }}>
                  {user.role.replace('_', ' ')}
                </span>
                <span className={`badge ${user.isActive ? 'badge-success' : 'badge-critical'}`}>
                  {user.isActive ? 'Active Account' : 'Inactive'}
                </span>
                {isSelf && <span className="badge badge-info" style={{ fontSize: '11px' }}>Your Profile</span>}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginTop: '4px' }}>
                <code>@{user.username}</code> • Account Created: <strong>{new Date(user.createdAt).toLocaleDateString()}</strong>
                {user.creatorName && (
                  <span> • Registered By: <strong>{user.creatorName}</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Activity Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="metric-card">
          <div className="metric-title">💊 Dispense Operations</div>
          <div className="metric-value">{summary.totalDispenses}</div>
          <div className="metric-desc">Direct patient dispenses</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">📋 Requisitions Handled</div>
          <div className="metric-value">{summary.totalRequisitions}</div>
          <div className="metric-desc">Created or approved forms</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">🗑️ Discards Logged</div>
          <div className="metric-value">{summary.totalDiscards}</div>
          <div className="metric-desc">Logged expired/damaged stock</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">🔄 Stock Transfers</div>
          <div className="metric-value">{summary.totalTransfers}</div>
          <div className="metric-desc">Inter-facility transfer logs</div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="filter-bar" style={{ padding: '12px 24px', marginBottom: '16px', gap: '10px' }}>
        <button
          className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('audit')}
        >
          📜 System-Wide Activity Audit Log ({activityStream.length})
        </button>
        <button
          className={`btn ${activeTab === 'permissions' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('permissions')}
        >
          🔐 Role & Account Information
        </button>
        {isSelf && (
          <button
            className={`btn ${activeTab === 'security' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('security')}
          >
            🔑 Security & Password
          </button>
        )}
      </div>

      {/* TAB 1: SYSTEM-WIDE ACTIVITY AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Chronological System Action Timeline</span>
          </div>

          {/* Activity Log Filter Bar */}
          <div className="filter-bar" style={{ padding: '12px 24px', borderBottom: '1px solid var(--theme-border)', gap: '12px' }}>
            <div className="filter-item" style={{ flexGrow: 1, minWidth: '220px' }}>
              <label>Search Action or Details</label>
              <input
                type="text"
                className="form-control"
                placeholder="Search audit trail..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>
            <div className="filter-item" style={{ minWidth: '170px' }}>
              <label>Action Category</label>
              <select
                className="form-control"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All Action Categories</option>
                <option value="DISPENSE">💊 Dispenses</option>
                <option value="REQUISITION">📋 Requisitions</option>
                <option value="DISCARD">🗑️ Discards</option>
                <option value="TRANSFER">🔄 Transfers</option>
                <option value="INVENTORY">📦 Inventory Receipts</option>
                <option value="SECURITY">🛡️ Security Modifications</option>
              </select>
            </div>
          </div>

          <div className="widget-body" style={{ padding: 0 }}>
            {filteredStream.length === 0 ? (
              <EmptyState
                icon="📜"
                title="No System Activity Logged"
                description="No system-wide actions matched your active search query or selected action filter."
              />
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Category</th>
                      <th>System Action</th>
                      <th>Details & Metadata</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStream
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map(act => {
                        const badge = CATEGORY_BADGES[act.category] || { bg: 'var(--theme-card-bg)', color: 'var(--theme-text)', label: act.category };
                        return (
                          <tr key={act.id}>
                            <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                              {new Date(act.timestamp).toLocaleString()}
                            </td>
                            <td>
                              <span 
                                className="badge" 
                                style={{ background: badge.bg, color: badge.color, fontWeight: 'bold' }}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td>
                              <strong>{act.action}</strong>
                            </td>
                            <td style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                              {act.details}
                            </td>
                            <td>
                              <span className={`badge ${act.location === 'ECART' ? 'badge-info' : act.location === 'CENTRAL' ? 'badge-secondary' : 'badge-neutral'}`}>
                                {act.location === 'ECART' ? '🛒 eCart' : act.location === 'CENTRAL' ? '🏢 Central' : act.location}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredStream.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ROLE & ACCOUNT INFORMATION */}
      {activeTab === 'permissions' && (
        <div className="widget-card" style={{ padding: '24px' }}>
          <h3 style={{ marginTop: 0 }}>Account & Authority Profile</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <p><strong>Account Name:</strong> {user.name}</p>
              <p><strong>Username:</strong> <code>@{user.username}</code></p>
              <p><strong>System Role:</strong> <span className="badge badge-primary">{user.role.replace('_', ' ')}</span></p>
              <p><strong>Account Status:</strong> <span className={`badge ${user.isActive ? 'badge-success' : 'badge-critical'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></p>
            </div>
            <div>
              <p><strong>Registration Date:</strong> {new Date(user.createdAt).toLocaleString()}</p>
              <p><strong>Registered By:</strong> {user.creatorName || 'System Initializer'}</p>
              <p><strong>Access Authority:</strong> Governed by role defaults & custom user overrides</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SECURITY & PASSWORD (SELF ONLY) */}
      {activeTab === 'security' && isSelf && (
        <div className="widget-card" style={{ padding: '24px', maxWidth: '500px' }}>
          <h3 style={{ marginTop: 0 }}>Change Your Account Password</h3>
          <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
            Update your login credentials. Passwords must be at least 6 characters long.
          </p>

          {passwordError && (
            <div style={{ padding: '12px', background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderRadius: 'var(--border-radius-md)', marginBottom: '16px', fontSize: '13px' }}>
              {passwordError}
            </div>
          )}

          <form onSubmit={handleChangePassword}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">Current Password</label>
              <input
                type="password"
                className="form-control"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={isChangingPassword}>
              {isChangingPassword ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
