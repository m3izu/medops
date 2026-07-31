import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';

const STATUS_COLORS = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  PARTIALLY_APPROVED: 'badge-warning',
  FULLY_APPROVED: 'badge-success',
  REJECTED: 'badge-critical',
  CANCELLED: 'badge-neutral',
};

const CLASSIFICATIONS = [
  { key: 'MEDICATION', label: 'Medications', color: '#1E40AF', bgColor: '#F0F9FF' },
  { key: 'MEDICAL_CONSUMABLE', label: 'Medical Consumables', color: '#065F46', bgColor: '#ECFDF5' },
  { key: 'MEDICAL_EQUIPMENT', label: 'Medical Equipment', color: '#5B21B6', bgColor: '#F5F3FF' },
  { key: 'PPE', label: 'PPE & Protective Wear', color: '#92400E', bgColor: '#FFFBEB' },
  { key: 'OFFICE_SUPPLY', label: 'Office & Clinic Supplies', color: '#334155', bgColor: '#F8FAFC' },
];

const getExpiryStatus = (expiryDateStr) => {
  if (!expiryDateStr) return { text: 'No Expiry', color: '#4B5563', bg: '#F3F4F6', border: '#D1D5DB' };
  const exp = new Date(expiryDateStr);
  const now = new Date();
  const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { text: `EXPIRED (${Math.abs(diffDays)}d ago)`, color: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' };
  if (diffDays <= 30) return { text: `Critical (${diffDays}d left)`, color: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' };
  if (diffDays <= 90) return { text: `Warning (${diffDays}d left)`, color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' };
  return { text: `Optimal (${diffDays}d left)`, color: '#065F46', bg: '#D1FAE5', border: '#A7F3D0' };
};

const calculateFifoAllocation = (line, customQty) => {
  if (!line || !line.item) return [];
  const targetQty = Number(customQty) || line.qtyRequested || 0;
  const targetLoc = line.location || 'CENTRAL';
  const activeBatches = (line.item.batches || []).filter(b => (!b.location || b.location === targetLoc) && b.quantityRemaining > 0);
  
  let remaining = targetQty;
  const allocations = [];
  for (const batch of activeBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityRemaining, remaining);
    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNo || batch.batchNumber,
      expiryDate: batch.expiryDate,
      location: batch.location || targetLoc,
      qtyAllocated: take,
      quantityRemaining: batch.quantityRemaining,
    });
    remaining -= take;
  }
  return allocations;
};

const Requisitions = () => {
  const { user, hasPermission } = useAuth();
  const toast = useToast();

  // ── Pagination State ──
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── Data State ──
  const [requisitions, setRequisitions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── View State ──
  const [selectedReq, setSelectedReq] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  // ── Grid Sheet State ──
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [gridSessionDate, setGridSessionDate] = useState(new Date().toISOString().substring(0, 10));
  const [gridColumns, setGridColumns] = useState([]); // [{ patientId, notes, isAdditional }]
  const [sheetItemIds, setSheetItemIds] = useState([]); // Array of item IDs added to today's grid sheet
  const [gridQuantities, setGridQuantities] = useState({}); // { [`${patientId}_${itemId}`]: qty }
  const [selectedPatientPicker, setSelectedPatientPicker] = useState('');
  const [gridError, setGridError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState({});

  // ── Draft State ──
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  const draftStorageKey = useMemo(() => {
    return user?.id ? `medops_req_draft_${user.id}` : 'medops_req_draft';
  }, [user?.id]);

  const checkDraftExists = useCallback(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.updatedAt) {
          setHasSavedDraft(true);
          setDraftSavedAt(parsed.updatedAt);
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to read draft from localStorage:', e);
    }
    setHasSavedDraft(false);
    setDraftSavedAt(null);
    return null;
  }, [draftStorageKey]);

  useEffect(() => {
    checkDraftExists();
  }, [checkDraftExists, isGridOpen]);

  const saveDraft = () => {
    try {
      const draftData = {
        gridSessionDate,
        gridColumns,
        sheetItemIds,
        gridQuantities,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(draftData));
      setHasSavedDraft(true);
      setDraftSavedAt(draftData.updatedAt);
      toast.success('Requisition draft saved successfully!');
    } catch (e) {
      console.error('Save draft failed:', e);
      toast.error('Failed to save draft locally.');
    }
  };

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.gridSessionDate) setGridSessionDate(parsed.gridSessionDate);
        if (Array.isArray(parsed.gridColumns)) {
          const validCols = parsed.gridColumns.filter(c => c.isAdditional || patients.some(p => p.id === c.patientId));
          if (!validCols.some(c => c.isAdditional)) {
            validCols.push({ patientId: 'ADDITIONAL', notes: '', isAdditional: true });
          }
          setGridColumns(validCols);
        }
        if (Array.isArray(parsed.sheetItemIds)) {
          const validItemIds = parsed.sheetItemIds.filter(id => items.some(i => i.id === id && !i.isArchived));
          setSheetItemIds(validItemIds);
        }
        if (parsed.gridQuantities) setGridQuantities(parsed.gridQuantities);
        toast.success('Requisition draft restored!');
      }
    } catch (e) {
      console.error('Restore draft failed:', e);
      toast.error('Failed to restore saved draft.');
    }
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
      setHasSavedDraft(false);
      setDraftSavedAt(null);
      toast.info('Draft discarded.');
    } catch (e) {
      console.error('Discard draft failed:', e);
    }
  };

  // ── Date Normalization Helper for Robust Matching ──
  const getNormalizedDateKey = useCallback((dateVal) => {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') {
      const match = dateVal.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch (e) {
      console.error('Date normalization error:', e);
    }
    return String(dateVal).substring(0, 10);
  }, []);

  // ── Print Functionality State & Helpers ──
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printSessionDate, setPrintSessionDate] = useState('');
  const [activePrintData, setActivePrintData] = useState(null);

  const buildPrintDataForDate = useCallback((targetDateKey) => {
    if (!targetDateKey) return;
    const normalizedTarget = getNormalizedDateKey(targetDateKey);
    const reqsForDate = requisitions.filter(r => {
      if (!r.sessionDate) return false;
      const key = getNormalizedDateKey(r.sessionDate);
      return key === normalizedTarget;
    });

    const patientIdsSet = new Set();
    const itemIdsSet = new Set();
    const quantitiesMap = {};
    const notesMap = {};

    reqsForDate.forEach(r => {
      const pId = (r.patientId && r.patientId !== 'ADDITIONAL') ? r.patientId : 'ADDITIONAL';
      patientIdsSet.add(pId);
      if (r.notes) notesMap[pId] = r.notes;

      (r.lines || []).forEach(l => {
        if (l.itemId) {
          itemIdsSet.add(l.itemId);
          const qKey = `${pId}_${l.itemId}`;
          quantitiesMap[qKey] = (quantitiesMap[qKey] || 0) + (l.qtyRequested || 0);
        }
      });
    });

    const cols = Array.from(patientIdsSet).map(pId => ({
      patientId: pId,
      notes: notesMap[pId] || '',
      isAdditional: pId === 'ADDITIONAL'
    }));

    const additionalIdx = cols.findIndex(c => c.isAdditional);
    if (additionalIdx >= 0) {
      const [addCol] = cols.splice(additionalIdx, 1);
      cols.push(addCol);
    } else {
      cols.push({ patientId: 'ADDITIONAL', notes: '', isAdditional: true });
    }

    const printObj = {
      sessionDate: targetDateKey,
      displayDate: new Date(targetDateKey).toLocaleDateString(),
      columns: cols,
      itemIds: Array.from(itemIdsSet),
      quantities: quantitiesMap,
      requisitionsCount: reqsForDate.length
    };

    setActivePrintData(printObj);
  }, [requisitions, getNormalizedDateKey]);

  const buildPrintDataFromActiveSheet = useCallback(() => {
    const cols = [...gridColumns];
    if (!cols.some(c => c.isAdditional)) {
      cols.push({ patientId: 'ADDITIONAL', notes: '', isAdditional: true });
    }

    const printObj = {
      sessionDate: gridSessionDate,
      displayDate: new Date(gridSessionDate).toLocaleDateString(),
      columns: cols,
      itemIds: sheetItemIds,
      quantities: gridQuantities,
      requisitionsCount: cols.filter(c => !c.isAdditional).length
    };

    setActivePrintData(printObj);
  }, [gridSessionDate, gridColumns, sheetItemIds, gridQuantities]);

  const handleOpenPrintSelectModal = (dateKey) => {
    const initialDate = dateKey || pastSessionPresets[0]?.dateKey || new Date().toISOString().substring(0, 10);
    setPrintSessionDate(initialDate);
    buildPrintDataForDate(initialDate);
    setIsPrintModalOpen(true);
  };

  // ── Resubmit Modal State ──
  const [resubmitLine, setResubmitLine] = useState(null);
  const [resubQuantity, setResubQuantity] = useState('');
  const [resubReason, setResubReason] = useState('');
  const [resubError, setResubError] = useState('');

  // ── Approve Modal State ──
  const [approveLine, setApproveLine] = useState(null);
  const [approveQty, setApproveQty] = useState('');

  // ── Reject Modal State ──
  const [rejectLine, setRejectLine] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const canSubmit = hasPermission('submit_requisition');
  const canApprove = hasPermission('approve_requisition');
  const canCancelAny = hasPermission('cancel_any_requisition');
  const canCancelOwn = hasPermission('cancel_own_requisition');
  const canCoVerify = hasPermission('receive_stock');

  // ── Requisition Log Filter & Search State ──
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('ALL');
  const [logStockFilter, setLogStockFilter] = useState('ALL');
  const [logViewMode, setLogViewMode] = useState('BY_PATIENT'); // 'BY_PATIENT' | 'BY_SESSION'
  const [expandedSessionItem, setExpandedSessionItem] = useState(null); // `${dateKey}_${itemId}`
  
  // ── Edit Line Item Modal State (for Approvers) ──
  const [editLineModal, setEditLineModal] = useState(null); // { line, itemId, qtyRequested, qtyApproved, location, reason, isApproving, loading, error }

  // ── Overall Item Quantity & Stock Lookup Helper ──
  const getItemStockInfo = useCallback((itemObj, lineItemId) => {
    const catalogItem = items.find(i => i.id === (itemObj?.id || lineItemId)) || itemObj;
    const stockLevels = catalogItem?.stockLevels || itemObj?.stockLevels || [];
    const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
    const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
    const totalQty = stockLevels.reduce((sum, s) => sum + (s.quantityOnHand || 0), 0);
    const unit = catalogItem?.unit || itemObj?.unit || 'units';
    const warningLevel = catalogItem?.warningLevel || itemObj?.warningLevel || 10;
    
    return {
      totalQty,
      centralQty,
      ecartQty,
      unit,
      warningLevel,
      isOut: totalQty <= 0,
      isLow: totalQty > 0 && totalQty <= warningLevel
    };
  }, [items]);

  // ── Requisition Log KPI Metrics ──
  const logStats = useMemo(() => {
    let pending = 0;
    let shortageAlerts = 0;
    let totalItemsRequested = 0;

    requisitions.forEach(r => {
      if (r.status === 'PENDING' || r.status === 'PARTIALLY_APPROVED') pending++;
      
      let reqHasShortage = false;
      (r.lines || []).forEach(l => {
        totalItemsRequested += (l.qtyRequested || 0);
        const stockInfo = getItemStockInfo(l.item, l.itemId);
        if (l.status === 'PENDING' && stockInfo.totalQty < l.qtyRequested) {
          reqHasShortage = true;
        }
      });
      if (reqHasShortage && r.status !== 'CANCELLED' && r.status !== 'REJECTED') {
        shortageAlerts++;
      }
    });

    return {
      total: requisitions.length,
      pending,
      shortageAlerts,
      totalItemsRequested,
    };
  }, [requisitions, getItemStockInfo]);

  // ── Filtered Requisitions ──
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter(r => {
      // Status filter
      if (logStatusFilter !== 'ALL' && r.status !== logStatusFilter) return false;
      
      // Stock fulfillment filter
      if (logStockFilter !== 'ALL') {
        const hasShortage = (r.lines || []).some(l => {
          const stock = getItemStockInfo(l.item, l.itemId);
          return l.status === 'PENDING' && stock.totalQty < l.qtyRequested;
        });
        if (logStockFilter === 'READY' && hasShortage) return false;
        if (logStockFilter === 'SHORTAGE' && !hasShortage) return false;
      }

      // Text search query
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const matchPatient = r.patient?.name?.toLowerCase().includes(q) || r.patient?.chartNumber?.toLowerCase().includes(q);
        const matchSubmitter = r.submittedBy?.name?.toLowerCase().includes(q);
        const matchItems = (r.lines || []).some(l => l.item?.name?.toLowerCase().includes(q));
        const matchStatus = r.status.toLowerCase().includes(q);
        if (!matchPatient && !matchSubmitter && !matchItems && !matchStatus) return false;
      }

      return true;
    });
  }, [requisitions, logStatusFilter, logStockFilter, logSearchQuery, getItemStockInfo]);

  // ── Session Date Aggregated Items Summary ──
  const sessionDateSummaries = useMemo(() => {
    const map = {};

    filteredRequisitions.forEach(r => {
      if (!r.sessionDate) return;
      const dateKey = getNormalizedDateKey(r.sessionDate);
      const displayDate = new Date(r.sessionDate).toLocaleDateString();

      if (!map[dateKey]) {
        map[dateKey] = {
          dateKey,
          displayDate,
          requisitionCount: 0,
          patientMap: {},
          itemsMap: {},
        };
      }

      map[dateKey].requisitionCount++;
      if (r.patient) {
        map[dateKey].patientMap[r.patient.id || r.patient.name] = r.patient.name;
      }

      (r.lines || []).forEach(line => {
        const itemId = line.itemId;
        if (!itemId) return;

        if (!map[dateKey].itemsMap[itemId]) {
          map[dateKey].itemsMap[itemId] = {
            itemId,
            itemObj: line.item,
            name: line.item?.name || 'Unknown Item',
            unit: line.item?.unit || 'units',
            totalQtyRequested: 0,
            totalQtyApproved: 0,
            patientBreakdown: [],
          };
        }

        const itemAgg = map[dateKey].itemsMap[itemId];
        itemAgg.totalQtyRequested += (line.qtyRequested || 0);
        if (line.qtyApproved) itemAgg.totalQtyApproved += line.qtyApproved;

        itemAgg.patientBreakdown.push({
          requisitionId: r.id,
          patientName: r.patient?.name || 'Unknown Patient',
          chartNumber: r.patient?.chartNumber || 'N/A',
          qtyRequested: line.qtyRequested,
          qtyApproved: line.qtyApproved,
          location: line.location || 'CENTRAL',
          status: line.status,
        });
      });
    });

    return Object.values(map).map(session => {
      const aggregatedItems = Object.values(session.itemsMap).map(itemAgg => {
        const stockInfo = getItemStockInfo(itemAgg.itemObj, itemAgg.itemId);
        const isSufficient = stockInfo.totalQty >= itemAgg.totalQtyRequested;
        return {
          ...itemAgg,
          stockInfo,
          isSufficient,
        };
      });

      const patientCount = Object.keys(session.patientMap).length;
      const totalUnitsRequested = aggregatedItems.reduce((sum, i) => sum + i.totalQtyRequested, 0);
      const hasShortage = aggregatedItems.some(i => !i.isSufficient);

      return {
        ...session,
        aggregatedItems,
        patientCount,
        totalUnitsRequested,
        hasShortage,
      };
    }).sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey));
  }, [filteredRequisitions, getItemStockInfo, getNormalizedDateKey]);

  // ── Fetch Helpers ──
  const fetchRequisitions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/requisitions');
      setRequisitions(res.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching requisitions:', err);
      setError('Failed to load requisitions.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = async (id) => {
    try {
      setDetailLoading(true);
      const res = await api.get(`/requisitions/${id}`);
      setSelectedReq(res.data);
    } catch (err) {
      console.error('Error fetching requisition detail:', err);
      alert('Failed to load requisition details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const [pRes, iRes] = await Promise.all([
        api.get('/patients', { params: { status: 'ACTIVE' } }),
        api.get('/items'),
      ]);
      setPatients(pRes.data || []);
      setItems(iRes.data || []);
    } catch (err) {
      console.error('Error fetching lookups:', err);
    }
  };

  useEffect(() => {
    fetchRequisitions();
    fetchLookups();
  }, []);

  // Items grouped by top-level classification
  const itemsByClassification = useMemo(() => {
    const map = {
      MEDICATION: [],
      MEDICAL_CONSUMABLE: [],
      MEDICAL_EQUIPMENT: [],
      PPE: [],
      OFFICE_SUPPLY: [],
    };
    items.forEach(it => {
      const type = it.itemType || 'MEDICAL_CONSUMABLE';
      if (!map[type]) map[type] = [];
      map[type].push(it);
    });
    return map;
  }, [items]);

  // Group past requisitions by sessionDate into Presets
  const pastSessionPresets = useMemo(() => {
    const map = {};
    requisitions.forEach(r => {
      if (!r.sessionDate) return;
      const dateKey = getNormalizedDateKey(r.sessionDate);
      if (!map[dateKey]) {
        map[dateKey] = {
          dateKey,
          displayDate: new Date(r.sessionDate).toLocaleDateString(),
          patientIds: new Set(),
          itemIds: new Set(),
          requisitions: []
        };
      }
      if (r.patientId && r.patientId !== 'ADDITIONAL') {
        map[dateKey].patientIds.add(r.patientId);
      }
      r.lines?.forEach(l => {
        const catalogItem = items.find(i => i.id === l.itemId);
        if (l.itemId && catalogItem && !catalogItem.isArchived) {
          map[dateKey].itemIds.add(l.itemId);
        }
      });
      map[dateKey].requisitions.push(r);
    });

    return Object.values(map).sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey));
  }, [requisitions, items, getNormalizedDateKey]);

  const handleLoadPreset = (dateKey, copyQuantities = true) => {
    if (!dateKey) return;
    const preset = pastSessionPresets.find(p => p.dateKey === dateKey);
    if (!preset) return;

    // 1. Load Patients from preset
    const newCols = Array.from(preset.patientIds).map(pId => ({
      patientId: pId,
      notes: '',
      isAdditional: false
    }));
    newCols.push({ patientId: 'ADDITIONAL', notes: '', isAdditional: true });
    setGridColumns(newCols);

    // 2. Load Item IDs from preset into sheet
    const newItemIds = Array.from(preset.itemIds);
    setSheetItemIds(newItemIds);

    // 3. Optionally load past quantities
    const newQuants = {};
    if (copyQuantities) {
      preset.requisitions.forEach(r => {
        const pId = r.patientId || 'ADDITIONAL';
        r.lines?.forEach(l => {
          if (l.itemId && l.qtyRequested > 0) {
            newQuants[`${pId}_${l.itemId}`] = l.qtyRequested;
          }
        });
      });
    }
    setGridQuantities(newQuants);
  };

  // ── Grid Sheet Controls ──
  // Starts 100% BLANK as requested by user (no pre-populated patients or items)
  const openGridSheet = () => {
    setGridSessionDate(getNormalizedDateKey(new Date()));
    setGridColumns([{ patientId: 'ADDITIONAL', notes: '', isAdditional: true }]);
    setSheetItemIds([]);
    setGridQuantities({});
    setGridError('');
    setIsGridOpen(true);
    checkDraftExists();
  };

  const addPatientFromRegistry = (patientId) => {
    if (!patientId) return;
    if (gridColumns.some(c => c.patientId === patientId)) {
      alert('This patient is already added to today\'s requisition sheet.');
      return;
    }
    const newCols = [...gridColumns];
    const addIndex = newCols.findIndex(c => c.isAdditional);
    const newCol = { patientId, notes: '', isAdditional: false };
    if (addIndex >= 0) {
      newCols.splice(addIndex, 0, newCol);
    } else {
      newCols.push(newCol);
    }
    setGridColumns(newCols);
    setSelectedPatientPicker('');
  };

  const removePatientColumn = (idx) => {
    if (gridColumns[idx]?.isAdditional) return;
    setGridColumns(gridColumns.filter((_, i) => i !== idx));
  };

  const addItemToSheet = (itemId) => {
    if (!itemId) return;
    if (sheetItemIds.includes(itemId)) {
      alert('This item is already added to today\'s sheet.');
      return;
    }
    setSheetItemIds(prev => [...prev, itemId]);
  };

  const removeItemFromSheet = (itemId) => {
    setSheetItemIds(prev => prev.filter(id => id !== itemId));
    setGridQuantities(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => {
        if (k.endsWith(`_${itemId}`)) delete copy[k];
      });
      return copy;
    });
  };

  const handleCellChange = (patientId, itemId, value) => {
    const parsed = parseInt(value, 10);
    const key = `${patientId}_${itemId}`;
    setGridQuantities(prev => {
      const copy = { ...prev };
      if (isNaN(parsed) || parsed <= 0) {
        delete copy[key];
      } else {
        copy[key] = parsed;
      }
      return copy;
    });
  };

  const handleNotesChange = (idx, value) => {
    const updated = [...gridColumns];
    updated[idx] = { ...updated[idx], notes: value };
    setGridColumns(updated);
  };

  const calculateRowTotal = (itemId) => {
    let total = 0;
    gridColumns.forEach(col => {
      const qty = gridQuantities[`${col.patientId}_${itemId}`];
      if (qty && qty > 0) total += qty;
    });
    return total;
  };

  const handleGridSubmit = async (e) => {
    e.preventDefault();
    setGridError('');

    // Package columns into requisition payloads
    const reqs = gridColumns.map(col => {
      const colLines = [];
      sheetItemIds.forEach(itemId => {
        const qty = gridQuantities[`${col.patientId}_${itemId}`];
        if (qty && qty > 0) {
          colLines.push({ itemId, quantity: qty, location: 'CENTRAL', reason: col.notes || 'Grid Requisition entry' });
        }
      });
      return {
        patientId: col.patientId,
        isAdditional: col.isAdditional,
        notes: col.notes,
        lines: colLines
      };
    }).filter(r => r.lines.length > 0);

    if (reqs.length === 0) {
      return setGridError('Please add at least one item and enter a quantity before submitting.');
    }

    try {
      setIsSubmitting(true);
      await api.post('/requisitions/batch', {
        sessionDate: gridSessionDate,
        requisitions: reqs
      });
      setIsGridOpen(false);
      localStorage.removeItem(draftStorageKey);
      setHasSavedDraft(false);
      setDraftSavedAt(null);
      fetchRequisitions();
      toast.success('Requisition Sheet submitted successfully!');
    } catch (err) {
      console.error('Batch requisition submit failed:', err);
      const msg = err.response?.data?.error || 'Failed to submit Requisition Sheet.';
      setGridError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Single Requisition Actions ──
  const handleCancel = async (reqId) => {
    if (!window.confirm('Are you sure you want to cancel this requisition? All pending line items will be cancelled.')) return;
    try {
      await api.patch(`/requisitions/${reqId}/cancel`);
      fetchRequisitions();
      if (selectedReq?.id === reqId) fetchDetail(reqId);
      toast.info('Requisition cancelled.');
    } catch (err) {
      console.error('Cancel failed:', err);
      const msg = err.response?.data?.error || 'Failed to cancel requisition.';
      alert(msg);
      toast.error(msg);
    }
  };

  const handleApprove = async () => {
    if (!approveLine) return;
    const qty = Number(approveQty) || approveLine.qtyRequested;
    try {
      await api.patch(`/requisitions/${selectedReq.id}/lines/${approveLine.id}/approve`, { qtyApproved: qty });
      setApproveLine(null);
      fetchDetail(selectedReq.id);
      fetchRequisitions();
      toast.success('Line item approved!');
    } catch (err) {
      console.error('Approve failed:', err);
      const msg = err.response?.data?.error || 'Failed to approve line item.';
      alert(msg);
      toast.error(msg);
    }
  };

  const handleApproveAllLines = async () => {
    if (!selectedReq) return;
    const pendingLines = selectedReq.lines?.filter(l => l.status === 'PENDING') || [];
    if (pendingLines.length === 0) return;
    if (!window.confirm(`Approve all ${pendingLines.length} pending line item(s) for ${selectedReq.patient?.name}?`)) return;

    try {
      setIsApprovingAll(true);
      for (const line of pendingLines) {
        await api.patch(`/requisitions/${selectedReq.id}/lines/${line.id}/approve`, { qtyApproved: line.qtyRequested });
      }
      toast.success(`Approved all ${pendingLines.length} pending line item(s) for ${selectedReq.patient?.name}`);
    } catch (err) {
      console.error('Approve all lines failed:', err);
      const msg = err.response?.data?.error || 'Error while approving line items.';
      toast.error(msg);
    } finally {
      fetchDetail(selectedReq.id);
      fetchRequisitions();
      setIsApprovingAll(false);
    }
  };

  const handleReject = async () => {
    if (!rejectLine || !rejectReason.trim()) return alert('Rejection reason is required.');
    try {
      await api.patch(`/requisitions/${selectedReq.id}/lines/${rejectLine.id}/reject`, { rejectionReason: rejectReason });
      setRejectLine(null);
      setRejectReason('');
      fetchDetail(selectedReq.id);
      fetchRequisitions();
    } catch (err) {
      console.error('Reject failed:', err);
      alert(err.response?.data?.error || 'Failed to reject line item.');
    }
  };

  const handleResubmit = async () => {
    if (!resubmitLine) return;
    setResubError('');
    const qty = Number(resubQuantity) || resubmitLine.qtyRequested;
    const reason = resubReason.trim() || resubmitLine.reason;
    try {
      await api.post(`/requisitions/${selectedReq.id}/lines/${resubmitLine.id}/resubmit`, {
        itemId: resubmitLine.itemId,
        quantity: qty,
        reason,
      });
      setResubmitLine(null);
      fetchDetail(selectedReq.id);
      fetchRequisitions();
    } catch (err) {
      console.error('Resubmit failed:', err);
      setResubError(err.response?.data?.error || 'Failed to resubmit line item.');
    }
  };

  // ── Edit Line Item Handlers for Approvers ──
  const handleOpenEditModal = (line, isApproving = false) => {
    setEditLineModal({
      line,
      itemId: line.itemId,
      qtyRequested: line.qtyRequested,
      qtyApproved: line.qtyApproved || line.qtyRequested,
      location: 'CENTRAL',
      reason: line.reason || '',
      isApproving,
      error: '',
      loading: false,
    });
  };

  const handleSaveEditModal = async (approveNow = false) => {
    if (!editLineModal) return;
    const { line, itemId, qtyRequested, qtyApproved, location, reason, isApproving } = editLineModal;
    const shouldApprove = isApproving || approveNow;

    try {
      setEditLineModal(prev => ({ ...prev, loading: true, error: '' }));

      if (shouldApprove) {
        // Edit and approve line item in one action
        await api.patch(`/requisitions/${selectedReq.id}/lines/${line.id}/approve`, {
          itemId,
          location,
          qtyApproved: Number(qtyApproved) || Number(qtyRequested),
        });
        toast.success('Line item edited and approved successfully!');
      } else {
        // Edit pending line item
        await api.patch(`/requisitions/${selectedReq.id}/lines/${line.id}/edit`, {
          itemId,
          qtyRequested: Number(qtyRequested),
          location,
          reason,
        });
        toast.success('Line item details updated successfully!');
      }

      setEditLineModal(null);
      fetchDetail(selectedReq.id);
      fetchRequisitions();
    } catch (err) {
      console.error('Save line edit failed:', err);
      const msg = err.response?.data?.error || 'Failed to update line item.';
      setEditLineModal(prev => ({ ...prev, loading: false, error: msg }));
      toast.error(msg);
    }
  };

  const canUserCancel = (req_) => {
    if (!req_ || req_.status !== 'PENDING') return false;
    if (req_.lines?.some(l => l.status === 'APPROVED')) return false;
    if (canCancelAny) return true;
    if (canCancelOwn && req_.submittedById === user?.id) return true;
    return false;
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Item Requisition Management</h2>
          <p className="page-title-desc">
            Submit multi-patient requisition sheets, review overall item stock quantities, approve line items, and audit inventory acquisitions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleOpenPrintSelectModal()}
            style={{ fontWeight: '600', padding: '10px 18px' }}
          >
            🖨️ Print Sheet by Date
          </button>
          {canSubmit && (
            <button className="btn btn-primary" onClick={openGridSheet} style={{ fontWeight: '600', padding: '10px 18px' }}>
              New Requisition Sheet
            </button>
          )}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {/* ── Summary Stat KPI Header ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="stat-card" style={{ background: 'var(--theme-card-bg)', borderLeft: '4px solid #3B82F6', padding: '14px 18px', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--theme-shadow-sm)' }}>
          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Total Requisitions</div>
          <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '4px' }}>{logStats.total}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--theme-card-bg)', borderLeft: '4px solid #F59E0B', padding: '14px 18px', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--theme-shadow-sm)' }}>
          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Pending Approval</div>
          <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '4px', color: '#F59E0B' }}>{logStats.pending}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--theme-card-bg)', borderLeft: '4px solid #EF4444', padding: '14px 18px', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--theme-shadow-sm)' }}>
          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Stock Shortage Alerts</div>
          <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '4px', color: logStats.shortageAlerts > 0 ? '#EF4444' : 'var(--theme-text-main)' }}>
            {logStats.shortageAlerts}
            {logStats.shortageAlerts > 0 && <span style={{ fontSize: '11px', fontWeight: 'normal', marginLeft: '6px', color: '#EF4444' }}>Needs restock</span>}
          </div>
        </div>
        <div className="stat-card" style={{ background: 'var(--theme-card-bg)', borderLeft: '4px solid #10B981', padding: '14px 18px', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--theme-shadow-sm)' }}>
          <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Total Requested Units</div>
          <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '4px', color: '#10B981' }}>{logStats.totalItemsRequested}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedReq ? '1fr 1.2fr' : '1fr', gap: '24px' }}>
        {/* ── Left Side: Requisition List ── */}
        <div className="widget-card">
          <div className="widget-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--theme-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span className="widget-title" style={{ fontSize: '16px', fontWeight: '700' }}>
                Requisitions Log ({logViewMode === 'BY_SESSION' ? sessionDateSummaries.length : filteredRequisitions.length})
              </span>

              {/* View Mode Switcher Toggle */}
              <div style={{ display: 'inline-flex', background: 'var(--theme-bg)', padding: '3px', borderRadius: '6px', border: '1px solid var(--theme-border)' }}>
                <button
                  type="button"
                  onClick={() => setLogViewMode('BY_PATIENT')}
                  style={{
                    border: 'none',
                    background: logViewMode === 'BY_PATIENT' ? 'var(--theme-card-bg)' : 'transparent',
                    color: logViewMode === 'BY_PATIENT' ? 'var(--theme-text-main)' : 'var(--theme-text-muted)',
                    fontWeight: logViewMode === 'BY_PATIENT' ? '700' : '500',
                    fontSize: '11px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    boxShadow: logViewMode === 'BY_PATIENT' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  👤 By Patient Requisition
                </button>
                <button
                  type="button"
                  onClick={() => setLogViewMode('BY_SESSION')}
                  style={{
                    border: 'none',
                    background: logViewMode === 'BY_SESSION' ? 'var(--theme-card-bg)' : 'transparent',
                    color: logViewMode === 'BY_SESSION' ? 'var(--theme-text-main)' : 'var(--theme-text-muted)',
                    fontWeight: logViewMode === 'BY_SESSION' ? '700' : '500',
                    fontSize: '11px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    boxShadow: logViewMode === 'BY_SESSION' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  📅 By Session Date Aggregates
                </button>
              </div>
            </div>
            
            {/* Filter & Search Controls */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search patient, submitter, item..."
                className="form-control"
                value={logSearchQuery}
                onChange={(e) => { setLogSearchQuery(e.target.value); setCurrentPage(1); }}
                style={{ width: '180px', padding: '5px 10px', fontSize: '12px' }}
              />
              <select
                className="form-control"
                value={logStatusFilter}
                onChange={(e) => { setLogStatusFilter(e.target.value); setCurrentPage(1); }}
                style={{ width: '135px', padding: '5px 8px', fontSize: '12px' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="PARTIALLY_APPROVED">Partially Approved</option>
                <option value="FULLY_APPROVED">Fully Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <select
                className="form-control"
                value={logStockFilter}
                onChange={(e) => { setLogStockFilter(e.target.value); setCurrentPage(1); }}
                style={{ width: '145px', padding: '5px 8px', fontSize: '12px' }}
              >
                <option value="ALL">All Stock Levels</option>
                <option value="READY">🟢 Ready to Fulfill</option>
                <option value="SHORTAGE">🔴 Stock Shortage Alert</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
              Loading requisitions...
            </div>
          ) : filteredRequisitions.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
              {requisitions.length === 0 ? 'No requisitions found. Click "New Requisition Sheet" to get started.' : 'No requisitions match your search and filter criteria.'}
            </div>
          ) : logViewMode === 'BY_SESSION' ? (
            /* ── SESSION DATE AGGREGATED ITEMS VIEW ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '16px 0' }}>
              {sessionDateSummaries.map(session => (
                <div key={session.dateKey} style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', borderRadius: 'var(--border-radius-md)', padding: '16px' }}>
                  {/* Session Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--theme-border)' }}>
                    <div>
                      <strong style={{ fontSize: '15px' }}>📅 Session Date: {session.displayDate}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                        {session.patientCount} Patient(s) • {session.requisitionCount} Requisition(s) • {session.aggregatedItems.length} Unique Item(s) Requested ({session.totalUnitsRequested} Total Units)
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => handleOpenPrintSelectModal(session.dateKey)}
                        style={{ fontSize: '11px', fontWeight: '600', padding: '3px 9px' }}
                      >
                        🖨️ Print Sheet
                      </button>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          background: session.hasShortage ? '#FEE2E2' : '#DCFCE7',
                          color: session.hasShortage ? '#991B1B' : '#166534',
                          border: `1px solid ${session.hasShortage ? '#FCA5A5' : '#86EFAC'}`,
                        }}
                      >
                        {session.hasShortage ? '🔴 Inventory Shortage Alert' : '🟢 All Items In Stock'}
                      </span>
                    </div>
                  </div>

                  {/* Aggregated Items Table for this Session Date */}
                  <table className="data-table" style={{ margin: 0, fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Requested Item</th>
                        <th>Aggregated Qty (All Patients)</th>
                        <th>Patients Included</th>
                        <th>Overall Inventory Stock</th>
                        <th>Stock Sufficiency Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.aggregatedItems.map(item => {
                        const key = `${session.dateKey}_${item.itemId}`;
                        const isExpanded = expandedSessionItem === key;

                        return (
                          <React.Fragment key={item.itemId}>
                            <tr
                              onClick={() => setExpandedSessionItem(isExpanded ? null : key)}
                              style={{ cursor: 'pointer', background: isExpanded ? 'var(--theme-card-bg-hover)' : undefined }}
                            >
                              <td>
                                <strong>{item.name}</strong>
                                <span style={{ fontSize: '10px', marginLeft: '6px', opacity: 0.7 }}>({item.unit})</span>
                              </td>
                              <td>
                                <strong style={{ fontSize: '13px', color: '#1E40AF' }}>{item.totalQtyRequested} {item.unit}</strong>
                                {item.totalQtyApproved > 0 && (
                                  <span style={{ fontSize: '11px', marginLeft: '6px', color: '#166534' }}>
                                    ({item.totalQtyApproved} approved)
                                  </span>
                                )}
                              </td>
                              <td>
                                <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                                  👥 {item.patientBreakdown.length} patient(s)
                                </span>
                              </td>
                              <td>
                                <strong>Overall: {item.stockInfo.totalQty} {item.unit}</strong>
                                <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                                  Central: {item.stockInfo.centralQty} | eCart: {item.stockInfo.ecartQty}
                                </div>
                              </td>
                              <td>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    background: item.isSufficient ? '#DCFCE7' : item.stockInfo.totalQty > 0 ? '#FEF3C7' : '#FEE2E2',
                                    color: item.isSufficient ? '#166534' : item.stockInfo.totalQty > 0 ? '#92400E' : '#991B1B',
                                    border: `1px solid ${item.isSufficient ? '#86EFAC' : item.stockInfo.totalQty > 0 ? '#FDE68A' : '#FCA5A5'}`,
                                  }}
                                >
                                  {item.isSufficient ? `🟢 In Stock (${item.stockInfo.totalQty})` : item.stockInfo.totalQty > 0 ? `🟠 Shortage (${item.stockInfo.totalQty} < ${item.totalQtyRequested})` : `🔴 Out of Stock (0)`}
                                </span>
                                <span style={{ fontSize: '10px', marginLeft: '8px', color: 'var(--theme-text-muted)' }}>
                                  {isExpanded ? '▲ Hide' : '▼ View Patients'}
                                </span>
                              </td>
                            </tr>

                            {/* Expanded Patient Breakdown Drawer */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={5} style={{ background: 'var(--theme-bg)', padding: '10px 16px' }}>
                                  <div style={{ fontWeight: '700', fontSize: '11px', color: 'var(--theme-text-muted)', marginBottom: '6px' }}>
                                    Patient Breakdown for {item.name} on {session.displayDate}:
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                                    {item.patientBreakdown.map((p, pIdx) => (
                                      <div
                                        key={pIdx}
                                        onClick={(e) => { e.stopPropagation(); fetchDetail(p.requisitionId); }}
                                        style={{
                                          padding: '8px 10px',
                                          background: 'var(--theme-card-bg)',
                                          border: '1px solid var(--theme-border)',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                        }}
                                      >
                                        <div style={{ fontWeight: '700' }}>{p.patientName} <span style={{ opacity: 0.7, fontWeight: 'normal' }}>(Chart #{p.chartNumber})</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                          <span>Req: <strong>{p.qtyRequested}</strong> {item.unit} ({p.location})</span>
                                          <span className={`badge ${STATUS_COLORS[p.status] || 'badge-neutral'}`} style={{ fontSize: '9px' }}>{p.status}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            /* ── PER PATIENT REQUISITIONS TABLE VIEW ── */
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient / Subject</th>
                    <th>Session Date</th>
                    <th>Submitted By</th>
                    <th>Status</th>
                    <th>Requested Items & Overall Stock Quantity</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequisitions
                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                    .map(r => {
                      const isSelected = selectedReq?.id === r.id;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => fetchDetail(r.id)}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'var(--theme-card-bg-hover)' : undefined,
                          }}
                        >
                          <td>
                            <strong>{r.patient?.name}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                              Chart #{r.patient?.chartNumber}
                            </div>
                          </td>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {new Date(r.sessionDate).toLocaleDateString()}
                          </td>
                          <td style={{ fontSize: '12px' }}>
                            <div><strong>{r.submittedBy?.name}</strong></div>
                            <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                              {r.submittedBy?.role?.replace(/_/g, ' ')}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${STATUS_COLORS[r.status] || 'badge-neutral'}`}>
                              {r.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ minWidth: '260px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {(r.lines || []).map(line => {
                                const stock = getItemStockInfo(line.item, line.itemId);
                                const isSufficient = stock.totalQty >= line.qtyRequested;

                                return (
                                  <div
                                    key={line.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justify: 'space-between',
                                      gap: '8px',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      background: line.status === 'APPROVED' ? '#F0FDF4' : line.status === 'REJECTED' ? '#FEF2F2' : 'var(--theme-bg)',
                                      border: '1px solid var(--theme-border)',
                                      fontSize: '11px',
                                    }}
                                  >
                                    <div style={{ fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                                      {line.item?.name}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                      <span style={{ color: 'var(--theme-text-muted)' }}>
                                        Req: <strong>{line.qtyRequested}</strong> {stock.unit}
                                      </span>

                                      {/* OVERALL QUANTITY BADGE */}
                                      <span
                                        title={`Overall Quantity: ${stock.totalQty} ${stock.unit} (Central: ${stock.centralQty} | eCart: ${stock.ecartQty})`}
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          whiteSpace: 'nowrap',
                                          background: isSufficient ? '#DCFCE7' : stock.totalQty > 0 ? '#FEF3C7' : '#FEE2E2',
                                          color: isSufficient ? '#166534' : stock.totalQty > 0 ? '#92400E' : '#991B1B',
                                          border: `1px solid ${isSufficient ? '#86EFAC' : stock.totalQty > 0 ? '#FDE68A' : '#FCA5A5'}`,
                                        }}
                                      >
                                        Overall: {stock.totalQty} {stock.unit}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchDetail(r.id);
                              }}
                            >
                              View Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              <Pagination
                currentPage={currentPage}
                totalItems={filteredRequisitions.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>

        {/* ── Right Side: Requisition Details ── */}
        {selectedReq && (
          <div className="widget-card">
            <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="widget-title">
                Requisition #{selectedReq.id.slice(-6).toUpperCase()}
              </span>
              <button className="modal-close" onClick={() => setSelectedReq(null)}>✕</button>
            </div>

            {detailLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
                Loading details...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>{selectedReq.patient?.name}</h3>
                    <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                      Chart #{selectedReq.patient?.chartNumber} • Session Date: {new Date(selectedReq.sessionDate).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`badge ${STATUS_COLORS[selectedReq.status] || 'badge-neutral'}`}>
                    {selectedReq.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div style={{ background: 'var(--theme-bg)', padding: '12px 16px', borderRadius: 'var(--border-radius-md)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>Submitted By:</strong> {selectedReq.submittedBy?.name} ({selectedReq.submittedBy?.role?.replace(/_/g, ' ')})</div>
                  <div><strong>Submitted On:</strong> {new Date(selectedReq.createdAt).toLocaleString()}</div>
                  {selectedReq.cancelledBy && (
                    <div style={{ color: 'var(--color-critical)' }}><strong>Cancelled At:</strong> {new Date(selectedReq.cancelledAt).toLocaleString()}</div>
                  )}
                </div>

                {/* Cancel Button */}
                {canUserCancel(selectedReq) && (
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => handleCancel(selectedReq.id)}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Cancel Requisition
                  </button>
                )}

                {/* Line Items */}
                <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '14px' }}>
                      Line Items ({selectedReq.lines?.length || 0})
                    </strong>
                    {canApprove && selectedReq.lines?.some(l => l.status === 'PENDING') && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={handleApproveAllLines}
                        disabled={isApprovingAll}
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                      >
                        {isApprovingAll ? 'Approving...' : 'Approve All Pending Lines'}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedReq.lines?.map(line => {
                      const isResubmission = line.isResubmission;
                      const lineLoc = line.location || 'ECART';
                      const stock = getItemStockInfo(line.item, line.itemId);
                      const poolStock = lineLoc === 'CENTRAL' ? stock.centralQty : stock.ecartQty;
                      const isOverallSufficient = stock.totalQty >= line.qtyRequested;
                      const isPoolSufficient = poolStock >= line.qtyRequested;

                      return (
                        <div
                          key={line.id}
                          style={{
                            padding: '14px',
                            background: line.status === 'REJECTED' ? 'var(--color-critical-bg)' : 'var(--theme-bg)',
                            borderRadius: 'var(--border-radius-md)',
                            borderLeft: `4px solid ${
                              line.status === 'APPROVED' ? 'var(--color-success)' :
                              line.status === 'REJECTED' ? 'var(--color-critical)' :
                              line.status === 'CANCELLED' ? 'var(--theme-text-muted)' :
                              'var(--color-warning)'
                            }`,
                            boxShadow: 'var(--theme-shadow-sm)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <strong style={{ fontSize: '14px' }}>{line.item?.name}</strong>
                              {isResubmission && (
                                <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', background: 'var(--color-warning)', color: '#fff', borderRadius: '4px' }}>
                                  RESUBMITTED
                                </span>
                              )}
                            </div>
                            <span className={`badge ${STATUS_COLORS[line.status] || 'badge-neutral'}`} style={{ fontSize: '10px' }}>
                              {line.status}
                            </span>
                          </div>

                          {/* OVERALL QUANTITY & CENTRAL STORAGE BADGES */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              background: isOverallSufficient ? '#ECFDF5' : '#FEF2F2',
                              border: `1px solid ${isOverallSufficient ? '#A7F3D0' : '#FCA5A5'}`,
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: isOverallSufficient ? '#065F46' : '#991B1B'
                            }}>
                              <span>Central Storage Stock: <strong>{stock.centralQty} {stock.unit}</strong></span>
                            </div>

                            <span className="badge badge-neutral" style={{ fontSize: '11px', padding: '3px 8px' }}>
                              Storage Source: 🏢 Central Storage
                            </span>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginBottom: '8px' }}>
                            <div>Requested: <strong>{line.qtyRequested}</strong> {line.item?.unit}</div>
                            <div>Notes/Reason: <em>"{line.reason}"</em></div>
                            {line.qtyApproved && (
                              <div style={{ color: 'var(--color-success)', fontWeight: '600', marginTop: '2px' }}>Approved: {line.qtyApproved} {line.item?.unit}</div>
                            )}
                            {line.rejectionReason && (
                              <div style={{ color: 'var(--color-critical)', fontWeight: '600', marginTop: '2px' }}>Rejected: {line.rejectionReason}</div>
                            )}

                            {/* Sufficiency Banner for Pending Lines */}
                            {line.status === 'PENDING' && (
                              <div style={{
                                marginTop: '6px',
                                padding: '6px 10px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                                background: stock.centralQty >= line.qtyRequested ? '#F0FDF4' : '#FEF2F2',
                                color: stock.centralQty >= line.qtyRequested ? '#15803D' : '#B91C1C',
                                border: `1px solid ${stock.centralQty >= line.qtyRequested ? '#BBF7D0' : '#FECACA'}`
                              }}>
                                {stock.centralQty >= line.qtyRequested
                                  ? `✅ Sufficient stock in Central Storage to fulfill requirement.`
                                  : `🔴 Central Storage shortage! Available Central Stock (${stock.centralQty}) is less than requested (${line.qtyRequested}).`}
                              </div>
                            )}

                            {/* FIFO Lot Picking Preview for Pending Lines */}
                            {line.status === 'PENDING' && (line.item?.itemType === 'MEDICATION' || line.item?.category?.hasBatchControl) && (() => {
                              const pendingFifo = calculateFifoAllocation(line);
                              if (pendingFifo.length === 0) return (
                                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-critical)', fontWeight: '600' }}>
                                  ⚠️ No active unexpired batches available in Central Storage for FIFO allocation!
                                </div>
                              );
                              return (
                                <div style={{ marginTop: '6px', padding: '6px 10px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '4px', fontSize: '11px' }}>
                                  <div style={{ fontWeight: '700', color: '#0369A1', marginBottom: '4px' }}>
                                    📦 FIFO Pick-List Cues (Physical Shelf Location):
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    {pendingFifo.map((p, pIdx) => {
                                      const st = getExpiryStatus(p.expiryDate);
                                      return (
                                        <div key={p.batchId || pIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span>
                                            Pick <strong style={{ fontFamily: 'monospace' }}>Lot #{p.batchNumber}</strong> ({p.location}): <strong>{p.qtyAllocated}</strong> {line.item?.unit}
                                          </span>
                                          <span style={{ fontSize: '9px', fontWeight: '600', padding: '1px 5px', borderRadius: '3px', color: st.color, background: st.bg, border: `1px solid ${st.border}` }}>
                                            {st.text}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Actual Dispensed Lots for Approved Lines */}
                            {line.status === 'APPROVED' && line.transactionLogs && line.transactionLogs.length > 0 && (
                              <div style={{ marginTop: '6px', padding: '6px 10px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '4px', fontSize: '11px' }}>
                                <div style={{ fontWeight: '700', color: '#065F46', marginBottom: '2px' }}>
                                  ✅ Dispensed Lot Numbers (Audit Recorded):
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {line.transactionLogs.map((log, lIdx) => (
                                    <span key={log.id || lIdx} style={{ fontFamily: 'monospace', fontWeight: '600', background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: '3px' }}>
                                      Lot #{log.batch?.batchNo || log.batch?.batchNumber || 'N/A'} ({log.qty} {line.item?.unit})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Line Action Buttons */}
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--theme-border)', paddingTop: '8px' }}>
                            {canCoVerify && line.item?.itemType === 'MEDICATION' && line.status === 'PENDING' && !line.coVerifiedById && (
                              <button
                                className="btn btn-sm btn-outline-info"
                                onClick={async () => {
                                  try {
                                    await api.patch(`/requisitions/${selectedReq.id}/lines/${line.id}/co-verify`);
                                    fetchDetail(selectedReq.id);
                                    fetchRequisitions();
                                  } catch (err) {
                                    alert(err.response?.data?.error || 'Co-verify failed');
                                  }
                                }}
                              >
                                Co-Verify
                              </button>
                            )}

                            {canApprove && line.status === 'PENDING' && (
                              <>
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => handleOpenEditModal(line, false)}
                                  title="Edit item, quantity, or location before approving"
                                >
                                  ✏️ Edit Item
                                </button>
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleOpenEditModal(line, true)}
                                  title="Edit item details and approve line item"
                                >
                                  ✅ Edit & Approve
                                </button>
                                <button
                                  className="btn btn-critical btn-sm"
                                  onClick={() => {
                                    setRejectLine(line);
                                    setRejectReason('');
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {line.status === 'REJECTED' && canSubmit && selectedReq.submittedBy?.id === user?.id && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  setResubmitLine(line);
                                  setResubQuantity(String(line.qtyRequested));
                                  setResubReason(line.reason);
                                  setResubError('');
                                }}
                              >
                                Resubmit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── HIGH-READABILITY CLASSIFICATION-BASED SPREADSHEET GRID MODAL ── */}
      {isGridOpen && (
        <div className="modal-overlay" onClick={() => setIsGridOpen(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '96vw',
              width: '1400px',
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '2px solid var(--theme-border)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>
                  REQUISITION FORM
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                  Multi-patient session inventory acquisition sheet (Classifications & Patients Registry)
                </span>
              </div>
              <button className="modal-close" onClick={() => setIsGridOpen(false)}>✕</button>
            </div>

            {/* Saved Draft Banner */}
            {hasSavedDraft && (
              <div
                style={{
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '6px',
                  padding: '10px 16px',
                  marginTop: '14px',
                  fontSize: '13px',
                  color: '#1E40AF',
                }}
              >
                <div>
                  💾 <strong>Saved Draft Found</strong> (saved {draftSavedAt ? new Date(draftSavedAt).toLocaleString() : ''})
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={restoreDraft}
                    style={{ fontWeight: '600' }}
                  >
                    Restore Draft
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={discardDraft}
                    style={{ fontWeight: '600' }}
                  >
                    Discard Draft
                  </button>
                </div>
              </div>
            )}

            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Session Date:</label>
                  <input
                    type="date"
                    className="form-control"
                    value={gridSessionDate}
                    onChange={e => setGridSessionDate(e.target.value)}
                    style={{ width: '160px' }}
                  />
                </div>

                {/* QoL Preset Copy Selector */}
                {pastSessionPresets.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--theme-text-muted)' }}>Load Preset:</label>
                    <select
                      className="form-control"
                      onChange={e => {
                        if (e.target.value) {
                          handleLoadPreset(e.target.value, true);
                          e.target.value = '';
                        }
                      }}
                      style={{ width: '270px', fontSize: '12px' }}
                    >
                      <option value="">Copy Preset from Past Session...</option>
                      {pastSessionPresets.map(p => (
                        <option key={p.dateKey} value={p.dateKey}>
                          Session: {p.displayDate} ({p.patientIds.size} Patients, {p.itemIds.size} Items)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Top Toolbar Action Pickers */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Global Catalog Item Search Dropdown */}
                <div style={{ width: '340px' }}>
                  <SearchableSelect
                    options={items.map(it => {
                      const clsObj = CLASSIFICATIONS.find(c => c.key === (it.itemType || 'MEDICAL_CONSUMABLE'));
                      const stockInfo = getItemStockInfo(it, it.id);
                      const centralQty = stockInfo.centralQty;
                      const ecartQty = stockInfo.ecartQty;
                      const totalQty = stockInfo.totalQty;

                      const centralBadge = centralQty > 0
                        ? `🏢 Central Stock: ${centralQty} ${it.unit}`
                        : `🔴 Central: Out of Stock (0 ${it.unit})`;

                      return {
                        value: it.id,
                        label: `[${clsObj?.label || 'Item'}] ${it.name} (${it.sku}) — ${centralBadge}`,
                        sublabel: `🏢 Central: ${centralQty} ${it.unit} | 🛒 eCart: ${ecartQty} ${it.unit} (Total: ${totalQty} ${it.unit})`,
                      };
                    })}
                    value=""
                    onChange={(val) => {
                      if (val) addItemToSheet(val);
                    }}
                    placeholder="🔍 + Add Item (showing Central Stock)..."
                  />
                </div>

                {/* Patient Selector from Patients Registry */}
                <select
                  className="form-control"
                  value={selectedPatientPicker}
                  onChange={e => {
                    setSelectedPatientPicker(e.target.value);
                    if (e.target.value) addPatientFromRegistry(e.target.value);
                  }}
                  style={{ width: '260px' }}
                >
                  <option value="">+ Add Patient from Registry...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.chartNumber}] {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {gridError && <div className="login-error" style={{ marginBottom: '12px' }}>{gridError}</div>}

            {/* Scrollable Sticky Spreadsheet Grid Container */}
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--theme-border)', borderRadius: 'var(--border-radius-md)', position: 'relative' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' }}>
                <thead>
                  {/* Top Header Row: Patients */}
                  <tr>
                    {/* Top-Left Cell (Sticky Top & Left) */}
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'left',
                        minWidth: '280px',
                        position: 'sticky',
                        top: 0,
                        left: 0,
                        zIndex: 30,
                        background: 'var(--theme-card-bg)',
                        borderBottom: '2px solid var(--theme-border)',
                        borderRight: '2px solid var(--theme-border)',
                      }}
                    >
                      ITEM CLASSIFICATIONS & DESCRIPTION
                    </th>

                    {/* Patient Column Headers (Sticky Top) */}
                    {gridColumns.map((col, idx) => {
                      if (col.isAdditional) {
                        return (
                          <th
                            key="additional"
                            style={{
                              padding: '10px 8px',
                              textAlign: 'center',
                              minWidth: '130px',
                              position: 'sticky',
                              top: 0,
                              zIndex: 20,
                              background: '#FEF3C7',
                              color: '#92400E',
                              borderBottom: '2px solid var(--theme-border)',
                              borderLeft: '2px solid #F59E0B',
                            }}
                          >
                            <div style={{ fontWeight: '700', fontSize: '13px' }}>ADDITIONAL</div>
                            <div style={{ fontSize: '10px', fontWeight: '400' }}>Station Stock</div>
                          </th>
                        );
                      }
                      const pat = patients.find(p => p.id === col.patientId);
                      return (
                        <th
                          key={col.patientId}
                          style={{
                            padding: '10px 8px',
                            textAlign: 'center',
                            minWidth: '140px',
                            position: 'sticky',
                            top: 0,
                            zIndex: 20,
                            background: 'var(--theme-card-bg)',
                            borderBottom: '2px solid var(--theme-border)',
                            borderLeft: '1px solid var(--theme-border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--theme-text-bold)' }}>
                              {pat?.name || 'Patient'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removePatientColumn(idx)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: '12px' }}
                              title="Remove patient column"
                            >
                              ✕
                            </button>
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                            Chart #{pat?.chartNumber}
                          </div>
                          {pat?.diagnosis && (
                            <div style={{ fontSize: '9px', background: 'var(--theme-bg)', padding: '2px 4px', borderRadius: '3px', marginTop: '4px' }}>
                              {pat.diagnosis}
                            </div>
                          )}
                        </th>
                      );
                    })}

                    {/* Rightmost Total Header (Sticky Top & Right) */}
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        minWidth: '95px',
                        position: 'sticky',
                        top: 0,
                        right: 0,
                        zIndex: 30,
                        background: '#E0F2FE',
                        color: '#0369A1',
                        borderBottom: '2px solid var(--theme-border)',
                        borderLeft: '2px solid #0284C7',
                      }}
                    >
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Render Sections per Top-Level Item Classification */}
                  {CLASSIFICATIONS.map(cls => {
                    const clsCatalogItems = itemsByClassification[cls.key] || [];
                    const clsSheetItemIds = sheetItemIds.filter(id => {
                      const found = items.find(i => i.id === id);
                      return found && (found.itemType || 'MEDICAL_CONSUMABLE') === cls.key;
                    });

                    return (
                      <React.Fragment key={cls.key}>
                        {/* Classification Header Row */}
                        <tr style={{ background: cls.bgColor }}>
                          <td
                            colSpan={gridColumns.length + 2}
                            style={{
                              padding: '8px 14px',
                              fontWeight: '700',
                              fontSize: '12px',
                              letterSpacing: '0.3px',
                              color: cls.color,
                              borderTop: '2px solid var(--theme-border)',
                              borderBottom: '1px solid var(--theme-border)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{cls.label} ({clsSheetItemIds.length} added)</span>

                              {/* Single Searchable Dropdown Picker per classification for Central Storage items */}
                              <div style={{ minWidth: '260px', width: '280px' }}>
                                <SearchableSelect
                                  options={clsCatalogItems
                                    .map(it => ({
                                      value: it.id,
                                      label: `${it.name} (${it.sku})`,
                                      sublabel: `Unit: ${it.unit}`,
                                    }))}
                                  value=""
                                  onChange={(val) => {
                                    if (val) addItemToSheet(val);
                                  }}
                                  placeholder={`🔍 Add ${cls.label.toLowerCase()}...`}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Item Rows under this classification */}
                        {clsSheetItemIds.length === 0 ? (
                          <tr>
                            <td
                              colSpan={gridColumns.length + 2}
                              style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--theme-text-muted)', fontStyle: 'italic', borderBottom: '1px solid var(--theme-border)' }}
                            >
                              No items added under {cls.label} yet. Use the "+ Add Item" picker above to add items to today's sheet.
                            </td>
                          </tr>
                        ) : (
                          clsSheetItemIds.map(itemId => {
                            const item = items.find(i => i.id === itemId);
                            if (!item) return null;

                            const centralStock = item.centralQty ?? (item.stockLevels || []).find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
                            const rowTotal = calculateRowTotal(item.id);
                            const isLowStock = rowTotal > centralStock;

                            return (
                              <tr key={item.id} style={{ borderBottom: '1px solid var(--theme-border)' }}>
                                {/* Left Item Column (Sticky Left) */}
                                <td
                                  style={{
                                    padding: '8px 12px',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 10,
                                    background: 'var(--theme-card-bg)',
                                    borderRight: '2px solid var(--theme-border)',
                                    fontWeight: '500',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: '600', color: 'var(--theme-text-bold)' }}>{item.name}</div>
                                      <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>
                                        SKU: {item.sku} | Unit: {item.unit}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeItemFromSheet(item.id)}
                                      style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: '12px' }}
                                      title="Remove item row"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>

                                {/* Patient Cells */}
                                {gridColumns.map(col => {
                                  const val = gridQuantities[`${col.patientId}_${item.id}`] || '';
                                  return (
                                    <td
                                      key={col.patientId}
                                      style={{
                                        padding: '4px',
                                        textAlign: 'center',
                                        borderLeft: col.isAdditional ? '2px solid #F59E0B' : '1px solid var(--theme-border)',
                                        background: col.isAdditional ? '#FFFBEB' : undefined,
                                      }}
                                    >
                                      <input
                                        type="number"
                                        min="0"
                                        className="form-control"
                                        value={val}
                                        onChange={e => handleCellChange(col.patientId, item.id, e.target.value)}
                                        style={{
                                          width: '100%',
                                          textAlign: 'center',
                                          padding: '4px',
                                          fontWeight: val ? '700' : 'normal',
                                          backgroundColor: val ? '#FEF08A' : undefined,
                                          borderColor: val ? '#F59E0B' : undefined,
                                        }}
                                      />
                                    </td>
                                  );
                                })}

                                {/* Rightmost Total Cell (Sticky Right) */}
                                <td
                                  style={{
                                    padding: '8px',
                                    textAlign: 'center',
                                    fontWeight: '700',
                                    background: isLowStock ? '#FEE2E2' : '#F0F9FF',
                                    color: isLowStock ? 'var(--color-critical)' : rowTotal > 0 ? '#0369A1' : 'var(--theme-text-muted)',
                                    borderLeft: '2px solid #0284C7',
                                    position: 'sticky',
                                    right: 0,
                                    zIndex: 10,
                                  }}
                                >
                                  {rowTotal || 0}
                                  {isLowStock && (
                                    <div style={{ fontSize: '9px', color: 'var(--color-critical)', fontWeight: '700' }}>EXCEEDS STOCK</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Bottom Patient Notes / Remarks Row */}
                  <tr style={{ background: 'var(--theme-card-bg)', borderTop: '2px solid var(--theme-border)' }}>
                    <td
                      style={{
                        padding: '12px',
                        fontWeight: '700',
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        background: 'var(--theme-card-bg)',
                        borderRight: '2px solid var(--theme-border)',
                      }}
                    >
                      PATIENT SESSION NOTES / REMARKS
                    </td>
                    {gridColumns.map((col, idx) => (
                      <td key={col.patientId} style={{ padding: '6px', borderLeft: col.isAdditional ? '2px solid #F59E0B' : '1px solid var(--theme-border)' }}>
                        <textarea
                          className="form-control"
                          placeholder={col.isAdditional ? "Station notes..." : "Session notes..."}
                          rows="2"
                          value={col.notes || ''}
                          onChange={e => handleNotesChange(idx, e.target.value)}
                          style={{ fontSize: '11px', resize: 'vertical' }}
                        />
                      </td>
                    ))}
                    <td style={{ position: 'sticky', right: 0, zIndex: 10, background: '#F0F9FF', borderLeft: '2px solid #0284C7' }}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ marginTop: '16px', borderTop: '1px solid var(--theme-border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {hasSavedDraft && (
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={restoreDraft} style={{ fontWeight: '600' }}>
                    🔄 Restore Saved Draft
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn" onClick={() => setIsGridOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => { buildPrintDataFromActiveSheet(); setIsPrintModalOpen(true); }} style={{ fontWeight: '600' }}>
                  🖨️ Print Form
                </button>
                <button type="button" className="btn btn-secondary" onClick={saveDraft} style={{ fontWeight: '600' }}>
                  💾 Save Draft
                </button>
                <button type="button" className="btn btn-primary" onClick={handleGridSubmit} disabled={isSubmitting} style={{ fontWeight: '700', padding: '10px 24px' }}>
                  {isSubmitting ? 'Submitting Requisition Sheet...' : 'Submit Requisition Sheet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Qty Modal ── */}
      {approveLine && (
        <div className="modal-overlay" onClick={() => setApproveLine(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <span className="modal-title">Approve: {approveLine.item?.name}</span>
              <button className="modal-close" onClick={() => setApproveLine(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(() => {
                const lineLoc = approveLine.location || 'ECART';
                const stockLevels = approveLine.item?.stockLevels || [];
                const availStock = stockLevels.find(s => s.location === lineLoc)?.quantityOnHand ?? 0;
                const isMedOrBatch = approveLine.item?.itemType === 'MEDICATION' || approveLine.item?.category?.hasBatchControl;
                const fifoSplits = calculateFifoAllocation(approveLine, approveQty);

                return (
                  <>
                    <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                      Requested: <strong>{approveLine.qtyRequested}</strong> {approveLine.item?.unit} • Target Pool: <strong style={{ color: 'var(--theme-primary)' }}>{lineLoc === 'ECART' ? '🛒 eCart' : '🏢 Central'}</strong> • Available Pool Stock: <strong>{availStock}</strong>
                    </p>
                    <div className="form-group">
                      <label className="form-label">Approved Quantity</label>
                      <input
                        type="number"
                        className="form-control"
                        min="1"
                        max={availStock || approveLine.qtyRequested}
                        value={approveQty}
                        onChange={e => setApproveQty(e.target.value)}
                      />
                    </div>

                    {isMedOrBatch && fifoSplits.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', borderRadius: 'var(--border-radius-md)' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--theme-text-bold)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📦 FIFO Lot Allocation Preview</span>
                          <span style={{ fontSize: '10px', fontWeight: 'normal', color: 'var(--theme-text-muted)' }}>(Oldest unexpired batches first)</span>
                        </div>
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'var(--theme-card-bg)', textTransform: 'uppercase', color: 'var(--theme-text-muted)', fontSize: '10px' }}>
                              <th style={{ padding: '4px 6px', textAlign: 'left' }}>Lot / Batch #</th>
                              <th style={{ padding: '4px 6px', textAlign: 'left' }}>Expiry Status</th>
                              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Deduct Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fifoSplits.map((alloc, idx) => {
                              const expStatus = getExpiryStatus(alloc.expiryDate);
                              return (
                                <tr key={alloc.batchId || idx} style={{ borderTop: '1px solid var(--theme-border)' }}>
                                  <td style={{ padding: '5px 6px', fontWeight: '600', fontFamily: 'monospace' }}>
                                    {alloc.batchNumber} {idx === 0 && <span style={{ fontSize: '9px', background: '#DBEAFE', color: '#1E40AF', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px' }}>FIFO #1</span>}
                                  </td>
                                  <td style={{ padding: '5px 6px' }}>
                                    <span style={{ fontSize: '9px', fontWeight: '600', padding: '2px 5px', borderRadius: '3px', color: expStatus.color, background: expStatus.bg, border: `1px solid ${expStatus.border}` }}>
                                      {expStatus.text}
                                    </span>
                                  </td>
                                  <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '700', color: '#0369A1' }}>
                                    {alloc.qtyAllocated} {approveLine.item?.unit}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
                <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                  You may approve a partial quantity. FIFO will auto-deduct from oldest batches for medications.
                </span>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setApproveLine(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleApprove}>Confirm Approval</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Reason Modal ── */}
      {rejectLine && (
        <div className="modal-overlay" onClick={() => setRejectLine(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <span className="modal-title">Reject: {rejectLine.item?.name}</span>
              <button className="modal-close" onClick={() => setRejectLine(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                Requested: <strong>{rejectLine.qtyRequested}</strong> {rejectLine.item?.unit} for "{rejectLine.reason}"
              </p>
              <div className="form-group">
                <label className="form-label">Rejection Reason *</label>
                <textarea
                  className="form-control"
                  placeholder="Explain why this line item is being rejected..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  required
                  style={{ minHeight: '80px' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRejectLine(null)}>Cancel</button>
              <button className="btn btn-critical" onClick={handleReject} disabled={!rejectReason.trim()}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resubmit Modal ── */}
      {resubmitLine && (
        <div className="modal-overlay" onClick={() => setResubmitLine(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <span className="modal-title">Resubmit: {resubmitLine.item?.name}</span>
              <button className="modal-close" onClick={() => setResubmitLine(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {resubError && <div className="login-error">{resubError}</div>}
              <div style={{ padding: '10px 12px', background: 'var(--color-critical-bg)', borderRadius: 'var(--border-radius-md)', fontSize: '12px' }}>
                <strong>Previously rejected:</strong> {resubmitLine.rejectionReason}
              </div>
              <div className="form-group">
                <label className="form-label">Revised Quantity</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  value={resubQuantity}
                  onChange={e => setResubQuantity(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Revised Reason / Justification</label>
                <input
                  type="text"
                  className="form-control"
                  value={resubReason}
                  onChange={e => setResubReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setResubmitLine(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResubmit}>Resubmit for Approval</button>
            </div>
          </div>
        </div>
      )}
      {/* ── EDIT & APPROVE LINE ITEM MODAL FOR APPROVERS ── */}
      {editLineModal && (
        <div className="modal-overlay" onClick={() => setEditLineModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', width: '100%', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--theme-border)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>
                {editLineModal.isApproving ? '✏️ Edit & Approve Line Item' : '✏️ Edit Requested Line Item'}
              </h3>
              <button className="modal-close" onClick={() => setEditLineModal(null)}>✕</button>
            </div>

            {editLineModal.error && (
              <div className="login-error" style={{ marginBottom: '16px' }}>{editLineModal.error}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Item Selector */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                  Change Item (Showing Central Stock):
                </label>
                <SearchableSelect
                  options={items.map(it => {
                    const stockInfo = getItemStockInfo(it, it.id);
                    const centralBadge = stockInfo.centralQty > 0
                      ? `🏢 Central Stock: ${stockInfo.centralQty} ${it.unit}`
                      : `🔴 Central: Out of Stock (0 ${it.unit})`;

                    return {
                      value: it.id,
                      label: `${it.name} (${it.sku}) — ${centralBadge}`,
                      sublabel: `🏢 Central: ${stockInfo.centralQty} ${it.unit} | 🛒 eCart: ${stockInfo.ecartQty} ${it.unit} (Total: ${stockInfo.totalQty} ${it.unit})`,
                    };
                  })}
                  value={editLineModal.itemId}
                  onChange={(val) => setEditLineModal(prev => ({ ...prev, itemId: val }))}
                  placeholder="Search item to replace requested item..."
                />
              </div>

              {/* Central Stock Info Box for Selected Item */}
              {(() => {
                const selectedItemObj = items.find(i => i.id === editLineModal.itemId);
                const stock = getItemStockInfo(selectedItemObj, editLineModal.itemId);
                const currentPoolQty = editLineModal.location === 'CENTRAL' ? stock.centralQty : stock.ecartQty;
                const reqQty = Number(editLineModal.qtyApproved) || Number(editLineModal.qtyRequested) || 0;
                const isEnough = currentPoolQty >= reqQty;

                return (
                  <div style={{
                    padding: '10px 14px',
                    background: isEnough ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${isEnough ? '#86EFAC' : '#FCA5A5'}`,
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}>
                    <div style={{ fontWeight: '700', color: isEnough ? '#166534' : '#991B1B' }}>
                      📦 Selected Item Stock Overview:
                    </div>
                    <div style={{ marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span>🏢 <strong>Central Stock:</strong> {stock.centralQty} {stock.unit}</span>
                      <span>🛒 <strong>eCart Stock:</strong> {stock.ecartQty} {stock.unit}</span>
                      <span>📊 <strong>Overall Total:</strong> {stock.totalQty} {stock.unit}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Storage Source */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                  Storage Source:
                </label>
                <div style={{ padding: '8px 12px', background: 'var(--theme-bg)', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--theme-border)', fontWeight: '600' }}>
                  🏢 Central Storage (Exclusive Source for Requisitions)
                </div>
              </div>

              {/* Quantities */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                    Requested Quantity:
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={editLineModal.qtyRequested}
                    onChange={e => setEditLineModal(prev => ({ ...prev, qtyRequested: e.target.value, qtyApproved: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                    Approved Quantity:
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={editLineModal.qtyApproved}
                    onChange={e => setEditLineModal(prev => ({ ...prev, qtyApproved: e.target.value }))}
                  />
                </div>
              </div>

              {/* Reason / Notes */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Notes / Reason for Edit:
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editLineModal.reason}
                  onChange={e => setEditLineModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Substituted item due to Central stock availability..."
                />
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-neutral"
                  onClick={() => setEditLineModal(null)}
                  disabled={editLineModal.loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => handleSaveEditModal(false)}
                  disabled={editLineModal.loading}
                >
                  {editLineModal.loading ? 'Saving...' : 'Save Changes'}
                </button>
                {canApprove && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleSaveEditModal(true)}
                    disabled={editLineModal.loading}
                  >
                    {editLineModal.loading ? 'Approving...' : '✅ Save & Approve Line'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINT PREVIEW & SESSION DATE SELECTION MODAL ── */}
      {isPrintModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPrintModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px', width: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>🖨️ Print Requisition Sheet by Session Date</h3>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                  Generates an official printable requisition matrix matching the requisition form layout.
                </span>
              </div>
              <button className="modal-close" onClick={() => setIsPrintModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--theme-bg)', padding: '12px', borderRadius: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '13px' }}>Select Session Date:</label>
                <select
                  className="form-control"
                  value={printSessionDate}
                  onChange={e => {
                    setPrintSessionDate(e.target.value);
                    buildPrintDataForDate(e.target.value);
                  }}
                  style={{ width: '280px' }}
                >
                  <option value={getNormalizedDateKey(new Date())}>Today ({new Date().toLocaleDateString()})</option>
                  {pastSessionPresets.map(p => (
                    <option key={p.dateKey} value={p.dateKey}>
                      Session: {p.displayDate} ({p.patientIds.size} Patients, {p.itemIds.size} Items)
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="form-control"
                  value={printSessionDate}
                  onChange={e => {
                    setPrintSessionDate(e.target.value);
                    buildPrintDataForDate(e.target.value);
                  }}
                  style={{ width: '160px' }}
                />
              </div>

              {/* On-Screen Print Preview */}
              {activePrintData && (
                <div style={{ border: '1px solid var(--theme-border)', borderRadius: '6px', padding: '16px', background: 'var(--theme-card-bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '2px solid var(--theme-border)', paddingBottom: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '16px' }}>MEDOPS REQUISITION SHEET PREVIEW</strong>
                      <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                        Session Date: <strong>{activePrintData.displayDate || activePrintData.sessionDate}</strong>
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', textAlign: 'right' }}>
                      <div>Patients: <strong>{activePrintData.columns?.filter(c => !c.isAdditional).length || 0}</strong></div>
                      <div>Items: <strong>{activePrintData.itemIds?.length || 0}</strong></div>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                    <table className="data-table" style={{ fontSize: '11px', margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Item Classification & Name</th>
                          {activePrintData.columns.map((col, idx) => {
                            if (col.isAdditional) return <th key="add" style={{ textAlign: 'center', background: '#FEF3C7', color: '#92400E' }}>ADDITIONAL</th>;
                            const pat = patients.find(p => p.id === col.patientId);
                            return <th key={col.patientId || idx} style={{ textAlign: 'center' }}>{pat?.name || 'Patient'}</th>;
                          })}
                          <th style={{ textAlign: 'center', background: '#E0F2FE' }}>TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CLASSIFICATIONS.map(cls => {
                          const clsItemIds = (activePrintData.itemIds || []).filter(id => {
                            const found = items.find(i => i.id === id);
                            return found && (found.itemType || 'MEDICAL_CONSUMABLE') === cls.key;
                          });

                          if (clsItemIds.length === 0) return null;

                          return (
                            <React.Fragment key={cls.key}>
                              <tr style={{ background: cls.bgColor }}>
                                <td colSpan={activePrintData.columns.length + 2} style={{ fontWeight: '700', color: cls.color }}>
                                  {cls.label} ({clsItemIds.length} items)
                                </td>
                              </tr>
                              {clsItemIds.map(itemId => {
                                const item = items.find(i => i.id === itemId);
                                if (!item) return null;

                                let rowTotal = 0;
                                activePrintData.columns.forEach(col => {
                                  const qty = activePrintData.quantities[`${col.patientId}_${item.id}`];
                                  if (qty && qty > 0) rowTotal += Number(qty);
                                });

                                return (
                                  <tr key={item.id}>
                                    <td style={{ fontWeight: '600' }}>{item.name} <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)' }}>({item.unit})</span></td>
                                    {activePrintData.columns.map(col => {
                                      const qty = activePrintData.quantities[`${col.patientId}_${item.id}`] || '';
                                      return (
                                        <td key={col.patientId} style={{ textAlign: 'center', fontWeight: qty ? '700' : 'normal' }}>
                                          {qty || '—'}
                                        </td>
                                      );
                                    })}
                                    <td style={{ textAlign: 'center', fontWeight: '800', background: '#F0F9FF', color: '#0369A1' }}>
                                      {rowTotal}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={() => setIsPrintModalOpen(false)}>Close</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  window.print();
                }}
                style={{ fontWeight: '700', padding: '10px 24px' }}
              >
                🖨️ Print Document Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HIDDEN PRINTABLE REQUISITION SHEET AREA FOR WINDOW.PRINT() ── */}
      {activePrintData && (() => {
        const PATIENT_COLUMNS_PER_PAGE = 5;
        const allCols = activePrintData.columns || [];
        
        // Split columns into chunks of MAX 5 patient columns per page
        const columnChunks = [];
        for (let i = 0; i < allCols.length; i += PATIENT_COLUMNS_PER_PAGE) {
          columnChunks.push(allCols.slice(i, i + PATIENT_COLUMNS_PER_PAGE));
        }
        if (columnChunks.length === 0) {
          columnChunks.push([{ patientId: 'ADDITIONAL', notes: '', isAdditional: true }]);
        }

        const totalPages = columnChunks.length;

        return (
          <div id="printable-requisition-area" style={{ padding: '0', fontFamily: 'sans-serif', color: '#1e293b' }}>
            {columnChunks.map((chunkCols, chunkIdx) => {
              const isLastPage = chunkIdx === totalPages - 1;

              return (
                <div
                  key={chunkIdx}
                  className={isLastPage ? 'print-page-no-break' : 'print-page-break'}
                  style={{ padding: '24px', boxSizing: 'border-box' }}
                >
                  {/* Official Printable Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1e3a8a', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        MEDOPS CLINICAL REQUISITION SHEET
                      </h1>
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                        Official Medical Inventory Acquisition Form (Page {chunkIdx + 1} of {totalPages})
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11px', color: '#334155' }}>
                      <div><strong>Session Date:</strong> {activePrintData.displayDate || activePrintData.sessionDate}</div>
                      <div><strong>Generated:</strong> {new Date().toLocaleString()}</div>
                      <div><strong>Printed By:</strong> {user?.name || 'System User'} ({user?.role?.replace(/_/g, ' ')})</div>
                    </div>
                  </div>

                  {/* Metadata Summary Banner */}
                  <div style={{ display: 'flex', gap: '20px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '4px', marginBottom: '14px', fontSize: '11px' }}>
                    <div><strong>Session Date:</strong> {activePrintData.displayDate || activePrintData.sessionDate}</div>
                    <div><strong>Total Patients:</strong> {allCols.filter(c => !c.isAdditional).length}</div>
                    <div><strong>Page Subset:</strong> Columns {chunkIdx * PATIENT_COLUMNS_PER_PAGE + 1}–{Math.min((chunkIdx + 1) * PATIENT_COLUMNS_PER_PAGE, allCols.length)}</div>
                    <div><strong>Page:</strong> {chunkIdx + 1} of {totalPages}</div>
                  </div>

                  {/* Printable Grid Table for this Chunk */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '16px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'left', minWidth: '200px' }}>
                          ITEM CLASSIFICATIONS & DESCRIPTION
                        </th>
                        {chunkCols.map((col, cIdx) => {
                          if (col.isAdditional) {
                            return (
                              <th key="add" style={{ border: '1px solid #94a3b8', padding: '6px', textAlign: 'center', background: '#fef3c7', color: '#92400e' }}>
                                <div style={{ fontWeight: '700' }}>ADDITIONAL</div>
                                <div style={{ fontSize: '9px', fontWeight: 'normal' }}>Station Stock</div>
                              </th>
                            );
                          }
                          const pat = patients.find(p => p.id === col.patientId);
                          return (
                            <th key={col.patientId || cIdx} style={{ border: '1px solid #94a3b8', padding: '6px', textAlign: 'center' }}>
                              <div style={{ fontWeight: '700' }}>{pat?.name || 'Patient'}</div>
                              <div style={{ fontSize: '9px', color: '#64748b' }}>#{pat?.chartNumber || 'N/A'}</div>
                            </th>
                          );
                        })}
                        <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'center', background: '#e0f2fe', color: '#0369a1', fontWeight: '700' }}>
                          {isLastPage ? 'TOTAL' : 'SUBTOTAL'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {CLASSIFICATIONS.map(cls => {
                        const clsItemIds = (activePrintData.itemIds || []).filter(id => {
                          const found = items.find(i => i.id === id);
                          return found && (found.itemType || 'MEDICAL_CONSUMABLE') === cls.key;
                        });

                        if (clsItemIds.length === 0) return null;

                        return (
                          <React.Fragment key={cls.key}>
                            <tr style={{ background: cls.bgColor }}>
                              <td colSpan={chunkCols.length + 2} style={{ border: '1px solid #94a3b8', padding: '5px 8px', fontWeight: '700', color: cls.color }}>
                                {cls.label} ({clsItemIds.length} items)
                              </td>
                            </tr>
                            {clsItemIds.map(itemId => {
                              const item = items.find(i => i.id === itemId);
                              if (!item) return null;

                              let chunkTotal = 0;
                              chunkCols.forEach(col => {
                                const qty = activePrintData.quantities[`${col.patientId}_${item.id}`];
                                if (qty && qty > 0) chunkTotal += Number(qty);
                              });

                              return (
                                <tr key={item.id}>
                                  <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', fontWeight: '600' }}>
                                    {item.name} <span style={{ fontSize: '9px', color: '#64748b' }}>({item.sku} | {item.unit})</span>
                                  </td>
                                  {chunkCols.map(col => {
                                    const qty = activePrintData.quantities[`${col.patientId}_${item.id}`] || '';
                                    return (
                                      <td key={col.patientId} style={{ border: '1px solid #cbd5e1', padding: '5px', textAlign: 'center', fontWeight: qty ? '700' : 'normal' }}>
                                        {qty || '—'}
                                      </td>
                                    );
                                  })}
                                  <td style={{ border: '1px solid #94a3b8', padding: '5px', textAlign: 'center', fontWeight: '800', background: '#f0f9ff', color: '#0369a1' }}>
                                    {chunkTotal}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}

                      {/* Patient Notes Row */}
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ border: '1px solid #94a3b8', padding: '6px 8px', fontWeight: '700' }}>
                          PATIENT SESSION NOTES / REMARKS
                        </td>
                        {chunkCols.map(col => (
                          <td key={col.patientId} style={{ border: '1px solid #cbd5e1', padding: '5px', fontSize: '9px' }}>
                            {col.notes || '—'}
                          </td>
                        ))}
                        <td style={{ border: '1px solid #94a3b8', background: '#f0f9ff' }}></td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Render Signatures only on the final page */}
                  {isLastPage && (
                    <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '2px solid #94a3b8', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', fontSize: '10px' }}>
                      <div>
                        <div style={{ fontWeight: '700', marginBottom: '24px' }}>SUBMITTED BY (Clinical Nurse):</div>
                        <div style={{ borderTop: '1px dashed #64748b', paddingTop: '4px' }}>Signature & Date</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', marginBottom: '24px' }}>APPROVED BY (Inventory Manager):</div>
                        <div style={{ borderTop: '1px dashed #64748b', paddingTop: '4px' }}>Signature & Date</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', marginBottom: '24px' }}>DISPENSED / RECEIVED BY:</div>
                        <div style={{ borderTop: '1px dashed #64748b', paddingTop: '4px' }}>Signature & Date</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

export default Requisitions;
