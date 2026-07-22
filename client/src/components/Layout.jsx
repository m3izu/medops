import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import api from '../services/api';
import ContextualHelp from './ContextualHelp';
import CommandPalette from './CommandPalette';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';

import healingHandsLogo from '../assets/healinghands.png';
import medopsLogo from '../assets/medops.png';

const LayoutInner = ({ children }) => {
  const { user, logout, hasPermission } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const [density, setDensity] = useState(() => localStorage.getItem('density') || 'spaced');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isManagement = user?.role === 'MANAGEMENT_OFFICE';
  const brandName = isManagement ? 'MedOPS' : 'HEALING HANDS CENTER';

  // Toggle sidebar rail mode
  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  // Keyboard shortcut Ctrl+K and ? listener
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      } else if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.target.isContentEditable) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Close sidebar on mobile page change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Apply management/clinic theme and density classes to body
  useEffect(() => {
    if (isManagement) {
      document.body.setAttribute('data-theme', 'management');
    } else {
      document.body.removeAttribute('data-theme');
    }
  }, [isManagement]);

  useEffect(() => {
    if (density === 'compact') {
      document.body.classList.add('density-compact');
      document.body.classList.remove('density-spaced');
    } else {
      document.body.classList.add('density-spaced');
      document.body.classList.remove('density-compact');
    }
    localStorage.setItem('density', density);
  }, [density]);

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (err) {
      console.error('Error fetching notifications', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (notifId, e) => {
    e.stopPropagation();
    try {
      await api.patch(`/notifications/${notifId}/read`);
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = (notif, e) => {
    setNotifOpen(false);
    handleMarkAsRead(notif.id, e);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    if (path.startsWith('/users')) return 'System Staff & Roles';
    if (path.startsWith('/items')) return 'Inventory Stock Levels';
    if (path.startsWith('/categories')) return 'Item Classification';
    if (path.startsWith('/suppliers')) return 'Supplier Directory';
    if (path.startsWith('/patients')) return 'Dialysis Patient Database';
    if (path.startsWith('/requisitions')) return 'Clinical Requisitions';
    if (path.startsWith('/discards')) return 'Waste & Discard Logs';
    if (path.startsWith('/stock/receive')) return 'Receive Deliveries';
    if (path.startsWith('/stock/transactions')) return 'Inventory Transaction Logs';
    if (path.startsWith('/mgmt/audit')) return 'MedOPS Audit Feed';
    if (path.startsWith('/stocktake')) return 'Stocktake & Reconciliation';
    if (path.startsWith('/reports')) return 'Monthly Report Archive';
    if (path.startsWith('/import')) return 'CSV Bulk Import';
    if (path.startsWith('/dispense')) return 'Direct Item Dispensing';
    if (path.startsWith('/returns')) return 'Item Returns';
    if (path.startsWith('/cashier')) return 'Direct Dispense Billing Logs';
    if (path.startsWith('/manual')) return 'System Manual';
    return 'MedOPS Portal';
  };

  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path === '/') return [{ label: 'Portal', path: '/' }, { label: 'Overview', path: '/' }];
    const title = getPageTitle();
    return [{ label: 'Portal', path: '/' }, { label: title, path }];
  };

  return (
    <div className="app-container">
      {/* Mobile Drawer Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 999,
          }}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 12px', position: 'relative' }}>
          <img
            src={isManagement ? medopsLogo : healingHandsLogo}
            alt={brandName}
            style={{
              maxHeight: isCollapsed ? '36px' : '48px',
              maxWidth: '100%',
              objectFit: 'contain',
              marginBottom: isCollapsed ? '0' : '8px',
              borderRadius: 'var(--border-radius-sm)',
              transition: 'all 0.2s ease',
            }}
          />
          {!isCollapsed && (
            <h2 className="sidebar-brand-title" style={{ fontSize: '12px', color: '#cbd5e1', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'center', margin: 0 }}>
              {brandName}
            </h2>
          )}
          <button
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            style={{
              position: 'absolute',
              right: '-12px',
              top: '20px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--theme-primary)',
              color: '#fff',
              border: '2px solid var(--theme-sidebar-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '10px',
              zIndex: 10,
            }}
          >
            {isCollapsed ? '▶' : '◀'}
          </button>
        </div>

        <ul className="sidebar-menu">
          {/* Group 1: Overview */}
          <div className="sidebar-group">
            <div className="sidebar-group-title">Overview</div>
            <li className="sidebar-item">
              <NavLink to="/" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} end title="Overview">
                <span className="sidebar-icon">📊</span>
                <span className="sidebar-link-text">Overview</span>
              </NavLink>
            </li>
            <li className="sidebar-item">
              <NavLink to="/manual" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="System Manual">
                <span className="sidebar-icon">📖</span>
                <span className="sidebar-link-text">System Manual</span>
              </NavLink>
            </li>
          </div>

          {/* Group 2: Clinical Operations */}
          <div className="sidebar-group">
            <div className="sidebar-group-title">Clinical Operations</div>
            {hasPermission('manage_patients') && (
              <li className="sidebar-item">
                <NavLink to="/patients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Patients">
                  <span className="sidebar-icon">🩺</span>
                  <span className="sidebar-link-text">Patients</span>
                </NavLink>
              </li>
            )}
            {(hasPermission('submit_requisition') || hasPermission('view_own_forms')) && (
              <li className="sidebar-item">
                <NavLink to="/requisitions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Requisitions">
                  <span className="sidebar-icon">📋</span>
                  <span className="sidebar-link-text">Requisitions</span>
                </NavLink>
              </li>
            )}
            {hasPermission('dispense_item') && (
              <li className="sidebar-item">
                <NavLink to="/dispense" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Direct Dispense">
                  <span className="sidebar-icon">💊</span>
                  <span className="sidebar-link-text">Direct Dispense</span>
                </NavLink>
              </li>
            )}
            {hasPermission('return_item') && (
              <li className="sidebar-item">
                <NavLink to="/returns" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Return Item">
                  <span className="sidebar-icon">🔄</span>
                  <span className="sidebar-link-text">Return Item</span>
                </NavLink>
              </li>
            )}
            {hasPermission('record_billing') && (
              <li className="sidebar-item">
                <NavLink to="/cashier" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Cashier Log">
                  <span className="sidebar-icon">💳</span>
                  <span className="sidebar-link-text">Cashier Log</span>
                </NavLink>
              </li>
            )}
          </div>

          {/* Group 3: Inventory & Stock */}
          <div className="sidebar-group">
            <div className="sidebar-group-title">Inventory & Stock</div>
            {(hasPermission('manage_items') || hasPermission('view_inventory_logs')) && (
              <li className="sidebar-item">
                <NavLink to="/items" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Stock Items">
                  <span className="sidebar-icon">📦</span>
                  <span className="sidebar-link-text">Stock Items</span>
                </NavLink>
              </li>
            )}
            {hasPermission('manage_categories') && (
              <li className="sidebar-item">
                <NavLink to="/categories" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Categories">
                  <span className="sidebar-icon">🏷️</span>
                  <span className="sidebar-link-text">Categories</span>
                </NavLink>
              </li>
            )}
            {hasPermission('receive_stock') && (
              <li className="sidebar-item">
                <NavLink to="/stock/receive" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Receive Stock">
                  <span className="sidebar-icon">📥</span>
                  <span className="sidebar-link-text">Receive Stock</span>
                </NavLink>
              </li>
            )}
            {hasPermission('log_discard') && (
              <li className="sidebar-item">
                <NavLink to="/discards" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Discard Logs">
                  <span className="sidebar-icon">🗑️</span>
                  <span className="sidebar-link-text">Discard Logs</span>
                </NavLink>
              </li>
            )}
            {hasPermission('enter_stocktake_count') && (
              <li className="sidebar-item">
                <NavLink to="/stocktake" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Stocktake">
                  <span className="sidebar-icon">📝</span>
                  <span className="sidebar-link-text">Stocktake</span>
                </NavLink>
              </li>
            )}
          </div>

          {/* Group 4: Management & System */}
          <div className="sidebar-group">
            <div className="sidebar-group-title">Management & System</div>
            {hasPermission('create_users') && (
              <li className="sidebar-item">
                <NavLink to="/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Staff Accounts">
                  <span className="sidebar-icon">👥</span>
                  <span className="sidebar-link-text">Staff Accounts</span>
                </NavLink>
              </li>
            )}
            {hasPermission('manage_suppliers') && (
              <li className="sidebar-item">
                <NavLink to="/suppliers" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Suppliers">
                  <span className="sidebar-icon">🏢</span>
                  <span className="sidebar-link-text">Suppliers</span>
                </NavLink>
              </li>
            )}
            {hasPermission('generate_reports') && (
              <li className="sidebar-item">
                <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Reports">
                  <span className="sidebar-icon">📈</span>
                  <span className="sidebar-link-text">Reports</span>
                </NavLink>
              </li>
            )}
            {hasPermission('bulk_import') && (
              <li className="sidebar-item">
                <NavLink to="/import" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="CSV Import">
                  <span className="sidebar-icon">📤</span>
                  <span className="sidebar-link-text">CSV Import</span>
                </NavLink>
              </li>
            )}
            {hasPermission('view_inventory_logs') && (
              <li className="sidebar-item">
                <NavLink to="/stock/transactions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Audit Feed">
                  <span className="sidebar-icon">📜</span>
                  <span className="sidebar-link-text">Audit Feed</span>
                </NavLink>
              </li>
            )}
            {user?.role === 'MANAGEMENT_OFFICE' && (
              <li className="sidebar-item">
                <NavLink to="/mgmt/audit" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="MedOPS Audit">
                  <span className="sidebar-icon">🔍</span>
                  <span className="sidebar-link-text">MedOPS Audit</span>
                </NavLink>
              </li>
            )}
          </div>
        </ul>

        <div className="sidebar-footer">
          <div className="sidebar-footer-info">
            <div>Role: <strong>{user?.role?.replace('_', ' ')}</strong></div>
            <div style={{ opacity: 0.7, marginTop: '4px' }}>v1.0.0 (SQLite Local)</div>
          </div>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="main-content">
        <header className="navbar">
          <div className="navbar-left">
            <button
              className="menu-toggle-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Menu"
              style={{ display: 'none' }}
            >
              ☰
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div className="breadcrumbs">
                {getBreadcrumbs().map((b, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="breadcrumb-separator">/</span>}
                    <span className={idx === getBreadcrumbs().length - 1 ? 'breadcrumb-current' : ''}>
                      {b.label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
              <h1 className="navbar-title">{getPageTitle()}</h1>
            </div>
          </div>

          <div className="navbar-right">
            {/* Command Palette Trigger Button */}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setCmdOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '6px 14px' }}
              title="Search menu or commands (Ctrl + K)"
            >
              <span>🔍 Quick Search</span>
              <kbd style={{ fontSize: '10px', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--theme-border)' }}>
                Ctrl K
              </kbd>
            </button>

            {/* Density Toggle Button */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setDensity((prev) => (prev === 'spaced' ? 'compact' : 'spaced'))}
              title={`Switch to ${density === 'spaced' ? 'Compact' : 'Spaced'} Layout Density`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px' }}
            >
              <span>{density === 'spaced' ? 'Compact Density' : 'Spaced Density'}</span>
            </button>

            {/* Notification Bell Dropdown */}
            <div className="notification-container" ref={dropdownRef}>
              <button
                className="notification-bell"
                onClick={() => setNotifOpen(!notifOpen)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
              </button>

              <div className={`notification-dropdown ${notifOpen ? 'open' : ''}`}>
                <div className="notification-header">
                  <strong>Notifications</strong>
                  {unreadCount > 0 && (
                    <button className="notification-action-btn" onClick={handleMarkAllRead}>
                      Mark all read
                    </button>
                  )}
                </div>

                <ul className="notification-list">
                  {notifications.length > 0 ? (
                    notifications.map((notif) => (
                      <li
                        key={notif.id}
                        className={`notification-item ${!notif.isRead ? 'unread' : ''}`}
                        onClick={(e) => handleNotificationClick(notif, e)}
                        style={{ cursor: notif.link ? 'pointer' : 'default' }}
                      >
                        <span className="notification-item-text">{notif.message}</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="notification-item-time">
                            {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!notif.isRead && (
                            <button
                              className="notification-action-btn"
                              onClick={(e) => handleMarkAsRead(notif.id, e)}
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </li>
                    ))
                  ) : (
                    <div className="notification-empty">No notifications</div>
                  )}
                </ul>
              </div>
            </div>

            {/* Profile Avatar Card */}
            <div className="user-profile">
              <div className="user-avatar">{getInitials(user?.name)}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: 'var(--theme-text-bold)' }}>{user?.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>@{user?.username}</div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => logout(false)}
                style={{ marginLeft: '12px', padding: '6px 10px' }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Child Content */}
        {children}

        {/* Floating Contextual Help, Command Palette, and Keyboard Shortcuts */}
        <ContextualHelp />
        <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
        <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </div>
  );
};

export default function Layout({ children }) {
  return (
    <ToastProvider>
      <LayoutInner>{children}</LayoutInner>
    </ToastProvider>
  );
}
