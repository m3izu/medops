import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ContextualHelp from './ContextualHelp';

import healingHandsLogo from '../assets/healinghands.png';
import medopsLogo from '../assets/medops.png';

const Layout = ({ children }) => {
  const { user, logout, hasPermission } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const [density, setDensity] = useState(() => localStorage.getItem('density') || 'spaced');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isManagement = user?.role === 'MANAGEMENT_OFFICE';
  const brandName = isManagement ? 'MedOPS' : 'HEALING HANDS CENTER';

  // Close sidebar on page change
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
    if (path.startsWith('/import')) return 'CSV Bulk Import';
    if (path.startsWith('/dispense')) return 'Direct Item Dispensing';
    if (path.startsWith('/returns')) return 'Item Returns';
    if (path.startsWith('/cashier')) return 'Direct Dispense Billing Logs';
    if (path.startsWith('/manual')) return 'System End-User Manual';
    return 'MedOPS Portal';
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
          <img 
            src={isManagement ? medopsLogo : healingHandsLogo} 
            alt={brandName} 
            style={{ 
              maxHeight: '52px', 
              maxWidth: '100%', 
              objectFit: 'contain',
              marginBottom: '8px',
              borderRadius: 'var(--border-radius-sm)'
            }} 
          />
          <h2 style={{ fontSize: '13px', color: '#cbd5e1', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'center', margin: 0 }}>
            {brandName}
          </h2>
        </div>
        
        <ul className="sidebar-menu">
          <li className="sidebar-item">
            <NavLink to="/" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} end>
              <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
              </span> Overview
            </NavLink>
          </li>

          {hasPermission('create_users') && (
            <li className="sidebar-item">
              <NavLink to="/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </span> Staff Accounts
              </NavLink>
            </li>
          )}

          {hasPermission('manage_patients') && (
            <li className="sidebar-item">
              <NavLink to="/patients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                </span> Patients
              </NavLink>
            </li>
          )}

          {hasPermission('manage_suppliers') && (
            <li className="sidebar-item">
              <NavLink to="/suppliers" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                </span> Suppliers
              </NavLink>
            </li>
          )}

          {hasPermission('manage_categories') && (
            <li className="sidebar-item">
              <NavLink to="/categories" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                </span> Categories
              </NavLink>
            </li>
          )}

          {(hasPermission('manage_items') || hasPermission('view_inventory_logs')) && (
            <li className="sidebar-item">
              <NavLink to="/items" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon><polygon points="12 12 21 6.92 21 17.08 12 22.08"></polygon><polygon points="12 2 21 6.92 12 12 3 6.92 12 2"></polygon><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </span> Stock Items
              </NavLink>
            </li>
          )}

          {hasPermission('receive_stock') && (
            <li className="sidebar-item">
              <NavLink to="/stock/receive" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                </span> Receive Stock
              </NavLink>
            </li>
          )}

          {(hasPermission('submit_requisition') || hasPermission('view_own_forms')) && (
            <li className="sidebar-item">
              <NavLink to="/requisitions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                </span> Requisitions
              </NavLink>
            </li>
          )}

          {hasPermission('dispense_item') && (
            <li className="sidebar-item">
              <NavLink to="/dispense" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path><path d="m8.5 8.5 7 7"></path></svg>
                </span> Direct Dispense
              </NavLink>
            </li>
          )}

          {hasPermission('return_item') && (
            <li className="sidebar-item">
              <NavLink to="/returns" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                </span> Return Item
              </NavLink>
            </li>
          )}

          {hasPermission('record_billing') && (
            <li className="sidebar-item">
              <NavLink to="/cashier" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"></path><path d="M16 8H8"></path><path d="M16 12H8"></path><path d="M13 16H8"></path></svg>
                </span> Cashier Log
              </NavLink>
            </li>
          )}

          {hasPermission('log_discard') && (
            <li className="sidebar-item">
              <NavLink to="/discards" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </span> Discard Logs
              </NavLink>
            </li>
          )}

          {hasPermission('view_inventory_logs') && (
            <li className="sidebar-item">
              <NavLink to="/stock/transactions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                </span> Audit Feed
              </NavLink>
            </li>
          )}

          {user?.role === 'MANAGEMENT_OFFICE' && (
            <li className="sidebar-item">
              <NavLink to="/mgmt/audit" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </span> MedOPS Audit
              </NavLink>
            </li>
          )}

          {hasPermission('enter_stocktake_count') && (
            <li className="sidebar-item">
              <NavLink to="/stocktake" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                </span> Stocktake
              </NavLink>
            </li>
          )}

          {hasPermission('generate_reports') && (
            <li className="sidebar-item">
              <NavLink to="/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </span> Reports
              </NavLink>
            </li>
          )}

          {hasPermission('bulk_import') && (
            <li className="sidebar-item">
              <NavLink to="/import" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </span> CSV Import
              </NavLink>
            </li>
          )}

          <li className="sidebar-item" style={{ marginTop: 'auto' }}>
            <NavLink to="/manual" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="sidebar-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              </span> User Manual
            </NavLink>
          </li>
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
            <button 
              className="menu-toggle-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Menu"
              style={{ display: 'none' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {sidebarOpen ? (
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                ) : (
                  <>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </>
                )}
              </svg>
            </button>
            <h1 className="navbar-title">{getPageTitle()}</h1>
          </div>
          
          <div className="navbar-right">
            {/* Density Toggle Button */}
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setDensity(prev => prev === 'spaced' ? 'compact' : 'spaced')}
              title={`Switch to ${density === 'spaced' ? 'Compact' : 'Spaced'} Layout Density`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px', marginRight: '8px' }}
            >
              <span>{density === 'spaced' ? 'Use Compact Grid' : 'Use Spaced Grid'}</span>
            </button>

            {/* Notification Bell Dropdown */}
            <div className="notification-container" ref={dropdownRef}>
              <button className="notification-bell" onClick={() => setNotifOpen(!notifOpen)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
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
        
        {/* Floating Contextual Help Drawer */}
        <ContextualHelp />
      </div>
    </div>
  );
};

export default Layout;
