import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';

const HighlightText = ({ text, search }) => {
  if (!search || !text) return <span>{text}</span>;
  const regex = new RegExp(`(${search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi');
  const parts = String(text).split(regex);
  return (
    <span>
      {parts.map((part, i) => 
        regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
      )}
    </span>
  );
};

const PERMISSION_DESCS = {
  view_items: "Permits searching and viewing the inventory catalog and stock levels.",
  manage_items: "Allows creating, editing, and archiving catalog items.",
  view_archived_items: "Grants access to toggle and view archived catalog items.",
  receive_stock: "Allows recording inbound deliveries and allocating batch numbers.",
  submit_requisition: "Allows clinics to request consumable stock items.",
  approve_requisition: "Allows managers to authorize/partially approve requisitions.",
  dispatch_requisition: "Allows inventory officers to dispatch authorized supplies.",
  deliver_requisition: "Allows clinic staff to receive and log inbound requisitions.",
  log_discard: "Allows logging expired, damaged, or recalled stock as discard.",
  initiate_stocktake: "Allows creating stock count reconciliation sheets.",
  submit_stocktake: "Allows completing and syncing physical counts into inventory.",
  generate_reports: "Permits building and printing consumption analysis reports.",
  create_users: "Allows creating and managing staff account logins.",
  manage_rbac: "Allows changing roles and overriding system permission matrices."
};

const Users = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [userPermissions, setUserPermissions] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [permissionAuditLogs, setPermissionAuditLogs] = useState([]);
  
  // Navigation tabs inside Users panel
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'roles' | 'audit'

  // Modals state
  const [addUserModal, setAddUserModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(null); // stores user object

  // Form states
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('NURSE');
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Permission structure
  const [allPermissionKeys, setAllPermissionKeys] = useState([]);
  const [lockedPermissions, setLockedPermissions] = useState([]);

  const ROLES = [
    'TOP_ADMIN',
    'INVENTORY_MANAGER',
    'NURSE',
    'SUPPLY_OFFICER',
    'VIEWER_AUDITOR',
    'MANAGEMENT_OFFICE',
  ];

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (err) {
      console.error('Error fetching users', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRolePermissions = async () => {
    try {
      const response = await api.get('/permissions/roles');
      setRolePermissions(response.data.permissions || {});
      setAllPermissionKeys(response.data.allKeys || []);
      setLockedPermissions(response.data.lockedPermissions || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/permissions/audit');
      setPermissionAuditLogs(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRolePermissions();
    fetchAuditLogs();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      setIsSubmitting(true);
      await api.post('/users', { name, username, password, role });
      setSuccess(`Account for ${name} created successfully.`);
      setName('');
      setUsername('');
      setPassword('');
      setRole('NURSE');
      setAddUserModal(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (userId) => {
    try {
      await api.patch(`/users/${userId}/activate`);
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      setIsResetting(true);
      await api.post(`/users/${passwordModal.id}/reset-password`, { temporaryPassword: tempPassword });
      setSuccess(`Password for ${passwordModal.name} reset successfully.`);
      setTempPassword('');
      setPasswordModal(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this staff account? All past inventory logs for this user will be preserved for auditing.')) {
      return;
    }
    try {
      await api.delete(`/users/${userId}`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  // Permission selection
  const handleSelectUserForPermissions = async (userObj) => {
    setSelectedUser(userObj);
    try {
      const response = await api.get(`/permissions/users/${userObj.id}`);
      const overrides = {};
      response.data.forEach(override => {
        overrides[override.permissionKey] = override.isEnabled;
      });
      setUserPermissions(overrides);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleRolePermission = async (targetRole, key, currentValue) => {
    try {
      await api.put(`/permissions/roles/${targetRole}/${key}`, { isEnabled: !currentValue });
      fetchRolePermissions();
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleUserOverride = async (key, currentValue) => {
    if (!selectedUser) return;
    try {
      await api.put(`/permissions/users/${selectedUser.id}/${key}`, { isEnabled: !currentValue });
      
      // Update local state
      setUserPermissions({
        ...userPermissions,
        [key]: !currentValue,
      });
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter(u => {
    const query = filterSearch.toLowerCase().trim();
    if (!query) return true;
    return (
      (u.name || '').toLowerCase().includes(query) ||
      (u.username || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="page-container">
      {/* Messages */}
      {success && <div style={{ padding: '12px 16px', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 'var(--border-radius-md)' }}>{success}</div>}
      {error && <div style={{ padding: '12px 16px', background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderRadius: 'var(--border-radius-md)' }}>{error}</div>}

      {/* Main Tabs */}
      <div className="filter-bar" style={{ padding: '12px 24px' }}>
        <button 
          className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('list')}
        >
          👤 Staff Accounts & Overrides
        </button>
        <button 
          className={`btn ${activeTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('roles'); setSelectedUser(null); }}
        >
          ⚙️ Role Permissions Defaults
        </button>
        <button 
          className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('audit'); setSelectedUser(null); fetchAuditLogs(); }}
        >
          📜 Permission Changes Audit Log
        </button>
      </div>

      {activeTab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 1fr' : '1fr', gap: '24px' }}>
          {/* User List Panel */}
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">Active Clinic Staff Directory</span>
              <button className="btn btn-primary btn-sm" onClick={() => setAddUserModal(true)}>
                + Create Staff Account
              </button>
            </div>
            {/* Filter Bar */}
            <div className="filter-bar" style={{ padding: '12px 24px', borderBottom: '1px solid var(--theme-border)', gap: '12px' }}>
              <div className="filter-item" style={{ minWidth: '200px', flexGrow: 1 }}>
                <label>Search Staff Member</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search name or username..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="widget-body" style={{ padding: 0 }}>
              {loading ? (
                <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading staff accounts...</p>
              ) : filteredUsers.length === 0 ? (
                <EmptyState
                  icon="👤"
                  title="No Staff Accounts Found"
                  description="No clinical staff accounts matched your search keyword. Check spelling or register a new login."
                  actionText="+ Create Staff Account"
                  onAction={() => setAddUserModal(true)}
                />
              ) : (
                <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} style={{ background: selectedUser?.id === u.id ? 'var(--theme-primary-bg)' : 'transparent' }}>
                      <td>
                        <strong><HighlightText text={u.name} search={filterSearch} /></strong>
                        <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                          @<HighlightText text={u.username} search={filterSearch} />
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{u.role.replace('_', ' ')}</span>
                      </td>
                      <td>
                        <span className={`badge ${u.isActive ? 'badge-success' : 'badge-warning'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {u.role !== 'TOP_ADMIN' && (
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleSelectUserForPermissions(u)}
                            >
                              Permissions
                            </button>
                          )}
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPasswordModal(u)}
                          >
                            Reset
                          </button>
                          {u.id !== currentUser?.id && (
                            <>
                              <button 
                                className={`btn btn-secondary btn-sm`}
                                onClick={() => handleToggleActive(u.id)}
                              >
                                {u.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button 
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteUser(u.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>

          {/* User override panel */}
          {selectedUser && (
            <div className="widget-card">
              <div className="widget-header">
                <div>
                  <span className="widget-title">Custom Permission Overrides</span>
                  <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                    Configuring overrides for <strong>{selectedUser.name}</strong>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUser(null)}>Close</button>
              </div>
              <div className="widget-body" style={{ padding: 0 }}>
                <div style={{ padding: '16px', background: 'rgba(0,0,0,0.02)', fontSize: '13px', borderBottom: '1px solid var(--theme-border)' }}>
                  💡 Overrides toggle specific capabilities just for this user. Toggled items override the default values set for the <strong>{selectedUser.role.replace('_', ' ')}</strong> role.
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Permission Key</th>
                      <th>Role Default</th>
                      <th>Override Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPermissionKeys.map(key => {
                      const isLocked = lockedPermissions.includes(key);
                      const roleDefault = rolePermissions[selectedUser.role]?.[key] ?? false;
                      const hasOverride = userPermissions[key] !== undefined;
                      const currentVal = hasOverride ? userPermissions[key] : roleDefault;
                      
                      return (
                        <tr key={key}>
                          <td>
                            <span className="tooltip-container" style={{ borderBottom: '1px dotted var(--theme-text-muted)' }}>
                              <strong>{key.replace(/_/g, ' ')}</strong>
                              {PERMISSION_DESCS[key] && (
                                <span className="tooltip-text">{PERMISSION_DESCS[key]}</span>
                              )}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${roleDefault ? 'badge-success' : 'badge-neutral'}`}>
                              {roleDefault ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td>
                            {isLocked ? (
                              <span className="badge badge-neutral">Permanently Locked</span>
                            ) : (
                              <button
                                className={`btn btn-sm ${currentVal ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => handleToggleUserOverride(key, currentVal)}
                              >
                                {currentVal ? 'Enabled' : 'Disabled'} {hasOverride ? '(Override Active)' : '(Using Default)'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Dynamic Role-Level Permissions Matrix</span>
          </div>
          <div className="widget-body" style={{ padding: 0 }}>
            <table className="table" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Permission Key</th>
                  {ROLES.map(r => (
                    <th key={r} style={{ fontSize: '11px', textAlign: 'center' }}>
                      {r.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPermissionKeys.map(key => {
                  const isLocked = lockedPermissions.includes(key);
                  return (
                    <tr key={key}>
                      <td><strong>{key.replace(/_/g, ' ')}</strong></td>
                      {ROLES.map(r => {
                        const isEnabled = rolePermissions[r]?.[key] ?? false;
                        return (
                          <td key={r} style={{ textAlign: 'center' }}>
                            {isLocked ? (
                              <span className="badge badge-neutral" style={{ fontSize: '9px' }}>
                                {r === 'TOP_ADMIN' ? 'Locked ON' : 'Locked OFF'}
                              </span>
                            ) : (
                              <button
                                className={`btn btn-sm ${isEnabled ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => handleToggleRolePermission(r, key, isEnabled)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                              >
                                {isEnabled ? 'ON' : 'OFF'}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Security & Role Adjustment Logs</span>
          </div>
          <div className="widget-body" style={{ padding: 0 }}>
            {permissionAuditLogs.length === 0 ? (
              <EmptyState
                icon="📜"
                title="No Audit Logs Available"
                description="No security privilege adjustments or custom role overrides have been logged in the system database."
              />
            ) : (
              <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Performed By</th>
                  <th>Target Type</th>
                  <th>Target User / Role</th>
                  <th>Permission Action</th>
                  <th>Change Details</th>
                </tr>
              </thead>
              <tbody>
                {permissionAuditLogs.map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.changedAt).toLocaleString()}</td>
                    <td>{log.changedBy?.name} (@{log.changedBy?.username})</td>
                    <td>
                      <span className="badge badge-neutral">{log.targetType.toUpperCase()}</span>
                    </td>
                    <td>
                      {log.targetType === 'role' ? (
                        <strong>{log.targetRole?.replace('_', ' ')}</strong>
                      ) : (
                        <span>{log.targetUser?.name || 'Deleted Account'} (@{log.targetUser?.username})</span>
                      )}
                    </td>
                    <td><code>{log.permissionKey}</code></td>
                    <td>
                      <span style={{ color: log.oldValue ? 'var(--color-success)' : 'var(--color-critical)', fontWeight: 'bold' }}>
                        {log.oldValue ? 'Enabled' : 'Disabled'}
                      </span>
                      {' → '}
                      <span style={{ color: log.newValue ? 'var(--color-success)' : 'var(--color-critical)', fontWeight: 'bold' }}>
                        {log.newValue ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create User */}
      {addUserModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">Create New Staff Account</span>
              <button className="modal-close" onClick={() => setAddUserModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-control"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input
                    className="form-control"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Initial Password</label>
                  <input
                    className="form-control"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Primary Role</label>
                  <select className="form-control" value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
               <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAddUserModal(false)} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {passwordModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">Reset Password: {passwordModal.name}</span>
              <button className="modal-close" onClick={() => setPasswordModal(null)}>×</button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Temporary Password</label>
                  <input
                    className="form-control"
                    type="password"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    required
                    placeholder="Enter temporary password"
                  />
                </div>
              </div>
               <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPasswordModal(null)} disabled={isResetting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isResetting}>
                  {isResetting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
