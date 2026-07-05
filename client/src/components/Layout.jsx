import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Layout = ({ children }) => {
  const { user, logout, hasPermission } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const isManagement = user?.role === 'MANAGEMENT_OFFICE';
  const brandName = isManagement ? 'MedOPS' : 'HEALING HANDS CENTER';

  // Apply management or clinic theme class to body
  useEffect(() => {
    if (isManagement) {
      document.body.setAttribute('data-theme', 'management');
    } else {
      document.body.removeAttribute('data-theme');
    }
  }, [isManagement]);

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
    const interval = setInterval(fetchNotifications, 20000); // Poll every 20 seconds
    return () => clearInterval(interval);
  }, [user]);

  // Handle click outside notification dropdown to close it
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

  // Resolve user initials for avatar
  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
    return 'MedOPS Portal';
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            {brandName}
          </h2>
        </div>
        
        <ul className="sidebar-menu">
          <li className="sidebar-item">
            <NavLink to="/" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} end>
              <span className="sidebar-icon">📊</span> Overview
            </NavLink>
          </li>

          {hasPermission('create_users') && (
            <li className="sidebar-item">
              <NavLink to="/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">👥</span> Staff Accounts
              </NavLink>
            </li>
          )}

          {hasPermission('manage_patients') && (
            <li className="sidebar-item">
              <NavLink to="/patients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">🏥</span> Patients
              </NavLink>
            </li>
          )}

          {hasPermission('manage_suppliers') && (
            <li className="sidebar-item">
              <NavLink to="/suppliers" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">🚚</span> Suppliers
              </NavLink>
            </li>
          )}

          {hasPermission('manage_categories') && (
            <li className="sidebar-item">
              <NavLink to="/categories" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">🏷️</span> Categories
              </NavLink>
            </li>
          )}

          {(hasPermission('manage_items') || hasPermission('view_inventory_logs')) && (
            <li className="sidebar-item">
              <NavLink to="/items" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">📦</span> Stock Items
              </NavLink>
            </li>
          )}

          {hasPermission('receive_stock') && (
            <li className="sidebar-item">
              <NavLink to="/stock/receive" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">📥</span> Receive Stock
              </NavLink>
            </li>
          )}

          {(hasPermission('submit_requisition') || hasPermission('view_own_forms')) && (
            <li className="sidebar-item">
              <NavLink to="/requisitions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">📝</span> Requisitions
              </NavLink>
            </li>
          )}

          {hasPermission('log_discard') && (
            <li className="sidebar-item">
              <NavLink to="/discards" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">🗑️</span> Discard Logs
              </NavLink>
            </li>
          )}

          {hasPermission('view_inventory_logs') && (
            <li className="sidebar-item">
              <NavLink to="/stock/transactions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">📜</span> Audit Feed
              </NavLink>
            </li>
          )}

          {user?.role === 'MANAGEMENT_OFFICE' && (
            <li className="sidebar-item">
              <NavLink to="/mgmt/audit" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">🔍</span> MedOPS Audit
              </NavLink>
            </li>
          )}

          {hasPermission('initiate_stocktake') && (
            <li className="sidebar-item">
              <NavLink to="/stocktake" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">🔄</span> Stocktake
              </NavLink>
            </li>
          )}

          {hasPermission('generate_reports') && (
            <li className="sidebar-item">
              <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon">📁</span> Reports
              </NavLink>
            </li>
          )}
        </ul>

        <div className="sidebar-footer">
          <div>Role: <strong>{user?.role?.replace('_', ' ')}</strong></div>
          <div style={{ opacity: 0.7, marginTop: '4px' }}>v1.0.0 (SQLite Local)</div>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="main-content">
        <header className="navbar">
          <div className="navbar-left">
            <h1 className="navbar-title">{getPageTitle()}</h1>
          </div>
          
          <div className="navbar-right">
            {/* Notification Bell Dropdown */}
            <div className="notification-container" ref={dropdownRef}>
              <button className="notification-bell" onClick={() => setNotifOpen(!notifOpen)}>
                🔔
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
                    notifications.map(notif => (
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
      </div>
    </div>
  );
};

export default Layout;
