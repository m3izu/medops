import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Dashboard = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState({ stockAlerts: [], expiringBatches: [] });
  const [prefs, setPrefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Widget metadata
  const WIDGETS = {
    pending_reqs: { label: 'Pending Requisitions', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER'] },
    stock_alerts: { label: 'Low & Critical Stock', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER', 'SUPPLY_OFFICER', 'MANAGEMENT_OFFICE'] },
    expiring_meds: { label: 'Expiring Medications (90d)', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER', 'VIEWER_AUDITOR', 'MANAGEMENT_OFFICE'] },
    recent_transactions: { label: 'Recent Transactions', roles: ['TOP_ADMIN', 'INVENTORY_MANAGER', 'SUPPLY_OFFICER', 'VIEWER_AUDITOR', 'MANAGEMENT_OFFICE'] },
    nurse_my_forms: { label: 'My Requisitions History', roles: ['NURSE'] },
  };

  const fetchDashboardData = async () => {
    try {
      const [summaryRes, alertsRes, prefsRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/stock/alerts'),
        api.get('/dashboard/prefs')
      ]);
      setSummary(summaryRes.data);
      setAlerts(alertsRes.data);
      setPrefs(prefsRes.data);
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

  if (loading) {
    return <div className="page-container"><p>Loading system overview...</p></div>;
  }

  return (
    <div className="page-container">
      {/* Dynamic Summary Cards row */}
      <div className="dashboard-grid">
        {user?.role !== 'NURSE' ? (
          <>
            <div className="metric-card" style={{ borderLeft: '4px solid var(--theme-primary)' }}>
              <div className="metric-header">Total Stock Catalog</div>
              <div className="metric-value">{summary?.totalItems ?? 0}</div>
              <div className="metric-desc">Registered medical supplies</div>
            </div>
            
            <div className="metric-card" style={{ borderLeft: '4px solid var(--color-warning)' }}>
              <div className="metric-header">Warning Threshold Reached</div>
              <div className="metric-value">{summary?.lowStockCount ?? 0}</div>
              <div className="metric-desc">Items at reorder limit</div>
            </div>

            <div className="metric-card" style={{ borderLeft: '4px solid var(--color-critical)' }}>
              <div className="metric-header">Critical Level / Out of Stock</div>
              <div className="metric-value">{(summary?.criticalStockCount ?? 0) + (summary?.outOfStockCount ?? 0)}</div>
              <div className="metric-desc">Action required immediately</div>
            </div>

            <div className="metric-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <div className="metric-header">Expiring Soon</div>
              <div className="metric-value">{summary?.expiringCount ?? 0}</div>
              <div className="metric-desc">Medications within 90 days</div>
            </div>
          </>
        ) : (
          <div className="metric-card" style={{ borderLeft: '4px solid var(--theme-primary)', maxWidth: '360px' }}>
            <div className="metric-header">My Pending Requisitions</div>
            <div className="metric-value">{summary?.myPendingForms ?? 0}</div>
            <div className="metric-desc">Forms awaiting manager approval</div>
          </div>
        )}
      </div>

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
        
        {/* Widget: Pending Requisitions Queue */}
        {isWidgetActive('pending_reqs') && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">Pending Clinical Requisitions Queue</span>
              <Link to="/requisitions" className="btn btn-secondary btn-sm">View Full List</Link>
            </div>
            <div className="widget-body">
              {alerts.stockAlerts.length > 0 && (
                <div style={{ padding: '12px 16px', background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderRadius: 'var(--border-radius-md)', marginBottom: '16px', fontSize: '14px', fontWeight: '500' }}>
                  ⚠️ Critical Alert: Requisitions may be blocked by low stock levels. See details below.
                </div>
              )}
              <p style={{ color: 'var(--theme-text-muted)', fontSize: '14px' }}>
                Go to the Requisitions page to review and sign off on nurse acquisition forms.
              </p>
            </div>
          </div>
        )}

        {/* Widget: Low / Critical Stock Alerts */}
        {isWidgetActive('stock_alerts') && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">🚨 Low & Critical Stock Alerts</span>
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
                        <td>{item.stockLevel?.quantityOnHand ?? 0} {item.unit}</td>
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
        )}

        {/* Widget: Expiring Medications */}
        {isWidgetActive('expiring_meds') && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">💊 Expiring Medications (Within 90 Days)</span>
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
        )}

        {/* Widget: Recent Audit / Transaction Feed */}
        {isWidgetActive('recent_transactions') && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">📜 Recent Inventory Logs (Audit Trail)</span>
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
        )}

        {/* Widget: Nurse My Forms History */}
        {isWidgetActive('nurse_my_forms') && (
          <div className="widget-card">
            <div className="widget-header">
              <span className="widget-title">My Recent Requisitions History</span>
              <Link to="/requisitions" className="btn btn-secondary btn-sm">Request New Item</Link>
            </div>
            <div className="widget-body">
              <p style={{ color: 'var(--theme-text-muted)', fontSize: '14px' }}>
                Access the Requisitions menu to view the approval status of your submitted acquisition forms.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
