import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const MENU_ITEMS = [
  { path: '/', label: 'Overview / Dashboard', category: 'Overview', icon: '📊', description: 'Real-time stock alerts & clinical key metrics' },
  { path: '/manual', label: 'System Manual', category: 'Overview', icon: '📖', description: 'Documentation and SOP guide' },
  
  { path: '/patients', label: 'Patients Register', category: 'Clinical Operations', icon: '🩺', description: 'Manage patient charts, IDs & dialyzer types' },
  { path: '/requisitions', label: 'Requisitions Queue', category: 'Clinical Operations', icon: '📋', description: 'Nurse supply acquisition forms & approvals' },
  { path: '/dispense', label: 'Direct Dispense', category: 'Clinical Operations', icon: '💊', description: 'Dispense items directly to patient charts' },
  { path: '/returns', label: 'Return Item', category: 'Clinical Operations', icon: '🔄', description: 'Return unused items back to clinical stock' },
  { path: '/cashier', label: 'Cashier & Billing Log', category: 'Clinical Operations', icon: '💳', description: 'Record billing statements for patient supplies' },

  { path: '/items', label: 'Stock Items Catalog', category: 'Inventory & Stock', icon: '📦', description: 'View and manage medical inventory & batch stock' },
  { path: '/categories', label: 'Category Management', category: 'Inventory & Stock', icon: '🏷️', description: 'Manage item categories and batch control settings' },
  { path: '/stock/receive', label: 'Receive Stock', category: 'Inventory & Stock', icon: '📥', description: 'Log inbound shipments and allocate batch numbers' },
  { path: '/discards', label: 'Discard & Waste Logs', category: 'Inventory & Stock', icon: '🗑️', description: 'Report expired, damaged, or recalled items' },
  { path: '/stocktake', label: 'Stocktake & Reconciliation', category: 'Inventory & Stock', icon: '📝', description: 'Physical counts and variance reconciliation' },

  { path: '/users', label: 'Staff Accounts & Roles', category: 'Management & System', icon: '👥', description: 'Configure staff logins, roles & permissions' },
  { path: '/suppliers', label: 'Suppliers Directory', category: 'Management & System', icon: '🏢', description: 'Manage medical vendor contacts and lead times' },
  { path: '/reports', label: 'Reports & Analytics', category: 'Management & System', icon: '📈', description: 'Real-time reports, operational stats & trend analytics' },
  { path: '/import', label: 'CSV Bulk Import', category: 'Management & System', icon: '📤', description: 'Import catalog CSV datasets' },
  { path: '/stock/transactions', label: 'Audit Feed & Logs', category: 'Management & System', icon: '📜', description: 'Full system audit logs of stock movements' },
];

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const filteredItems = MENU_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item) => {
    onClose();
    navigate(item.path);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-palette-search">
          <span className="cmd-palette-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder="Type a command or search page (e.g. Patients, Stock, Dispense)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="cmd-palette-kbd">ESC</kbd>
        </div>

        <div className="cmd-palette-list">
          {filteredItems.length === 0 ? (
            <div className="cmd-palette-empty">No matching pages or tools found</div>
          ) : (
            filteredItems.map((item, idx) => (
              <div
                key={item.path}
                className={`cmd-palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="cmd-palette-item-icon">{item.icon}</span>
                <div className="cmd-palette-item-info">
                  <div className="cmd-palette-item-title">{item.label}</div>
                  <div className="cmd-palette-item-desc">{item.description}</div>
                </div>
                <span className="cmd-palette-item-category">{item.category}</span>
              </div>
            ))
          )}
        </div>

        <div className="cmd-palette-footer">
          <span>Navigation: <kbd>↑</kbd> <kbd>↓</kbd></span>
          <span>Select: <kbd>↵</kbd></span>
          <span>Close: <kbd>ESC</kbd></span>
        </div>
      </div>
    </div>
  );
}
