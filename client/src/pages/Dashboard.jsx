import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Dashboard = () => {
  const { user, hasPermission } = useAuth();
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState({ stockAlerts: [], expiringBatches: [] });
  const [prefs, setPrefs] = useState([]);
  const [pendingDispenseCount, setPendingDispenseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const quickActions = [
    { 
      label: 'Receive Stock', 
      desc: 'Register inbound shipments & allocate batch numbers',
      path: '/stock/receive', 
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>, 
      permission: 'receive_stock', 
      color: 'var(--theme-primary)',
      bgColor: 'rgba(13,148,136,0.08)',
      shadowColor: 'rgba(13,148,136,0.15)'
    },
    { 
      label: 'Submit Requisition', 
      desc: 'Request clinic consumables for dialysis sessions',
      path: '/requisitions', 
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>, 
      permission: 'submit_requisition', 
      color: '#8b5cf6',
      bgColor: 'rgba(139,92,246,0.08)',
      shadowColor: 'rgba(139,92,246,0.15)'
    },
    { 
      label: 'Log Discard/Waste', 
      desc: 'Report expired, damaged, or recalled items',
      path: '/discards', 
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>, 
      permission: 'log_discard', 
      color: 'var(--color-critical)',
      bgColor: 'rgba(239,68,68,0.08)',
      shadowColor: 'rgba(239,68,68,0.15)'
    },
    { 
      label: 'Initiate Stocktake', 
      desc: 'Start physical counts to reconcile inventory levels',
      path: '/stocktake', 
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>, 
      permission: ['initiate_stocktake', 'enter_stocktake_count'], 
      color: 'var(--color-warning)',
      bgColor: 'rgba(245,158,11,0.08)',
      shadowColor: 'rgba(245,158,11,0.15)'
    },
    { 
      label: 'Manage Staff', 
      desc: 'Configure user logins, roles, and permission levels',
      path: '/users', 
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>, 
      permission: 'create_users', 
      color: '#3b82f6',
      bgColor: 'rgba(59,130,246,0.08)',
      shadowColor: 'rgba(59,130,246,0.15)'
    },
    { 
      label: 'View Reports', 
      desc: 'Real-time analytics, section stats & trend tracking',
      path: '/reports', 
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>, 
      permission: 'view_reports', 
      color: '#10b981',
      bgColor: 'rgba(16,185,129,0.08)',
      shadowColor: 'rgba(16,185,129,0.15)'
    },
    { 
      label: 'Dispense Item', 
      desc: 'Dispense items directly to patient charts',
      path: '/dispense', 
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path><path d="m8.5 8.5 7 7"></path></svg>, 
      permission: 'dispense_item', 
      color: '#06b6d4',
      bgColor: 'rgba(6,182,212,0.08)',
      shadowColor: 'rgba(6,182,212,0.15)'
    }
  ].filter(action => Array.isArray(action.permission) ? action.permission.some(p => hasPermission(p)) : hasPermission(action.permission));

  // Widget metadata
  const WIDGETS = {
    pending_reqs: { label: 'Pending Requisitions', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER'] },
    stock_alerts: { label: 'Low & Critical Stock', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER', 'SUPPLY_OFFICER', 'MANAGEMENT_OFFICE'] },
    expiring_meds: { label: 'Expiring Medications (90d)', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER', 'CASHIER', 'MANAGEMENT_OFFICE'] },
    recent_transactions: { label: 'Recent Transactions', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER', 'SUPPLY_OFFICER', 'CASHIER', 'MANAGEMENT_OFFICE'] },
    cashier_pending: { label: 'Pending Billing Records', roles: ['TOP_ADMIN', 'CASHIER'] },
    nurse_my_forms: { label: 'My Requisitions History', roles: ['NURSE'] },
  };

  const fetchDashboardData = async () => {
    try {
      const promises = [
        api.get('/dashboard/summary'),
        api.get('/stock/alerts'),
        api.get('/dashboard/prefs')
      ];
      if (hasPermission('record_billing')) {
        promises.push(api.get('/dispense/pending-count'));
      }

      const results = await Promise.all(promises);
      setSummary(results[0].data);
      setAlerts(results[1].data);
      setPrefs(results[2].data);
      if (hasPermission('record_billing') && results[3]) {
        setPendingDispenseCount(results[3].data.count ?? 0);
      }
    } catch (err) {
      console.error('Error fetching dashboard summary', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleToggleWidget = async (widgetKey) => {
    const existing = prefs.find(p => p.widgetKey === widgetKey);
    const updatedVisible = existing ? !existing.isVisible : false;
    
    // Optimistic state update
    const newPrefs = prefs.map(p => 
      p.widgetKey === widgetKey ? { ...p, isVisible: updatedVisible } : p
    );
    if (!prefs.some(p => p.widgetKey === widgetKey)) {
      newPrefs.push({ widgetKey, isVisible: true, displayOrder: prefs.length });
    }
    setPrefs(newPrefs);

    try {
      await api.put('/dashboard/prefs', { 
        prefs: [{ widgetKey, isVisible: existing ? updatedVisible : true, displayOrder: existing?.displayOrder ?? prefs.length }] 
      });
    } catch (err) {
      console.error(err);
      fetchDashboardData(); // rollback on error
    }
  };

  // Determine if a widget should render (authorized + enabled by user)
  const isWidgetActive = (key) => {
    const config = WIDGETS[key];
    if (!config || !config.roles.includes(user?.role)) return false;
    
    const pref = prefs.find(p => p.widgetKey === key);
    // If no user preference saved, default to visible
    return pref ? pref.isVisible : true;
  };

  // Get list of widgets for this role, sorted by user displayOrder preference
  const getSortedWidgetKeys = () => {
    const keys = Object.keys(WIDGETS).filter(key => WIDGETS[key].roles.includes(user?.role));
    
    return keys.sort((a, b) => {
      const prefA = prefs.find(p => p.widgetKey === a);
      const prefB = prefs.find(p => p.widgetKey === b);
      const orderA = prefA ? prefA.displayOrder : Object.keys(WIDGETS).indexOf(a);
      const orderB = prefB ? prefB.displayOrder : Object.keys(WIDGETS).indexOf(b);
      return orderA - orderB;
    });
  };

  const handleMoveWidget = async (widgetKey, direction) => {
    const sortedKeys = getSortedWidgetKeys();
    const index = sortedKeys.indexOf(widgetKey);
    if (index === -1) return;

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= sortedKeys.length) return;

    const swapKey = sortedKeys[nextIndex];

    // Swap ordering in state
    let updatedPrefs = [...prefs];
    
    // Ensure both keys have pref objects
    let prefA = updatedPrefs.find(p => p.widgetKey === widgetKey);
    if (!prefA) {
      prefA = { widgetKey, isVisible: true, displayOrder: index };
      updatedPrefs.push(prefA);
    }
    
    let prefB = updatedPrefs.find(p => p.widgetKey === swapKey);
    if (!prefB) {
      prefB = { widgetKey: swapKey, isVisible: true, displayOrder: nextIndex };
      updatedPrefs.push(prefB);
    }

    const tempOrder = prefA.displayOrder;
    prefA.displayOrder = prefB.displayOrder;
    prefB.displayOrder = tempOrder;

    setPrefs(updatedPrefs);

    try {
      await api.put('/dashboard/prefs', {
        prefs: [
          { widgetKey: prefA.widgetKey, isVisible: prefA.isVisible, displayOrder: prefA.displayOrder },
          { widgetKey: prefB.widgetKey, isVisible: prefB.isVisible, displayOrder: prefB.displayOrder }
        ]
      });
    } catch (err) {
      console.error('Failed to save reorder preference:', err);
      fetchDashboardData();
    }
  };

  if (loading) {
    return <div className="page-container"><p>Loading system overview...</p></div>;
  }

  const sortedWidgetKeys = getSortedWidgetKeys();

  return (
    <div className="page-container">
      {/* Dynamic Summary Cards row */}
      <div className="dashboard-grid">
        {user?.role !== 'NURSE' ? (
          <>
            <div className="metric-card neon-teal">
              <div className="metric-header">Total Stock Catalog</div>
              <div className="metric-value">{summary?.totalItems ?? 0}</div>
              <div className="metric-desc">Registered medical supplies</div>
            </div>
            
            <div className="metric-card neon-warning">
              <div className="metric-header">Warning Threshold Reached</div>
              <div className="metric-value">{summary?.lowStockCount ?? 0}</div>
              <div className="metric-desc">Items at reorder limit</div>
            </div>

            <div className="metric-card neon-critical">
              <div className="metric-header">Critical Level / Out of Stock</div>
              <div className="metric-value">{(summary?.criticalStockCount ?? 0) + (summary?.outOfStockCount ?? 0)}</div>
              <div className="metric-desc">Action required immediately</div>
            </div>

            <div className="metric-card neon-purple">
              <div className="metric-header">Expiring Soon</div>
              <div className="metric-value">{summary?.expiringCount ?? 0}</div>
              <div className="metric-desc">Medications within 90 days</div>
            </div>
          </>
        ) : (
          <div className="metric-card neon-teal" style={{ maxWidth: '360px' }}>
            <div className="metric-header">My Pending Requisitions</div>
            <div className="metric-value">{summary?.myPendingForms ?? 0}</div>
            <div className="metric-desc">Forms awaiting manager approval</div>
          </div>
        )}
      </div>

      {/* Quick Actions Panel */}
      {quickActions.length > 0 && (
        <div className="widget-card" style={{ padding: '24px', background: 'var(--card-bg)' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: 'var(--theme-text-bold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚡ Quick Action Shortcuts</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
            {quickActions.map(action => (
              <Link 
                key={action.path}
                to={action.path}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  padding: '20px 16px',
                  borderRadius: 'var(--border-radius-lg)',
                  background: 'var(--theme-bg)',
                  textDecoration: 'none',
                  border: '1px solid var(--theme-border)',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = action.color;
                  e.currentTarget.style.boxShadow = `0 12px 20px ${action.shadowColor}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--theme-border)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: action.bgColor,
                  color: action.color,
                  marginBottom: '12px',
                  transition: 'transform 0.25s ease'
                }}>
                  {action.icon}
                </div>
                <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--theme-text-bold)', textAlign: 'center' }}>
                  {action.label}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)', textAlign: 'center', marginTop: '6px', lineHeight: '1.4' }}>
                  {action.desc}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Customizable widgets preferences */}
      <div className="widget-customizer">
        <div className="widget-customizer-title">Customize Dashboard Layout Widgets</div>
        <div className="widget-customizer-list">
          {Object.entries(WIDGETS).map(([key, config]) => {
            if (!config.roles.includes(user?.role)) return null;
            const active = isWidgetActive(key);
            return (
              <button 
                key={key} 
                className={`widget-toggle ${active ? 'active' : ''}`}
                onClick={() => handleToggleWidget(key)}
              >
                {active ? '✓' : '+'} {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Widgets list container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {sortedWidgetKeys.map((key, idx) => {
          if (!isWidgetActive(key)) return null;

          const isFirst = idx === 0;
          const isLast = idx === sortedWidgetKeys.length - 1;

          // Header Reorder Controls
          const reorderControls = (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '12px' }}>
              <button 
                type="button"
                className="btn btn-secondary btn-sm" 
                onClick={() => handleMoveWidget(key, 'up')}
                disabled={isFirst}
                style={{ padding: '2px 6px', fontSize: '10px' }}
                title="Move Widget Up"
              >
                ▲
              </button>
              <button 
                type="button"
                className="btn btn-secondary btn-sm" 
                onClick={() => handleMoveWidget(key, 'down')}
                disabled={isLast}
                style={{ padding: '2px 6px', fontSize: '10px' }}
                title="Move Widget Down"
              >
                ▼
              </button>
            </div>
          );

          if (key === 'pending_reqs') {
            return (
              <div className="widget-card" key={key}>
                <div className="widget-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {reorderControls}
                    <span className="widget-title">Pending Clinical Requisitions Queue</span>
                  </div>
                  <Link to="/requisitions" className="btn btn-secondary btn-sm">View Full List</Link>
                </div>
                <div className="widget-body">
                  {alerts.stockAlerts.length > 0 && (
                    <div style={{ padding: '12px 16px', background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderRadius: 'var(--border-radius-md)', marginBottom: '16px', fontSize: '14px', fontWeight: '500' }}>
                      Attention: Requisitions may be blocked by low stock levels. See details below.
                    </div>
                  )}
                  <p style={{ color: 'var(--theme-text-muted)', fontSize: '14px' }}>
                    Go to the Requisitions page to review and sign off on nurse acquisition forms.
                  </p>
                </div>
              </div>
            );
          }

          if (key === 'stock_alerts') {
            return (
              <div className="widget-card" key={key}>
                <div className="widget-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {reorderControls}
                    <span className="widget-title">Low & Critical Stock Alerts</span>
                  </div>
                  <Link to="/items" className="btn btn-secondary btn-sm">Manage Items</Link>
                </div>
                <div className="widget-body" style={{ padding: 0 }}>
                  {alerts.stockAlerts.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Current Quantity</th>
                          <th>Threshold Limits</th>
                          <th>Status Alert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.stockAlerts.slice(0, 10).map(item => (
                          <tr key={item.id}>
                            <td><strong>{item.name}</strong></td>
                            <td><code>{item.sku}</code></td>
                            <td>{item.totalQty ?? item.quantityOnHand ?? 0} {item.unit}</td>
                            <td>Warning: {item.warningLevel} | Critical: {item.criticalLevel}</td>
                            <td>
                              <span className={`badge ${
                                item.alertLevel === 'OUT_OF_STOCK' || item.alertLevel === 'CRITICAL' 
                                  ? 'badge-critical' 
                                  : 'badge-warning'
                              }`}>
                                {item.alertLevel?.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ padding: '24px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                      All medical inventory quantities are currently within safe operating limits.
                    </p>
                  )}
                </div>
              </div>
            );
          }

          if (key === 'expiring_meds') {
            return (
              <div className="widget-card" key={key}>
                <div className="widget-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {reorderControls}
                    <span className="widget-title">Expiring Medications (Within 90 Days)</span>
                  </div>
                  <Link to="/items" className="btn btn-secondary btn-sm">Item Catalog</Link>
                </div>
                <div className="widget-body" style={{ padding: 0 }}>
                  {alerts.expiringBatches.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Medication Name</th>
                          <th>Batch Number</th>
                          <th>Expiry Date</th>
                          <th>Remaining Quantity</th>
                          <th>Days Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.expiringBatches.slice(0, 10).map(batch => {
                          const daysLeft = Math.ceil((new Date(batch.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                          return (
                            <tr key={batch.id}>
                              <td><strong>{batch.item.name}</strong></td>
                              <td><code>{batch.batchNo || 'N/A'}</code></td>
                              <td>{new Date(batch.expiryDate).toLocaleDateString()}</td>
                              <td>{batch.quantityRemaining} pcs</td>
                              <td>
                                <span className={`badge ${daysLeft <= 30 ? 'badge-critical' : 'badge-warning'}`}>
                                  {daysLeft} days remaining
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ padding: '24px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                      No medication batches are currently expiring within the next 90 days.
                    </p>
                  )}
                </div>
              </div>
            );
          }

          if (key === 'recent_transactions') {
            return (
              <div className="widget-card" key={key}>
                <div className="widget-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {reorderControls}
                    <span className="widget-title">Recent Inventory Logs (Audit Trail)</span>
                  </div>
                  <Link to="/stock/transactions" className="btn btn-secondary btn-sm">Full Audit Feed</Link>
                </div>
                <div className="widget-body" style={{ padding: 0 }}>
                  {summary?.recentTransactions?.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Action Type</th>
                          <th>Supply Item</th>
                          <th>Quantity Adjustment</th>
                          <th>Logged By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.recentTransactions.map(txn => (
                          <tr key={txn.id}>
                            <td>{new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>
                              <span className={`badge ${
                                txn.type === 'INBOUND' ? 'badge-success' : 
                                txn.type === 'OUTBOUND' ? 'badge-neutral' : 'badge-critical'
                              }`}>
                                {txn.type}
                              </span>
                            </td>
                            <td>{txn.item.name}</td>
                            <td>
                              <strong>{txn.type === 'INBOUND' ? '+' : '-'}{txn.qty}</strong> {txn.item.unit}
                            </td>
                            <td>{txn.user.name} ({txn.user.role.replace('_', ' ')})</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ padding: '24px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                      No transaction log activities have been recorded yet.
                    </p>
                  )}
                </div>
              </div>
            );
          }

          if (key === 'cashier_pending') {
            return (
              <div className="widget-card" key={key}>
                <div className="widget-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {reorderControls}
                    <span className="widget-title">Pending Billing Records Queue</span>
                  </div>
                  <Link to="/cashier" className="btn btn-secondary btn-sm">Open Cashier Log</Link>
                </div>
                <div className="widget-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      fontSize: '36px',
                      fontWeight: '800',
                      color: 'var(--color-warning)',
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(245,158,11,0.06)',
                      padding: '10px 20px',
                      borderRadius: 'var(--border-radius-lg)',
                      border: '1px solid rgba(245,158,11,0.15)'
                    }}>
                      {pendingDispenseCount}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>
                        Billing Logs Awaiting Action
                      </h4>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                        Nurses have dispensed items directly to patients. Record them on statement lists to update accounts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (key === 'nurse_my_forms') {
            return (
              <div className="widget-card" key={key}>
                <div className="widget-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {reorderControls}
                    <span className="widget-title">My Recent Requisitions History</span>
                  </div>
                  <Link to="/requisitions" className="btn btn-secondary btn-sm">Request New Item</Link>
                </div>
                <div className="widget-body">
                  <p style={{ color: 'var(--theme-text-muted)', fontSize: '14px' }}>
                    Access the Requisitions menu to view the approval status of your submitted acquisition forms.
                  </p>
                </div>
              </div>
            );
          }

          return null;
        })}

      </div>
    </div>
  );
};

export default Dashboard;
