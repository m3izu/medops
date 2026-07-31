import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';

const BILLING_STATUS_BADGE = {
  PENDING: { label: 'Pending Billing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  RECORDED: { label: 'Recorded', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

/**
 * Custom Searchable Combobox for quick item search
 */
const SearchableItemSelect = ({ items, value, onChange, placeholder = "Type item name or SKU..." }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, openUpward: false });
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const itemRefs = useRef([]);

  const selectedItem = items.find(i => i.id === value);

  // Synchronize search text with selected item name
  useEffect(() => {
    if (selectedItem) {
      setQuery(selectedItem.name);
    } else if (!isOpen) {
      setQuery('');
    }
  }, [selectedItem, isOpen]);

  // Recalculate dropdown position whenever isOpen is true, or on scroll/resize
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 260; // Max height of item dropdown
      const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setDropdownPos({
        top: openUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        openUpward,
      });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isInsideContainer = containerRef.current && containerRef.current.contains(e.target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!isInsideContainer && !isInsideDropdown) {
        setIsOpen(false);
        if (selectedItem) {
          setQuery(selectedItem.name);
        } else {
          setQuery('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedItem]);

  const filteredItems = items.filter(item => {
    if (!query || selectedItem?.name === query) return true;
    const search = query.toLowerCase();
    const nameMatch = item.name?.toLowerCase().includes(search);
    const skuMatch = item.sku?.toLowerCase().includes(search);
    return nameMatch || skuMatch;
  });

  // Reset highlightedIndex when search term or isOpen changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  // Scroll active item into view when highlightedIndex changes
  useEffect(() => {
    if (isOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (item) => {
    onChange(item ? item.id : '');
    setQuery(item ? item.name : '');
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems.length > 0 && highlightedIndex < filteredItems.length) {
        handleSelect(filteredItems[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      if (selectedItem) setQuery(selectedItem.name);
    }
  };

  return (
    <div className="searchable-select-container" ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (value) onChange(''); // Clear selection if typing
          }}
          onKeyDown={handleKeyDown}
          style={{ paddingRight: value ? '32px' : '12px' }}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setQuery('');
              setIsOpen(true);
            }}
            title="Clear item selection"
            style={{
              position: 'absolute',
              right: '8px',
              background: 'none',
              border: 'none',
              color: 'var(--theme-text-muted)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '2px 4px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown Options */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            background: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: 'var(--border-radius-md)',
            boxShadow: 'var(--shadow-lg), 0 10px 25px -5px rgba(0,0,0,0.3)',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 99999,
          }}
        >
          {filteredItems.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
              No matching items found
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const ecart = item.ecartQty ?? (item.stockLevels || []).find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
              const central = item.centralQty ?? (item.stockLevels || []).find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
              const stock = ecart + central;
              const isSelected = item.id === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={item.id}
                  ref={(el) => (itemRefs.current[index] = el)}
                  onClick={() => handleSelect(item)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: isHighlighted || isSelected ? 'var(--theme-primary-bg)' : 'transparent',
                    borderLeft: isHighlighted ? '3px solid var(--theme-primary)' : '3px solid transparent',
                    borderBottom: '1px solid var(--theme-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--theme-text-bold)' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                      SKU: {item.sku || 'N/A'}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: ecart > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: ecart > 0 ? '#10b981' : '#ef4444',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    eCart Stock: {ecart} {item.unit}
                  </span>
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

const Dispense = () => {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const initialPatientId = searchParams.get('patientId') || '';

  // Form state
  const [patients, setPatients] = useState([]);
  const [dispensableItems, setDispensableItems] = useState([]);
  const [patientId, setPatientId] = useState(initialPatientId);
  const [dispensedAt, setDispensedAt] = useState(new Date().toISOString().substring(0, 10));

  // Multi-item rows state
  const [lines, setLines] = useState([
    { id: 1, itemId: '', location: 'ECART', qty: 1, notes: '' },
  ]);

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchPatients = async () => {
    try {
      const res = await api.get('/patients');
      setPatients((res.data || []).filter(p => p.status === 'ACTIVE'));
    } catch (err) {
      console.error('Failed to load patients', err);
    }
  };

  const fetchDispensableItems = async () => {
    try {
      const res = await api.get('/items');
      const dispensable = (res.data || []).filter(
        item => item.dispenseMode === 'DIRECT_DISPENSE' || item.dispenseMode === 'FLEXIBLE'
      );
      setDispensableItems(dispensable);
    } catch (err) {
      console.error('Failed to load items', err);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/dispense');
      setHistory(res.data || []);
    } catch (err) {
      console.error('Failed to load dispense history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
    fetchDispensableItems();
    fetchHistory();
  }, []);

  // Multi-line handlers
  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), itemId: '', location: 'ECART', qty: 1, notes: '' },
    ]);
  };

  const handleRemoveLine = (id) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleLineChange = (id, field, value) => {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, [field]: value } : line))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!patientId) {
      const err = 'Please select a patient.';
      setFormError(err);
      toast.error(err);
      return;
    }

    // Validate line items
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.itemId) {
        const err = `Row #${i + 1}: Please search and select an item.`;
        setFormError(err);
        toast.error(err);
        return;
      }
      if (!line.location) {
        const err = `Row #${i + 1}: Please explicitly select a source location (eCart or Central Storage).`;
        setFormError(err);
        toast.error(err);
        return;
      }
      if (!line.qty || Number(line.qty) <= 0) {
        const err = `Row #${i + 1}: Quantity must be a positive number.`;
        setFormError(err);
        toast.error(err);
        return;
      }
      const itemObj = dispensableItems.find((item) => item.id === line.itemId);
      const avail = line.location === 'ECART' ? (itemObj?.ecartQty ?? 0) : (itemObj?.centralQty ?? 0);
      if (avail < Number(line.qty)) {
        const err = `Row #${i + 1} (${itemObj?.name || 'Item'}): Insufficient stock in ${line.location}. Available: ${avail} ${itemObj?.unit || ''}.`;
        setFormError(err);
        toast.error(err);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const payload = {
        patientId,
        dispensedAt,
        items: lines.map((l) => ({
          itemId: l.itemId,
          location: l.location,
          qty: Number(l.qty),
          notes: l.notes.trim() || undefined,
        })),
      };

      const res = await api.post('/dispense', payload);
      const count = res.data?.count || 1;

      const successMsg = `Successfully dispensed ${count} item${count > 1 ? 's' : ''} to patient. Cashier has been notified.`;
      setFormSuccess(successMsg);
      toast.success(successMsg);

      // Reset form
      setPatientId('');
      setLines([{ id: Date.now(), itemId: '', location: 'ECART', qty: 1, notes: '' }]);
      fetchHistory();
      fetchDispensableItems();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to dispense items.';
      setFormError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';

  return (
    <div className="page-container">
      {/* Multi-Item Dispense Form Card */}
      <div className="widget-card" style={{ marginBottom: '24px' }}>
        <div className="widget-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(16,185,129,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              flexShrink: 0,
            }}
          >
            💊
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--theme-text-bold)', margin: 0 }}>
              Direct Item Dispense
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: '2px 0 0' }}>
              Dispense one or multiple items directly to a patient. Type in the searchable dropdowns to filter items quickly.
            </p>
          </div>
        </div>

        <div className="widget-body">
          {formError && (
            <div className="alert alert-error" style={{ marginBottom: '16px' }}>
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="alert alert-success" style={{ marginBottom: '16px' }}>
              ✅ {formSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Patient Selection & Dates */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'flex-start' }}>
              <div className="form-group" style={{ flex: '2', minWidth: '260px' }}>
                <label className="form-label">Patient *</label>
                <select
                  className="form-control"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                >
                  <option value="">Select active patient...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.chartNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: '1', minWidth: '180px' }}>
                <label className="form-label">Dispense Date *</label>
                <input
                  type="date"
                  className="form-control"
                  value={dispensedAt}
                  onChange={(e) => setDispensedAt(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ flex: '1', minWidth: '180px' }}>
                <label className="form-label">Date of Log</label>
                <input
                  type="text"
                  className="form-control"
                  value={`${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  readOnly
                  disabled
                  style={{ background: 'var(--theme-bg)', opacity: 0.75 }}
                />
              </div>
            </div>

            {/* Dynamic Items Table */}
            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--theme-text-bold)', margin: 0 }}>
                  Items to Dispense
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddLine}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  ➕ Add Another Item
                </button>
              </div>

              {lines.map((line, idx) => {
                const selectedItemObj = dispensableItems.find((i) => i.id === line.itemId);
                const ecart = selectedItemObj?.ecartQty ?? (selectedItemObj?.stockLevels || []).find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
                const central = selectedItemObj?.centralQty ?? (selectedItemObj?.stockLevels || []).find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
                const availableStock = ecart + central;

                return (
                  <div
                    key={line.id}
                    style={{
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: 'var(--border-radius-md)',
                      padding: '16px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--theme-text-muted)' }}>
                        ITEM #{idx + 1}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleRemoveLine(line.id)}
                          style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', padding: '2px 8px', fontSize: '12px' }}
                          title="Remove item row"
                        >
                          🗑️ Remove
                        </button>
                      )}
                    </div>

                    <div className="form-row" style={{ alignItems: 'flex-start' }}>
                      {/* Searchable Item Dropdown */}
                      <div className="form-group" style={{ flex: '2', minWidth: '220px' }}>
                        <label className="form-label">Search & Select Item *</label>
                        <SearchableItemSelect
                          items={dispensableItems}
                          value={line.itemId}
                          onChange={(val) => handleLineChange(line.id, 'itemId', val)}
                          placeholder="Type item name or SKU..."
                        />
                      </div>

                      {/* Source Location */}
                      <div className="form-group" style={{ flex: '1.5', minWidth: '170px' }}>
                        <label className="form-label">Source Location *</label>
                        <select
                          className="form-control"
                          value={line.location || 'ECART'}
                          onChange={(e) => handleLineChange(line.id, 'location', e.target.value)}
                          required
                        >
                          <option value="ECART">🛒 eCart Inventory Pool</option>
                          <option value="CENTRAL">🏢 Central Storage</option>
                        </select>
                        {selectedItemObj && line.location && (
                          <div style={{ marginTop: '6px', fontSize: '11px' }}>
                            <span style={{ color: 'var(--theme-text-muted)' }}>Avail: </span>
                            <strong style={{ color: (line.location === 'ECART' ? selectedItemObj.ecartQty : selectedItemObj.centralQty) > 0 ? 'var(--color-success)' : 'var(--color-critical)' }}>
                              {line.location === 'ECART' ? (selectedItemObj.ecartQty ?? 0) : (selectedItemObj.centralQty ?? 0)} {selectedItemObj.unit}
                            </strong>
                          </div>
                        )}
                      </div>

                      {/* Quantity */}
                      <div className="form-group" style={{ flex: '1', maxWidth: '140px', minWidth: '100px' }}>
                        <label className="form-label">Quantity *</label>
                        <input
                          type="number"
                          className="form-control"
                          min="1"
                          step="1"
                          value={line.qty}
                          onChange={(e) => handleLineChange(line.id, 'qty', e.target.value)}
                          required
                        />
                      </div>

                      {/* Line Notes */}
                      <div className="form-group" style={{ flex: '2', minWidth: '200px' }}>
                        <label className="form-label">
                          Row Notes <span style={{ color: 'var(--theme-text-muted)' }}>(Optional)</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. 1 vial used during session"
                          value={line.notes}
                          onChange={(e) => handleLineChange(line.id, 'notes', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '16px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontSize: '15px' }}
              >
                {isSubmitting ? (
                  <>
                    <span
                      className="spinner"
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    ></span>
                    Dispensing Items...
                  </>
                ) : (
                  `💊 Dispense All Items (${lines.length})`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Dispense History */}
      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-title">My Dispense History</span>
        </div>

        {historyLoading ? (
          <div className="widget-body">
            <p style={{ color: 'var(--theme-text-muted)', fontSize: '13px' }}>Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon="💊"
            title="No Dispense Records Yet"
            description="Items you dispense directly to patients will appear here."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Dispense Date</th>
                  <th>Date of Log</th>
                  <th>Location</th>
                  <th>Patient</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Notes</th>
                  <th>Billing Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((log) => {
                  const badge =
                    BILLING_STATUS_BADGE[log.billingStatus] || BILLING_STATUS_BADGE.PENDING;
                  const loc = log.location || 'ECART';
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px', color: 'var(--theme-text-bold)', fontWeight: '600' }}>
                        {formatDate(log.dispensedAt)}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                        {formatDate(log.createdAt || log.dispensedAt)}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                          {loc === 'ECART' ? '🛒 eCart' : '🏢 Central'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          {log.patient?.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                          {log.patient?.chartNumber}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)', fontSize: '13px' }}>
                          {log.item?.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                          {log.item?.sku}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {(() => {
                          const returnedQty = (log.transactions || []).reduce(
                            (sum, tx) => sum + tx.qty,
                            0
                          );
                          const netQty = log.qty - returnedQty;
                          if (returnedQty > 0) {
                            return (
                              <div>
                                <span
                                  style={{
                                    textDecoration: 'line-through',
                                    color: 'var(--theme-text-muted)',
                                    marginRight: '6px',
                                  }}
                                >
                                  {log.qty}
                                </span>
                                <strong style={{ color: 'var(--theme-text-bold)' }}>{netQty}</strong>{' '}
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 'normal',
                                    color: 'var(--theme-text-muted)',
                                  }}
                                >
                                  {log.item?.unit}
                                </span>
                                <div
                                  style={{
                                    fontSize: '10px',
                                    color: '#3b82f6',
                                    fontWeight: '600',
                                    marginTop: '2px',
                                  }}
                                >
                                  (Returned: {returnedQty})
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div>
                              <strong style={{ color: 'var(--theme-text-bold)' }}>{log.qty}</strong>{' '}
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 'normal',
                                  color: 'var(--theme-text-muted)',
                                }}
                              >
                                {log.item?.unit}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td
                        style={{
                          fontSize: '12px',
                          color: 'var(--theme-text-muted)',
                          fontStyle: log.notes ? 'normal' : 'italic',
                        }}
                      >
                        {log.notes || 'No notes'}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '20px',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: badge.color,
                            background: badge.bg,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {(() => {
                          const returnedQty = (log.transactions || []).reduce(
                            (sum, tx) => sum + tx.qty,
                            0
                          );
                          if (returnedQty < log.qty) {
                            return (
                              <Link
                                to={`/returns?sourceType=DISPENSE&sourceId=${log.id}`}
                                className="btn btn-secondary btn-sm"
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '11px',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                🔄 Return
                              </Link>
                            );
                          }
                          return (
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--theme-text-muted)',
                                fontStyle: 'italic',
                              }}
                            >
                              Returned
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dispense;

