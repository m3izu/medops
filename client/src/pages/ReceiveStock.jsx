import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import SearchableSelect from '../components/SearchableSelect';

const ReceiveStock = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();
  
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form fields
  const [selectedItemId, setSelectedItemId] = useState('');
  const [targetLocation, setTargetLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  
  // Conditional medication fields
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [itemsRes, suppliersRes] = await Promise.all([
          api.get('/items'),
          api.get('/suppliers'),
        ]);
        setItems(itemsRes.data || []);
        setSuppliers(suppliersRes.data || []);
      } catch (err) {
        console.error('Error fetching receive stock dependencies:', err);
        setError('Failed to load required catalog and supplier records.');
      } finally {
        setLoading(false);
      }
    };
    
    if (hasPermission('receive_stock')) {
      fetchData();
    }
  }, []);

  const selectedItem = items.find(i => i.id === selectedItemId);
  const isEquipment = selectedItem?.itemType === 'MEDICAL_EQUIPMENT';
  const isBatchControlled = selectedItem?.itemType === 'MEDICATION' || isEquipment || (selectedItem?.category?.hasBatchControl ?? false);

  // Automatically pre-populate default supplier when item changes
  useEffect(() => {
    if (selectedItem && selectedItem.supplierId) {
      setSelectedSupplierId(selectedItem.supplierId);
    } else {
      setSelectedSupplierId('');
    }
    
    // Reset batch details when item changes
    setBatchNo('');
    setExpiryDate('');
    setSubmitSuccess('');
    setSubmitError('');
  }, [selectedItemId]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!selectedItemId) {
      setSubmitError('Please select an item to receive.');
      return;
    }

    if (!targetLocation) {
      setSubmitError('Please explicitly select a target inventory location.');
      return;
    }
    
    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setSubmitError('Quantity received must be a positive integer.');
      return;
    }

    if (isBatchControlled) {
      if (!batchNo.trim()) {
        setSubmitError('Batch / Lot number is required for batch-controlled items.');
        return;
      }
      if (!expiryDate) {
        setSubmitError('Expiry date is required for batch-controlled items.');
        return;
      }
      if (new Date(expiryDate) < new Date().setHours(0,0,0,0)) {
        setSubmitError('Batch cannot be registered with a past expiry date.');
        return;
      }
    }

    const payload = {
      itemId: selectedItemId,
      location: targetLocation,
      quantity: qtyNum,
      supplierId: selectedSupplierId || null,
      notes,
    };

    if (isBatchControlled) {
      payload.batchNo = batchNo;
      payload.expiryDate = expiryDate;
    }

    try {
      setIsSubmitting(true);
      await api.post('/stock/receive', payload);
      const msg = `Successfully received ${qtyNum} ${selectedItem.unit} of "${selectedItem.name}".`;
      setSubmitSuccess(msg);
      toast.success(msg);
      
      // Reset form
      setSelectedItemId('');
      setQuantity('');
      setSelectedSupplierId('');
      setNotes('');
      setBatchNo('');
      setExpiryDate('');
    } catch (err) {
      console.error('Receive stock submission failed:', err);
      const errMsg = err.response?.data?.error || 'An error occurred while logging the delivery.';
      setSubmitError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPermission('receive_stock')) {
    return (
      <div className="page-container">
        <div className="widget-card" style={{ borderLeft: '4px solid var(--color-critical)' }}>
          <div className="widget-header">
            <span className="widget-title">Access Denied</span>
          </div>
          <div className="widget-body">
            <p style={{ color: 'var(--theme-text-muted)' }}>
              You do not have the required permission (`receive_stock`) to log clinical inventory deliveries.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div className="page-header">
        <div>
          <h2>Log Inbound Delivery</h2>
          <p className="page-title-desc">Receive new shipments, update quantities, and register medication batch numbers & expiry dates.</p>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-title">Delivery Intake Form</span>
        </div>
        
        <form onSubmit={handleFormSubmit}>
          <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {submitError && <div className="login-error">{submitError}</div>}
            {submitSuccess && (
              <div style={{ padding: '12px 16px', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 'var(--border-radius-md)', fontSize: '14px', fontWeight: '500' }}>
                ✓ {submitSuccess}
              </div>
            )}

            {loading ? (
              <p style={{ color: 'var(--theme-text-muted)' }}>Loading form records...</p>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Select Stock Item *</label>
                  <SearchableSelect
                    options={items.map(item => ({
                      value: item.id,
                      label: `[${item.sku}] ${item.name} (${item.unit})`,
                      sku: item.sku,
                      item,
                    }))}
                    value={selectedItemId}
                    onChange={(val) => setSelectedItemId(val)}
                    placeholder="Type to search stock item by name or SKU..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Target Inventory Location *</label>
                  <select
                    className="form-control"
                    value={targetLocation}
                    onChange={(e) => setTargetLocation(e.target.value)}
                    required
                  >
                    <option value="">-- Explicitly Choose Target Location --</option>
                    <option value="ECART">🛒 eCart Inventory Pool</option>
                    <option value="CENTRAL">🏢 Central Storage</option>
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Quantity Received *</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      placeholder="e.g. 50"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                    {selectedItem && (
                      <p style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '4px' }}>
                        Measurement unit: <strong>{selectedItem.unit}</strong>.
                        {(() => {
                          const stockLevels = selectedItem.stockLevels || [];
                          const ecart = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
                          const central = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
                          return ` Current Stock — 🛒 eCart: ${ecart} ${selectedItem.unit} | 🏢 Central: ${central} ${selectedItem.unit}`;
                        })()}
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Supplier / Vendor</label>
                    <select 
                      className="form-control"
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                    >
                      <option value="">Unlinked Supplier...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Conditional Batch / Equipment Fields */}
                {isBatchControlled && (
                  <div style={{ background: 'var(--theme-bg)', padding: '20px', borderRadius: 'var(--border-radius-lg)', border: '1px solid var(--theme-border)' }}>
                    <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-primary)', marginBottom: '16px' }}>
                      {isEquipment ? '⚙️ Equipment Serial & Warranty Control' : '💊 Batch & Expiry Control (FIFO Enforced)'}
                    </h4>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">{isEquipment ? 'Serial / Asset Number *' : 'Batch / Lot Number *'}</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder={isEquipment ? 'e.g. SN-987123' : 'e.g. LOT-AB12'}
                          value={batchNo}
                          onChange={(e) => setBatchNo(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">{isEquipment ? 'Acquisition / Warranty Date *' : 'Expiry Date *'}</label>
                        <input 
                          type="date" 
                          className="form-control" 
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                          required
                        />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>Quick set:</span>
                          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => {
                            const d = new Date(); d.setMonth(d.getMonth() + 6); setExpiryDate(d.toISOString().split('T')[0]);
                          }}>+6 Mos</button>
                          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => {
                            const d = new Date(); d.setFullYear(d.getFullYear() + 1); setExpiryDate(d.toISOString().split('T')[0]);
                          }}>+1 Year</button>
                          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => {
                            const d = new Date(); d.setFullYear(d.getFullYear() + 2); setExpiryDate(d.toISOString().split('T')[0]);
                          }}>+2 Years</button>
                          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => {
                            const d = new Date(); d.setFullYear(d.getFullYear() + 3); setExpiryDate(d.toISOString().split('T')[0]);
                          }}>+3 Years</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Delivery Notes / Invoice Details</label>
                  <textarea 
                    className="form-control" 
                    placeholder="Enter invoice number, purchase notes, courier details, or storage instructions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ minHeight: '80px', resize: 'vertical' }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--theme-border)', background: 'rgba(0,0,0,0.01)' }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isSubmitting || loading}
            >
              {isSubmitting ? 'Logging shipment...' : '✓ Log Delivery Inbound'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReceiveStock;
