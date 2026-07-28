import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import BackupManager from '../components/BackupManager';
import Sparkline from '../components/Sparkline';

const PRESETS = [
  { label: 'Today', getValue: () => {
    const d = new Date().toISOString().split('T')[0];
    return { from: d, to: d };
  }},
  { label: 'Last 7 Days', getValue: () => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { from, to };
  }},
  { label: 'Last 30 Days', getValue: () => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { from, to };
  }},
  { label: 'This Month', getValue: () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return { from, to };
  }},
  { label: 'This Year', getValue: () => {
    const now = new Date();
    const from = `${now.getFullYear()}-01-01`;
    const to = `${now.getFullYear()}-12-31`;
    return { from, to };
  }},
];

const SECTIONS_CONFIG = [
  { 
    key: 'inventory', 
    title: 'Stock Inventory Summary', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
    ), 
    color: 'var(--theme-primary, #0d9488)', 
    accentBg: 'rgba(13, 148, 136, 0.1)',
    desc: 'Current catalog snapshot across E-Cart & Central storage' 
  },
  { 
    key: 'low-stock', 
    title: 'Low & Critical Stock Alerts', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    ), 
    color: '#ef4444', 
    accentBg: 'rgba(239, 68, 68, 0.1)',
    desc: 'Items reaching or below warning and critical limits' 
  },
  { 
    key: 'expiring', 
    title: 'Expiring Medication Batches', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    ), 
    color: '#f59e0b', 
    accentBg: 'rgba(245, 158, 11, 0.1)',
    desc: 'Batches expiring within 90 days or already expired' 
  },
  { 
    key: 'inbound', 
    title: 'Inbound Deliveries & Received Stock', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13"></rect>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
        <circle cx="5.5" cy="18.5" r="2.5"></circle>
        <circle cx="18.5" cy="18.5" r="2.5"></circle>
      </svg>
    ), 
    color: '#10b981', 
    accentBg: 'rgba(16, 185, 129, 0.1)',
    desc: 'Registered supplier shipments and inbound stock logs' 
  },
  { 
    key: 'outbound', 
    title: 'Clinical Dispensing & Outbound Log', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
      </svg>
    ), 
    color: '#3b82f6', 
    accentBg: 'rgba(59, 130, 246, 0.1)',
    desc: 'Medication dispensing and outbound transaction logs' 
  },
  { 
    key: 'discards', 
    title: 'Waste & Discard Log', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    ), 
    color: '#ec4899', 
    accentBg: 'rgba(236, 72, 153, 0.1)',
    desc: 'Expired, damaged, or recalled items discarded' 
  },
  { 
    key: 'adjustments', 
    title: 'Stocktake Adjustments', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
      </svg>
    ), 
    color: '#8b5cf6', 
    accentBg: 'rgba(139, 92, 246, 0.1)',
    desc: 'Physical stock count reconciliation variances' 
  },
  { 
    key: 'requisitions', 
    title: 'Requisition Activity', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
    ), 
    color: '#6366f1', 
    accentBg: 'rgba(99, 102, 241, 0.1)',
    desc: 'Clinic requisition submissions and sign-off status' 
  },
  { 
    key: 'returns', 
    title: 'Item Returns Log', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 14 4 9 9 4"></polyline>
        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
      </svg>
    ), 
    color: '#14b8a6', 
    accentBg: 'rgba(20, 184, 166, 0.1)',
    desc: 'Unused supplies returned back to active inventory' 
  },
  { 
    key: 'transfers', 
    title: 'Stock Transfers', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9"></polyline>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
        <polyline points="7 23 3 19 7 15"></polyline>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
      </svg>
    ), 
    color: '#06b6d4', 
    accentBg: 'rgba(6, 182, 212, 0.1)',
    desc: 'Inter-location movements between E-Cart and Central' 
  },
  { 
    key: 'dispense', 
    title: 'Direct Dispense & Cashier Billing', 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path>
        <path d="m8.5 8.5 7 7"></path>
      </svg>
    ), 
    color: '#84cc16', 
    accentBg: 'rgba(132, 204, 22, 0.1)',
    desc: 'Nurse direct dispensing and cashier billing status' 
  },
];

const Reports = () => {
  const { user } = useAuth();
  const toast = useToast();
  const isTopAdmin = user?.role === 'TOP_ADMIN';

  // Date range state
  const defaultMonth = PRESETS[3].getValue();
  const [dateRange, setDateRange] = useState(defaultMonth);
  const [activePreset, setActivePreset] = useState('This Month');
  const [customFrom, setCustomFrom] = useState(defaultMonth.from);
  const [customTo, setCustomTo] = useState(defaultMonth.to);

  // Live Summary state
  const [summaryData, setSummaryData] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  // Active section drill-down state
  const [activeSection, setActiveSection] = useState(null);
  const [sectionData, setSectionData] = useState(null);
  const [loadingSection, setLoadingSection] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Fetch live summary dashboard data
  const fetchSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      setSummaryError('');
      const res = await api.get(`/reports/live/summary?from=${dateRange.from}&to=${dateRange.to}`);
      setSummaryData(res.data);
    } catch (err) {
      console.error('Failed to fetch report summary:', err);
      setSummaryError('Failed to load real-time analytics summary.');
      toast.error('Failed to fetch live report data.');
    } finally {
      setLoadingSummary(false);
    }
  }, [dateRange, toast]);

  // Fetch detailed records for active section drill-down
  const fetchSectionDetail = useCallback(async () => {
    if (!activeSection) return;
    try {
      setLoadingSection(true);
      const res = await api.get(
        `/reports/live/${activeSection.key}?from=${dateRange.from}&to=${dateRange.to}&page=${page}&limit=25&search=${encodeURIComponent(searchQuery)}`
      );
      setSectionData(res.data);
    } catch (err) {
      console.error('Failed to fetch section detail:', err);
      toast.error(`Failed to load ${activeSection.title} records.`);
    } finally {
      setLoadingSection(false);
    }
  }, [activeSection, dateRange, page, searchQuery, toast]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeSection) {
      fetchSectionDetail();
    }
  }, [fetchSectionDetail, activeSection]);

  const handleApplyPreset = (preset) => {
    setActivePreset(preset.label);
    const val = preset.getValue();
    setCustomFrom(val.from);
    setCustomTo(val.to);
    setDateRange(val);
    setPage(1);
  };

  const handleCustomDateSubmit = (e) => {
    e.preventDefault();
    if (!customFrom || !customTo) return;
    if (new Date(customFrom) > new Date(customTo)) {
      toast.error('"From" date cannot be later than "To" date.');
      return;
    }
    setActivePreset('Custom');
    setDateRange({ from: customFrom, to: customTo });
    setPage(1);
  };

  const handleExportCSV = async () => {
    if (!activeSection) return;
    try {
      const response = await api.get(
        `/reports/live/${activeSection.key}/export?from=${dateRange.from}&to=${dateRange.to}`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MedOPS_${activeSection.key}_${dateRange.from}_to_${dateRange.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Exported ${activeSection.title} CSV successfully!`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to download CSV export.');
    }
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  const formattedRangeStr = `${new Date(dateRange.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(dateRange.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const sections = summaryData?.sections || {};

  return (
    <div className="page-container">
      {/* Header bar */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0 }}>Reports & Live Analytics</h2>
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', boxShadow: '0 0 8px var(--color-success)' }}></span>
              Real-Time Feed
            </span>
          </div>
          <p className="page-title-desc">
            Live metric tracking, departmental breakdown, and transaction audit trails across MedOPS modules.
          </p>
        </div>

        <button className="btn btn-secondary" onClick={fetchSummary} disabled={loadingSummary} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {loadingSummary ? '⏳ Refreshing...' : '↻ Sync Data'}
        </button>
      </div>

      {/* Top Highlight KPI Bar (Dashboard View Only) */}
      {!activeSection && (
        <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card neon-teal">
            <div className="metric-header">
              <span>Total Active QoH</span>
              <span style={{ fontSize: '18px' }}>📦</span>
            </div>
            <div className="metric-value">{(sections.inventory?.totalQoH ?? 0).toLocaleString()}</div>
            <div className="metric-desc">Catalog items: {sections.inventory?.totalItems ?? 0}</div>
          </div>

          <div className="metric-card neon-warning">
            <div className="metric-header">
              <span>Low & Critical Stock</span>
              <span style={{ fontSize: '18px' }}>⚠️</span>
            </div>
            <div className="metric-value">{sections['low-stock']?.totalLowStock ?? 0}</div>
            <div className="metric-desc">Critical: {sections['low-stock']?.criticalCount ?? 0} | Out: {sections['low-stock']?.outOfStockCount ?? 0}</div>
          </div>

          <div className="metric-card neon-critical">
            <div className="metric-header">
              <span>Expiring Batches</span>
              <span style={{ fontSize: '18px' }}>⏳</span>
            </div>
            <div className="metric-value">{sections.expiring?.totalExpiring ?? 0}</div>
            <div className="metric-desc">Expired: {sections.expiring?.expired ?? 0} | ≤30d: {sections.expiring?.within30 ?? 0}</div>
          </div>

          <div className="metric-card neon-purple">
            <div className="metric-header">
              <span>Requisitions Queue</span>
              <span style={{ fontSize: '18px' }}>📋</span>
            </div>
            <div className="metric-value">{sections.requisitions?.count ?? 0}</div>
            <div className="metric-desc">Approved: {sections.requisitions?.status?.APPROVED ?? 0} | Pending: {sections.requisitions?.status?.PENDING ?? 0}</div>
          </div>
        </div>
      )}

      {/* Timeframe Filter Bar */}
      <div className="filter-bar" style={{ marginBottom: '24px', padding: '14px 20px', borderRadius: 'var(--border-radius-lg)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        
        {/* Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--theme-text-muted)', marginRight: '4px' }}>Range:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`btn btn-sm ${activePreset === p.label ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleApplyPreset(p)}
              style={{ borderRadius: '20px', fontSize: '12px', padding: '4px 14px' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Date Inputs */}
        <form onSubmit={handleCustomDateSubmit} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>From:</label>
            <input
              type="date"
              className="form-control"
              style={{ padding: '4px 8px', fontSize: '12px', width: '135px' }}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>To:</label>
            <input
              type="date"
              className="form-control"
              style={{ padding: '4px 8px', fontSize: '12px', width: '135px' }}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm" style={{ padding: '5px 12px' }}>
            Apply
          </button>
        </form>
      </div>

      {summaryError && <div className="login-error" style={{ marginBottom: '20px' }}>{summaryError}</div>}

      {/* DASHBOARD GRID vs DRILL-DOWN VIEW */}
      {!activeSection ? (
        <div>
          {loadingSummary ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🩺</div>
              <p style={{ fontWeight: '500' }}>Compiling live data across 11 clinical sections...</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
              {SECTIONS_CONFIG.map((cfg) => {
                const s = sections[cfg.key] || {};
                
                let primaryVal = 0;
                let primaryLabel = 'Total Logs';
                let secondaryInfo = null;

                if (cfg.key === 'inventory') {
                  primaryVal = s.totalQoH ?? 0;
                  primaryLabel = 'Total Quantity on Hand';
                  secondaryInfo = `Catalog: ${s.totalItems ?? 0} | ECART: ${s.ecartQoH ?? 0} | CENTRAL: ${s.centralQoH ?? 0}`;
                } else if (cfg.key === 'low-stock') {
                  primaryVal = s.totalLowStock ?? 0;
                  primaryLabel = 'Items At or Below Warning Level';
                  secondaryInfo = `Critical: ${s.criticalCount ?? 0} | Warning: ${s.warningCount ?? 0} | Out: ${s.outOfStockCount ?? 0}`;
                } else if (cfg.key === 'expiring') {
                  primaryVal = s.totalExpiring ?? 0;
                  primaryLabel = 'Batches Expiring (≤90 Days)';
                  secondaryInfo = `Expired: ${s.expired ?? 0} | ≤30d: ${s.within30 ?? 0} | ≤60d: ${s.within60 ?? 0}`;
                } else if (cfg.key === 'inbound') {
                  primaryVal = s.totalQty ?? 0;
                  primaryLabel = 'Total Units Received';
                  secondaryInfo = `Shipment Logs: ${s.count ?? 0}`;
                } else if (cfg.key === 'outbound') {
                  primaryVal = s.totalQty ?? 0;
                  primaryLabel = 'Total Units Dispensed / Outbound';
                  secondaryInfo = `Transaction Logs: ${s.count ?? 0}`;
                } else if (cfg.key === 'discards') {
                  primaryVal = s.totalQty ?? 0;
                  primaryLabel = 'Total Units Discarded';
                  secondaryInfo = `Expired: ${s.reasons?.EXPIRED ?? 0} | Damaged: ${s.reasons?.DAMAGED ?? 0} | Recalled: ${s.reasons?.RECALLED ?? 0}`;
                } else if (cfg.key === 'adjustments') {
                  primaryVal = s.netQty ?? 0;
                  primaryLabel = 'Net Quantity Variance';
                  secondaryInfo = `Reconciliation Logs: ${s.count ?? 0}`;
                } else if (cfg.key === 'requisitions') {
                  primaryVal = s.count ?? 0;
                  primaryLabel = 'Requisition Forms Submitted';
                  secondaryInfo = `Approved: ${s.status?.APPROVED ?? 0} | Pending: ${s.status?.PENDING ?? 0} | Rejected: ${s.status?.REJECTED ?? 0}`;
                } else if (cfg.key === 'returns') {
                  primaryVal = s.totalQty ?? 0;
                  primaryLabel = 'Total Units Returned to Stock';
                  secondaryInfo = `Return Logs: ${s.count ?? 0}`;
                } else if (cfg.key === 'transfers') {
                  primaryVal = s.count ?? 0;
                  primaryLabel = 'Stock Transfer Requests';
                  secondaryInfo = `Approved: ${s.status?.APPROVED ?? 0} | Pending: ${s.status?.PENDING ?? 0}`;
                } else if (cfg.key === 'dispense') {
                  primaryVal = s.totalQty ?? 0;
                  primaryLabel = 'Units Dispensed to Patients';
                  secondaryInfo = `Direct Dispenses: ${s.count ?? 0} | Pending Billing: ${s.pendingBillingCount ?? 0}`;
                }

                return (
                  <div
                    key={cfg.key}
                    className="widget-card"
                    style={{
                      cursor: 'pointer',
                      transition: 'transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '20px',
                      position: 'relative',
                    }}
                    onClick={() => {
                      setActiveSection(cfg);
                      setPage(1);
                      setSearchQuery('');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                      e.currentTarget.style.borderColor = cfg.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                      e.currentTarget.style.borderColor = 'var(--theme-card-border)';
                    }}
                  >
                    <div>
                      {/* Top bar with styled icon & action link */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: 'var(--border-radius-md)',
                            background: cfg.accentBg,
                            color: cfg.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {cfg.icon}
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>{cfg.title}</h4>
                            <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>{cfg.desc}</span>
                          </div>
                        </div>
                      </div>

                      {/* Primary Value */}
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--theme-text-bold)', lineHeight: '1' }}>
                          {primaryVal.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '4px', fontWeight: '500' }}>
                          {primaryLabel}
                        </div>
                      </div>

                      {/* Secondary Info Pill */}
                      <div style={{
                        fontSize: '12px',
                        color: 'var(--theme-text)',
                        background: 'var(--theme-bg)',
                        border: '1px solid var(--theme-border)',
                        padding: '8px 12px',
                        borderRadius: 'var(--border-radius-sm)',
                        marginBottom: '16px',
                        fontWeight: '500',
                      }}>
                        {secondaryInfo}
                      </div>
                    </div>

                    {/* Sparkline & View Drill-down Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--theme-border)' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: cfg.color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        Explore Section →
                      </span>
                      <Sparkline
                        data={s.sparkline || []}
                        width={130}
                        height={28}
                        color={cfg.color}
                        type={cfg.key === 'inventory' || cfg.key === 'low-stock' || cfg.key === 'expiring' ? 'bar' : 'line'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* DRILL-DOWN SUB-VIEW FOR SELECTED SECTION */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Header Bar */}
          <div className="widget-card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveSection(null)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  ← Back to Dashboard
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: 'var(--border-radius-md)',
                    background: activeSection.accentBg,
                    color: activeSection.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {activeSection.icon}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>{activeSection.title}</h3>
                    <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{activeSection.desc}</span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleTriggerPrint}>
                  🖨️ Print View
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleExportCSV}>
                  📥 Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Data Table Widget */}
          <div className="widget-card">
            <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="widget-title">Detailed Record Audit ({sectionData?.pagination?.total || 0})</span>
                <span className="badge badge-neutral">{formattedRangeStr}</span>
              </div>
              
              {/* Search input for inventory section */}
              {activeSection.key === 'inventory' && (
                <input
                  type="text"
                  placeholder="Search item name or SKU..."
                  className="form-control"
                  style={{ width: '240px', padding: '5px 12px', fontSize: '13px' }}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                />
              )}
            </div>

            <div className="widget-body" style={{ padding: 0 }}>
              {loadingSection ? (
                <p style={{ padding: '40px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                  Loading {activeSection.title} records...
                </p>
              ) : !sectionData?.data || sectionData.data.length === 0 ? (
                <div style={{ padding: '50px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
                  <div style={{ fontSize: '36px', marginBottom: '10px' }}>📭</div>
                  <p style={{ margin: 0, fontWeight: '500', fontSize: '14px' }}>No records found for the selected time period.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      {activeSection.key === 'inventory' && (
                        <tr>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Classification</th>
                          <th>Category</th>
                          <th>E-Cart Qty</th>
                          <th>Central Qty</th>
                          <th style={{ textAlign: 'right' }}>Total Quantity</th>
                        </tr>
                      )}
                      {activeSection.key === 'low-stock' && (
                        <tr>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Category</th>
                          <th style={{ textAlign: 'right' }}>Total Qty</th>
                          <th style={{ textAlign: 'right' }}>Warning Level</th>
                          <th style={{ textAlign: 'right' }}>Critical Level</th>
                          <th style={{ textAlign: 'center' }}>Alert Status</th>
                        </tr>
                      )}
                      {activeSection.key === 'expiring' && (
                        <tr>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Batch Number</th>
                          <th>Storage Location</th>
                          <th>Expiry Date</th>
                          <th style={{ textAlign: 'right' }}>Remaining Qty</th>
                        </tr>
                      )}
                      {activeSection.key === 'inbound' && (
                        <tr>
                          <th>Timestamp</th>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Batch No</th>
                          <th>Location</th>
                          <th style={{ textAlign: 'right' }}>Qty Received</th>
                          <th>Logged By</th>
                        </tr>
                      )}
                      {activeSection.key === 'outbound' && (
                        <tr>
                          <th>Timestamp</th>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Type</th>
                          <th>Location</th>
                          <th style={{ textAlign: 'right' }}>Qty Dispensed</th>
                          <th>Logged By</th>
                        </tr>
                      )}
                      {activeSection.key === 'discards' && (
                        <tr>
                          <th>Timestamp</th>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Reason</th>
                          <th>Location</th>
                          <th style={{ textAlign: 'right' }}>Qty Discarded</th>
                          <th>Logged By</th>
                        </tr>
                      )}
                      {activeSection.key === 'adjustments' && (
                        <tr>
                          <th>Timestamp</th>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Location</th>
                          <th style={{ textAlign: 'right' }}>Quantity Variance</th>
                          <th>Notes</th>
                          <th>Logged By</th>
                        </tr>
                      )}
                      {activeSection.key === 'requisitions' && (
                        <tr>
                          <th>Submitted At</th>
                          <th>Patient Name</th>
                          <th>Chart #</th>
                          <th>Submitted By</th>
                          <th>Status</th>
                          <th>Requested Items</th>
                        </tr>
                      )}
                      {activeSection.key === 'returns' && (
                        <tr>
                          <th>Timestamp</th>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Location</th>
                          <th style={{ textAlign: 'right' }}>Qty Returned</th>
                          <th>Notes</th>
                          <th>Logged By</th>
                        </tr>
                      )}
                      {activeSection.key === 'transfers' && (
                        <tr>
                          <th>Requested At</th>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Transfer Route</th>
                          <th style={{ textAlign: 'right' }}>Qty</th>
                          <th>Status</th>
                          <th>Requested By</th>
                        </tr>
                      )}
                      {activeSection.key === 'dispense' && (
                        <tr>
                          <th>Dispensed At</th>
                          <th>Patient Name</th>
                          <th>Item Name</th>
                          <th style={{ textAlign: 'right' }}>Qty</th>
                          <th>Dispensed By (Nurse)</th>
                          <th>Billing Status</th>
                          <th>Cashier Recorded By</th>
                        </tr>
                      )}
                    </thead>

                    <tbody>
                      {sectionData.data.map((row) => (
                        <tr key={row.id}>
                          {activeSection.key === 'inventory' && (
                            <>
                              <td><strong>{row.name}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td>{row.itemType}</td>
                              <td>{row.category}</td>
                              <td>{row.ecartQty} {row.unit}</td>
                              <td>{row.centralQty} {row.unit}</td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>{row.totalQty} {row.unit}</td>
                            </>
                          )}
                          {activeSection.key === 'low-stock' && (
                            <>
                              <td><strong>{row.name}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td>{row.category}</td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>{row.totalQty} {row.unit}</td>
                              <td style={{ textAlign: 'right' }}>{row.warningLevel}</td>
                              <td style={{ textAlign: 'right' }}>{row.criticalLevel}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`badge ${row.alertType === 'CRITICAL' || row.alertType === 'OUT_OF_STOCK' ? 'badge-critical' : 'badge-warning'}`}>
                                  {row.alertType}
                                </span>
                              </td>
                            </>
                          )}
                          {activeSection.key === 'expiring' && (
                            <>
                              <td><strong>{row.itemName}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td><code>{row.batchNo}</code></td>
                              <td>{row.location}</td>
                              <td style={{ fontWeight: '500', color: new Date(row.expiryDate) <= new Date() ? 'var(--color-critical)' : 'inherit' }}>
                                {new Date(row.expiryDate).toLocaleDateString()}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>{row.quantityRemaining} {row.unit}</td>
                            </>
                          )}
                          {activeSection.key === 'inbound' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.timestamp).toLocaleString()}</td>
                              <td><strong>{row.itemName}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td><code>{row.batchNo}</code></td>
                              <td>{row.location}</td>
                              <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: '700' }}>+{row.qty} {row.unit}</td>
                              <td>{row.loggedBy}</td>
                            </>
                          )}
                          {activeSection.key === 'outbound' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.timestamp).toLocaleString()}</td>
                              <td><strong>{row.itemName}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td><span className="badge badge-neutral">{row.type}</span></td>
                              <td>{row.location}</td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>-{row.qty} {row.unit}</td>
                              <td>{row.loggedBy}</td>
                            </>
                          )}
                          {activeSection.key === 'discards' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.timestamp).toLocaleString()}</td>
                              <td><strong>{row.itemName}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td><span className="badge badge-critical">{row.reason}</span></td>
                              <td>{row.location}</td>
                              <td style={{ textAlign: 'right', color: 'var(--color-critical)', fontWeight: '700' }}>-{row.qty} {row.unit}</td>
                              <td>{row.loggedBy}</td>
                            </>
                          )}
                          {activeSection.key === 'adjustments' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.timestamp).toLocaleString()}</td>
                              <td><strong>{row.itemName}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td>{row.location}</td>
                              <td style={{ textAlign: 'right', fontWeight: '700', color: row.qty > 0 ? 'var(--color-success)' : 'var(--color-critical)' }}>
                                {row.qty > 0 ? `+${row.qty}` : row.qty} {row.unit}
                              </td>
                              <td>{row.notes}</td>
                              <td>{row.loggedBy}</td>
                            </>
                          )}
                          {activeSection.key === 'requisitions' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.createdAt).toLocaleString()}</td>
                              <td><strong>{row.patientName}</strong></td>
                              <td><code>{row.chartNumber}</code></td>
                              <td>{row.submittedBy}</td>
                              <td>
                                <span className={`badge ${row.status.includes('APPROVED') ? 'badge-success' : row.status === 'REJECTED' ? 'badge-critical' : 'badge-warning'}`}>
                                  {row.status}
                                </span>
                              </td>
                              <td style={{ fontSize: '12px' }}>{row.itemSummary}</td>
                            </>
                          )}
                          {activeSection.key === 'returns' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.timestamp).toLocaleString()}</td>
                              <td><strong>{row.itemName}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td>{row.location}</td>
                              <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: '700' }}>+{row.qty} {row.unit}</td>
                              <td>{row.notes}</td>
                              <td>{row.loggedBy}</td>
                            </>
                          )}
                          {activeSection.key === 'transfers' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.createdAt).toLocaleString()}</td>
                              <td><strong>{row.itemName}</strong></td>
                              <td><code>{row.sku}</code></td>
                              <td><span className="badge badge-neutral">{row.route}</span></td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>{row.qty} {row.unit}</td>
                              <td>
                                <span className={`badge ${row.status === 'APPROVED' ? 'badge-success' : row.status === 'REJECTED' ? 'badge-critical' : 'badge-warning'}`}>
                                  {row.status}
                                </span>
                              </td>
                              <td>{row.requestedBy}</td>
                            </>
                          )}
                          {activeSection.key === 'dispense' && (
                            <>
                              <td style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>{new Date(row.dispensedAt).toLocaleString()}</td>
                              <td><strong>{row.patientName}</strong> (<code>{row.chartNumber}</code>)</td>
                              <td>{row.itemName}</td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>{row.qty} {row.unit}</td>
                              <td>{row.dispensedBy}</td>
                              <td>
                                <span className={`badge ${row.billingStatus === 'RECORDED' ? 'badge-success' : 'badge-warning'}`}>
                                  {row.billingStatus}
                                </span>
                              </td>
                              <td>{row.recordedBy}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination controls */}
              {sectionData?.pagination && sectionData.pagination.totalPages > 1 && (
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--theme-border)', background: 'rgba(0,0,0,0.01)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                    Page {sectionData.pagination.page} of {sectionData.pagination.totalPages} ({sectionData.pagination.total} records total)
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    >
                      ← Previous
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={page >= sectionData.pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Area when print is triggered */}
      {activeSection && sectionData?.data && (
        <div id="printable-report-area">
          <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #cbd5e1', paddingBottom: '12px' }}>
            <h2 style={{ margin: '0 0 4px 0', color: '#0d9488' }}>HEALING HANDS CENTER — {activeSection.title.toUpperCase()}</h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Period: {formattedRangeStr}</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '6px', textAlign: 'left' }}>Item / Record</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Detail</th>
                <th style={{ padding: '6px', textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>User / Logged By</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Date / Time</th>
              </tr>
            </thead>
            <tbody>
              {sectionData.data.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px' }}>{row.name || row.itemName || row.patientName || row.id}</td>
                  <td style={{ padding: '6px' }}>{row.sku || row.reason || row.route || row.status || '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>{row.totalQty || row.qty || row.quantityRemaining || '—'}</td>
                  <td style={{ padding: '6px' }}>{row.loggedBy || row.submittedBy || row.dispensedBy || row.requestedBy || '—'}</td>
                  <td style={{ padding: '6px' }}>{new Date(row.timestamp || row.createdAt || row.dispensedAt || Date.now()).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Database Backup & Rollback Manager (Top Admin Only) */}
      {isTopAdmin && <BackupManager />}
    </div>
  );
};

export default Reports;
