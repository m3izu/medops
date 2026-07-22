import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';

const ITEM_TYPES = [
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'MEDICAL_CONSUMABLE', label: 'Medical Consumable' },
  { value: 'MEDICAL_EQUIPMENT', label: 'Medical Equipment' },
  { value: 'PPE', label: 'PPE (Personal Protective Equipment)' },
  { value: 'OFFICE_SUPPLY', label: 'Office & Cleaning Supplies' },
];

const CONDITIONS = ['GOOD', 'FAIR', 'DAMAGED', 'DECOMMISSIONED'];

const DISPENSE_MODES = [
  { value: 'REQUISITION_ONLY', label: '🔒 Requisition Only — Requires formal approval' },
  { value: 'DIRECT_DISPENSE', label: '⚡ Direct Dispense — Default to direct patient dispense' },
  { value: 'FLEXIBLE', label: '🔄 Flexible — Nurse chooses each time' },
];

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

const renderSegmentedStockGauge = (item) => {
  const qty = item.stockLevel?.quantityOnHand ?? 0;
  
  // Decide how many blocks to light up (out of 6)
  let litBlocks = 0;
  let color = 'var(--theme-primary)';
  let isCritical = false;
  let isWarning = false;

  if (qty === 0) {
    litBlocks = 0;
    color = 'var(--color-critical)';
  } else if (qty <= item.criticalLevel) {
    litBlocks = 1;
    color = 'var(--color-critical)';
    isCritical = true;
  } else if (qty <= item.warningLevel) {
    litBlocks = 3;
    color = 'var(--color-warning)';
    isWarning = true;
  } else {
    // Normal stock
    const ratio = qty / (item.warningLevel * 2 || 20);
    litBlocks = Math.min(6, Math.max(4, Math.floor(ratio * 6)));
    color = 'var(--theme-primary)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
        <span style={{ fontWeight: '700', color: 'var(--theme-text-bold)', fontFamily: 'var(--font-mono)' }}>
          {qty} {item.unit}
        </span>
        {qty === 0 ? (
          <span style={{ fontSize: '10px', color: 'var(--color-critical)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            OUT
          </span>
        ) : isCritical ? (
          <span style={{ fontSize: '10px', color: 'var(--color-critical)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            CRIT
          </span>
        ) : isWarning ? (
          <span style={{ fontSize: '10px', color: 'var(--color-warning)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            WARN
          </span>
        ) : (
          <span style={{ fontSize: '10px', color: 'var(--theme-primary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            OK
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '3px' }}>
        {[...Array(6)].map((_, i) => {
          const isLit = i < litBlocks;
          return (
            <div 
              key={i} 
              style={{ 
                height: '8px', 
                flex: 1, 
                backgroundColor: isLit ? color : 'var(--theme-border)',
                opacity: isLit ? 1 : 0.2,
                borderRadius: '2px',
                transition: 'all 0.3s ease'
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const Items = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  // Lists
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filters State
  const [filterSearch, setFilterSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterItemType, setFilterItemType] = useState('');
  const [filterStockStatus, setFilterStockStatus] = useState('');
  const [filterArchived, setFilterArchived] = useState(false);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterSearch, filterCategory, filterItemType, filterStockStatus, filterArchived]);

  // Sorting State
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'sku' | 'qty' | 'category' | 'type'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  const exportCatalogCSV = () => {
    if (!sortedItems.length) return;
    const headers = ['Item Name', 'SKU', 'Item Type', 'Category', 'Unit', 'Quantity On Hand', 'Status', 'Warning Threshold', 'Critical Threshold'];
    const rows = sortedItems.map((item) => [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.sku || '').replace(/"/g, '""')}"`,
      `"${item.itemType || ''}"`,
      `"${(item.category?.name || '').replace(/"/g, '""')}"`,
      `"${item.unit || ''}"`,
      item.stockLevel?.quantityOnHand ?? 0,
      `"${item.stockStatus || 'OK'}"`,
      item.warningLevel,
      item.criticalLevel,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medops_catalog_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Inventory catalog exported to CSV!');
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [modalItemId, setModalItemId] = useState(null);

  // Form Fields
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [itemType, setItemType] = useState('MEDICAL_CONSUMABLE');
  const [unit, setUnit] = useState('');
  const [warningLevel, setWarningLevel] = useState(10);
  const [criticalLevel, setCriticalLevel] = useState(5);
  const [supplierId, setSupplierId] = useState('');
  
  // Equipment-specific Form Fields
  const [serialNumber, setSerialNumber] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [condition, setCondition] = useState('GOOD');
  
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispenseMode, setDispenseMode] = useState('REQUISITION_ONLY');

  // Batches Modal State
  const [batchesModalOpen, setBatchesModalOpen] = useState(false);
  const [selectedItemBatches, setSelectedItemBatches] = useState([]);
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemUnit, setSelectedItemUnit] = useState('');
  const [batchesModalLoading, setBatchesModalLoading] = useState(false);

  const openBatchesModal = async (item, e) => {
    e.stopPropagation();
    setSelectedItemName(item.name);
    setSelectedItemUnit(item.unit);
    setBatchesModalOpen(true);
    try {
      setBatchesModalLoading(true);
      const res = await api.get(`/items/${item.id}`);
      setSelectedItemBatches(res.data.batches || []);
    } catch (err) {
      console.error(err);
      alert('Failed to load batch details.');
    } finally {
      setBatchesModalLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterSearch) params.search = filterSearch;
      if (filterCategory) params.category = filterCategory;
      if (filterItemType) params.itemType = filterItemType;
      if (filterStockStatus) params.stockStatus = filterStockStatus;
      if (filterArchived) params.archived = 'true';

      const response = await api.get('/items', { params });
      setItems(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching items:', err);
      setError('Failed to load inventory items.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoriesAndSuppliers = async () => {
    try {
      const [catRes, supRes] = await Promise.all([
        api.get('/categories'),
        api.get('/suppliers'),
      ]);
      
      // Flatten category tree for the form dropdown selector (root + child subcategories)
      const flatCats = [];
      (catRes.data || []).forEach(parent => {
        flatCats.push(parent); // Root category
        if (parent.children && parent.children.length > 0) {
          parent.children.forEach(child => {
            flatCats.push({ ...child, name: `— ${child.name}` }); // Subcategory
          });
        }
      });
      
      setCategories(flatCats);
      setSuppliers(supRes.data || []);
    } catch (err) {
      console.error('Error fetching form support data:', err);
    }
  };

  useEffect(() => {
    fetchCategoriesAndSuppliers();
  }, []);

  // Poll items when filters change
  useEffect(() => {
    setCurrentPage(1);
    fetchItems();
  }, [filterSearch, filterCategory, filterItemType, filterStockStatus, filterArchived]);

  const openAddModal = () => {
    setModalMode('add');
    setModalItemId(null);
    setName('');
    setSku('');
    setCategoryId(categories[0]?.id || '');
    setItemType('MEDICAL_CONSUMABLE');
    setUnit('pcs');
    setWarningLevel(10);
    setCriticalLevel(5);
    setSupplierId('');
    setSerialNumber('');
    setAcquisitionDate('');
    setCondition('GOOD');
    setDispenseMode('REQUISITION_ONLY');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (item, e) => {
    e.stopPropagation();
    setModalMode('edit');
    setModalItemId(item.id);
    setName(item.name || '');
    setSku(item.sku || '');
    setCategoryId(item.categoryId || '');
    setItemType(item.itemType || 'MEDICAL_CONSUMABLE');
    setUnit(item.unit || '');
    setWarningLevel(item.warningLevel ?? 10);
    setCriticalLevel(item.criticalLevel ?? 5);
    setSupplierId(item.supplierId || '');
    setSerialNumber(item.serialNumber || '');
    setCondition(item.condition || 'GOOD');
    setDispenseMode(item.dispenseMode || 'REQUISITION_ONLY');
    
    // Format date to YYYY-MM-DD for input
    if (item.acquisitionDate) {
      setAcquisitionDate(new Date(item.acquisitionDate).toISOString().split('T')[0]);
    } else {
      setAcquisitionDate('');
    }
    
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim() || !sku.trim() || !unit.trim()) {
      setFormError('Name, SKU, and Unit fields are required.');
      return;
    }

    const payload = {
      name,
      sku,
      categoryId: categoryId || null,
      itemType,
      unit,
      warningLevel: Number(warningLevel),
      criticalLevel: Number(criticalLevel),
      supplierId: supplierId || null,
      dispenseMode,
    };

    if (itemType === 'MEDICAL_EQUIPMENT') {
      payload.serialNumber = serialNumber || null;
      payload.acquisitionDate = acquisitionDate ? new Date(acquisitionDate).toISOString() : null;
      payload.condition = condition;
    }

    try {
      setIsSubmitting(true);
      if (modalMode === 'add') {
        await api.post('/items', payload);
      } else {
        // Edit only supports name, categoryId, unit, warningLevel, criticalLevel, supplierId, condition on backend
        await api.put(`/items/${modalItemId}`, {
          name,
          categoryId: categoryId || null,
          unit,
          warningLevel: Number(warningLevel),
          criticalLevel: Number(criticalLevel),
          supplierId: supplierId || null,
          condition: itemType === 'MEDICAL_EQUIPMENT' ? condition : undefined,
          dispenseMode,
        });
      }
      setIsModalOpen(false);
      fetchItems();
    } catch (err) {
      console.error('Submit item failed:', err);
      setFormError(err.response?.data?.error || 'An error occurred while saving the item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleArchive = async (id, isArchived, name, e) => {
    e.stopPropagation();
    const actionText = isArchived ? 'unarchive' : 'archive';
    if (!window.confirm(`Are you sure you want to ${actionText} "${name}"?`)) {
      return;
    }

    try {
      await api.patch(`/items/${id}/archive`);
      fetchItems();
    } catch (err) {
      console.error('Archive toggle failed:', err);
      alert(err.response?.data?.error || 'Failed to toggle archive status.');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OUT_OF_STOCK':
        return <span className="badge badge-critical">Out of Stock</span>;
      case 'CRITICAL':
        return <span className="badge badge-critical">Critical Level</span>;
      case 'WARNING':
        return <span className="badge badge-warning">Low Stock</span>;
      default:
        return <span className="badge badge-success">In Stock</span>;
    }
  };

  const canManage = hasPermission('manage_items');

  // Apply Sorting to Items List
  const sortedItems = [...items].sort((a, b) => {
    let aVal, bVal;
    if (sortBy === 'name') {
      aVal = (a.name || '').toLowerCase();
      bVal = (b.name || '').toLowerCase();
    } else if (sortBy === 'sku') {
      aVal = (a.sku || '').toLowerCase();
      bVal = (b.sku || '').toLowerCase();
    } else if (sortBy === 'qty') {
      aVal = a.stockLevel?.quantityOnHand ?? 0;
      bVal = b.stockLevel?.quantityOnHand ?? 0;
    } else if (sortBy === 'category') {
      aVal = (a.category?.name || '').toLowerCase();
      bVal = (b.category?.name || '').toLowerCase();
    } else if (sortBy === 'type') {
      aVal = (a.itemType || '').toLowerCase();
      bVal = (b.itemType || '').toLowerCase();
    } else {
      aVal = (a.name || '').toLowerCase();
      bVal = (b.name || '').toLowerCase();
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleHeaderSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const renderSortIndicator = (field) => {
    if (sortBy !== field) return <span style={{ opacity: 0.3, marginLeft: '4px', fontSize: '10px' }}>⇅</span>;
    return <span style={{ marginLeft: '4px', fontSize: '11px', color: 'var(--theme-primary)' }}>{sortOrder === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Clinical & Medical Supplies Catalog</h2>
          <p className="page-title-desc">Monitor real-time clinical quantities, set alert warning limits, and manage medical equipment.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-outline" onClick={exportCatalogCSV} title="Export catalog list to CSV file">
            📥 Export to CSV
          </button>
          {canManage && (
            <button className="btn btn-primary" onClick={openAddModal}>
              + Add Catalog Item
            </button>
          )}
        </div>
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Archive / Active tabs for authorized roles */}
      {hasPermission('view_archived_items') && (
        <div className="tab-container" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button 
            className={`btn ${!filterArchived ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterArchived(false)}
          >
            Active Catalog
          </button>
          <button 
            className={`btn ${filterArchived ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterArchived(true)}
          >
            Archived Items
          </button>
        </div>
      )}

      {/* 1-Click Stock Status Pills */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--theme-text-muted)', marginRight: '4px' }}>Stock Status:</span>
        <button className={`btn btn-sm ${filterStockStatus === '' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStockStatus('')}>All Items</button>
        <button className={`btn btn-sm ${filterStockStatus === 'IN_STOCK' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStockStatus('IN_STOCK')}>🟢 In Stock</button>
        <button className={`btn btn-sm ${filterStockStatus === 'WARNING' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStockStatus('WARNING')}>🟡 Warning Level</button>
        <button className={`btn btn-sm ${filterStockStatus === 'CRITICAL' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStockStatus('CRITICAL')}>🔴 Critical Level</button>
        <button className={`btn btn-sm ${filterStockStatus === 'OUT_OF_STOCK' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStockStatus('OUT_OF_STOCK')}>❌ Out of Stock</button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-item" style={{ flexGrow: 1, minWidth: '200px' }}>
          <label>Search name or SKU</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Search catalog..." 
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
        </div>

        <div className="filter-item" style={{ minWidth: '150px' }}>
          <label>Classification</label>
          <select 
            className="form-control" 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-item" style={{ minWidth: '150px' }}>
          <label>Item Type</label>
          <select 
            className="form-control" 
            value={filterItemType}
            onChange={(e) => setFilterItemType(e.target.value)}
          >
            <option value="">All Types</option>
            {ITEM_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-item" style={{ minWidth: '150px' }}>
          <label>Stock Status</label>
          <select 
            className="form-control" 
            value={filterStockStatus}
            onChange={(e) => setFilterStockStatus(e.target.value)}
          >
            <option value="">All Quantities</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="WARNING">Low (Warning)</option>
            <option value="CRITICAL">Critical Threshold</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>
        </div>

        <div className="filter-item" style={{ minWidth: '160px' }}>
          <label>Sort Catalog By</label>
          <select 
            className="form-control" 
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field);
              setSortOrder(order);
            }}
          >
            <option value="name-asc">Item Name (A–Z)</option>
            <option value="name-desc">Item Name (Z–A)</option>
            <option value="qty-asc">In Stock Qty (Lowest First)</option>
            <option value="qty-desc">In Stock Qty (Highest First)</option>
            <option value="sku-asc">SKU Code (A–Z)</option>
            <option value="sku-desc">SKU Code (Z–A)</option>
            <option value="category-asc">Category (A–Z)</option>
            <option value="type-asc">Type (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="widget-card">
        <div className="widget-body" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading inventory catalog...</p>
          ) : sortedItems.length === 0 ? (
            <EmptyState
              icon="📦"
              title="No Items Found"
              description="No inventory items matched your active filters or search criteria. Try modifying your search term or select another category."
            />
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th onClick={() => handleHeaderSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Item Name {renderSortIndicator('name')}
                    </th>
                    <th onClick={() => handleHeaderSort('sku')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      SKU {renderSortIndicator('sku')}
                    </th>
                    <th onClick={() => handleHeaderSort('type')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Type {renderSortIndicator('type')}
                    </th>
                    <th onClick={() => handleHeaderSort('category')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Category {renderSortIndicator('category')}
                    </th>
                    <th onClick={() => handleHeaderSort('qty')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      In Stock Qty {renderSortIndicator('qty')}
                    </th>
                    <th>
                      <span className="tooltip-container" style={{ borderBottom: '1px dotted var(--theme-text-muted)' }}>
                        Thresholds (Warn/Crit)
                        <span className="tooltip-text">Warn: Quantity level that triggers a warning. Crit: Quantity level that triggers a critical low warning.</span>
                      </span>
                    </th>
                    <th>Default Supplier</th>
                    <th>
                      <span className="tooltip-container" style={{ borderBottom: '1px dotted var(--theme-text-muted)' }}>
                        Alert Status
                        <span className="tooltip-text">Current status calculated dynamically from stock level and thresholds.</span>
                      </span>
                    </th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems
                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                    .map(item => (
                    <tr key={item.id}>
                      <td>
                        <div>
                          <strong>
                            <HighlightText text={item.name} search={filterSearch} />
                          </strong>
                          {item.itemType === 'MEDICAL_EQUIPMENT' && item.serialNumber && (
                            <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                              S/N: <code>{item.serialNumber}</code> • Condition: <span style={{ fontWeight: '500' }}>{item.condition}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <code>
                          <HighlightText text={item.sku} search={filterSearch} />
                        </code>
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {ITEM_TYPES.find(t => t.value === item.itemType)?.label.split(' (')[0]}
                      </td>
                      <td>{item.category?.name?.replace('— ', '') || <span style={{ color: 'var(--theme-text-muted)', fontSize: '12px' }}>—</span>}</td>
                      <td>
                        {renderSegmentedStockGauge(item)}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        <span style={{ fontWeight: '500' }}>{item.warningLevel}</span> / <span style={{ fontWeight: '500', color: 'var(--color-critical)' }}>{item.criticalLevel}</span>
                      </td>
                      <td>{item.supplier?.name || <span style={{ color: 'var(--theme-text-muted)', fontSize: '12px' }}>—</span>}</td>
                      <td>{getStatusBadge(item.stockStatus)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          {(item.itemType === 'MEDICATION' || (item.category?.hasBatchControl ?? false)) && (
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => openBatchesModal(item, e)}
                              style={{ borderColor: 'var(--theme-primary)', color: 'var(--theme-primary)' }}
                            >
                              Batches
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => openEditModal(item, e)}
                              >
                                Edit
                              </button>
                              <button 
                                className={`btn ${item.isArchived ? 'btn-primary' : 'btn-danger'} btn-sm`}
                                onClick={(e) => handleToggleArchive(item.id, item.isArchived, item.name, e)}
                              >
                                {item.isArchived ? 'Unarchive' : 'Archive'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Pagination
                currentPage={currentPage}
                totalItems={sortedItems.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <span className="modal-title">
                {modalMode === 'add' ? 'Register New Inventory Item' : 'Modify Item Details'}
              </span>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {formError && <div className="login-error">{formError}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Item Name *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. Erythropoietin 4000 IU"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">SKU / Unique Code *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. EPO-4K-01"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      required
                      disabled={modalMode === 'edit'}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Item Classification Type *</label>
                    <select 
                      className="form-control" 
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                      required
                      disabled={modalMode === 'edit'}
                    >
                      {ITEM_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Category Group</label>
                    <select 
                      className="form-control" 
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Measurement Unit *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. vial, box, bottle, pcs"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Primary Supplier</label>
                    <select 
                      className="form-control" 
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                    >
                      <option value="">Select Supplier...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Low Stock Warning Limit *</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      min="0"
                      value={warningLevel}
                      onChange={(e) => setWarningLevel(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Critical Level Limit *</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      min="0"
                      value={criticalLevel}
                      onChange={(e) => setCriticalLevel(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Conditional fields for MEDICAL_EQUIPMENT */}
                {itemType === 'MEDICAL_EQUIPMENT' && (
                  <div style={{ background: 'var(--theme-bg)', padding: '16px', borderRadius: 'var(--border-radius-lg)', marginTop: '8px', border: '1px solid var(--theme-border)' }}>
                    <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-primary)', marginBottom: '12px' }}>
                      ⚙️ Equipment Specifications
                    </h4>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Serial Number</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="e.g. SN-987123"
                          value={serialNumber}
                          onChange={(e) => setSerialNumber(e.target.value)}
                          disabled={modalMode === 'edit'}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Acquisition Date</label>
                        <input 
                          type="date" 
                          className="form-control" 
                          value={acquisitionDate}
                          onChange={(e) => setAcquisitionDate(e.target.value)}
                          disabled={modalMode === 'edit'}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Operating Condition</label>
                      <select 
                        className="form-control" 
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                      >
                        {CONDITIONS.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Dispense Mode */}
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label className="form-label">Dispense Pathway</label>
                  <select
                    className="form-control"
                    value={dispenseMode}
                    onChange={(e) => setDispenseMode(e.target.value)}
                  >
                    {DISPENSE_MODES.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '6px', lineHeight: '1.5' }}>
                    Controls whether nurses must submit a requisition or can directly dispense this item to patients for immediate billing.
                  </p>
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : (modalMode === 'add' ? 'Create Catalog Item' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batches Details Modal */}
      {batchesModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <span className="modal-title">Active Batches: {selectedItemName}</span>
              <button className="modal-close" onClick={() => setBatchesModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {batchesModalLoading ? (
                <p style={{ color: 'var(--theme-text-muted)', fontSize: '13px' }}>Loading batch records...</p>
              ) : selectedItemBatches.length === 0 ? (
                <p style={{ color: 'var(--theme-text-muted)', fontSize: '13px', fontStyle: 'italic', padding: '16px 0' }}>
                  No active batches with remaining stock are currently registered in the clinic for this item.
                </p>
              ) : (
                <table className="table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Batch / Lot No</th>
                      <th>Expiration Date</th>
                      <th>Quantity Remaining</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItemBatches.map(b => {
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const expDate = new Date(b.expiryDate);
                      const isExpired = expDate < today;
                      const diffTime = expDate - today;
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      const isExpiringSoon = !isExpired && diffDays <= 90;
                      
                      let badge = <span className="badge badge-success">OK</span>;
                      if (isExpired) {
                        badge = <span className="badge badge-critical">Expired</span>;
                      } else if (isExpiringSoon) {
                        badge = <span className="badge badge-warning">Expiring ({diffDays}d)</span>;
                      }
                      
                      return (
                        <tr key={b.id} style={{ background: isExpired ? 'var(--color-critical-bg)' : 'transparent' }}>
                          <td><code>{b.batchNo || 'N/A'}</code></td>
                          <td>{new Date(b.expiryDate).toLocaleDateString()}</td>
                          <td><strong>{b.quantityRemaining}</strong> {selectedItemUnit}</td>
                          <td>{badge}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBatchesModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Items;
