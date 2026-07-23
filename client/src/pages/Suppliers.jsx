import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';

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

const Suppliers = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [modalSupplierId, setModalSupplierId] = useState(null);

  // Form Fields
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/suppliers');
      setSuppliers(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setError('Failed to fetch suppliers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSupplierDetails = async (id) => {
    try {
      const response = await api.get(`/suppliers/${id}`);
      setSelectedSupplier(response.data);
    } catch (err) {
      console.error('Error fetching supplier details:', err);
      alert('Failed to load supplier details.');
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const openAddModal = () => {
    setModalMode('add');
    setModalSupplierId(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (supplier, e) => {
    e.stopPropagation(); // Avoid triggering row selection
    setModalMode('edit');
    setModalSupplierId(supplier.id);
    setName(supplier.name || '');
    setContactPerson(supplier.contactPerson || '');
    setPhone(supplier.phone || '');
    setEmail(supplier.email || '');
    setAddress(supplier.address || '');
    setNotes(supplier.notes || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Supplier name is required');
      return;
    }

    const payload = { name, contactPerson, phone, email, address, notes };

    try {
      setIsSubmitting(true);
      if (modalMode === 'add') {
        const res = await api.post('/suppliers', payload);
        setSuppliers([...suppliers, res.data]);
        toast.success(`Supplier "${name}" registered!`);
      } else {
        const res = await api.put(`/suppliers/${modalSupplierId}`, payload);
        setSuppliers(suppliers.map(s => s.id === modalSupplierId ? res.data : s));
        if (selectedSupplier && selectedSupplier.id === modalSupplierId) {
          fetchSupplierDetails(modalSupplierId);
        }
        toast.success(`Supplier "${name}" updated!`);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Submit failed:', err);
      const msg = err.response?.data?.error || 'An error occurred while saving the supplier.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id, name, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete supplier "${name}"?`)) {
      return;
    }

    try {
      await api.delete(`/suppliers/${id}`);
      setSuppliers(suppliers.filter(s => s.id !== id));
      if (selectedSupplier && selectedSupplier.id === id) {
        setSelectedSupplier(null);
      }
      toast.success(`Supplier "${name}" deleted.`);
    } catch (err) {
      console.error('Delete failed:', err);
      const msg = err.response?.data?.error || 'Failed to delete supplier.';
      alert(msg);
      toast.error(msg);
    }
  };

  const handleRowClick = (id) => {
    fetchSupplierDetails(id);
  };

  const filteredSuppliers = suppliers.filter(s => {
    const query = filterSearch.toLowerCase().trim();
    if (!query) return true;
    return (
      (s.name || '').toLowerCase().includes(query) ||
      (s.contactPerson || '').toLowerCase().includes(query) ||
      (s.phone || '').toLowerCase().includes(query) ||
      (s.email || '').toLowerCase().includes(query)
    );
  });

  const canManage = hasPermission('manage_suppliers');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Supplier Directory</h2>
          <p className="page-title-desc">Manage third-party manufacturers, pharmaceutical suppliers, and equipment vendors.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={openAddModal}>
            + Add Supplier
          </button>
        )}
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Filter Bar */}
      <div className="filter-bar" style={{ marginBottom: '20px' }}>
        <div className="filter-item" style={{ minWidth: '200px', flexGrow: 1 }}>
          <label>Search Name, Contact, or Info</label>
          <input
            type="text"
            className="form-control"
            placeholder="Search suppliers..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedSupplier ? '1.5fr 1fr' : '1fr', gap: '24px', transition: 'grid-template-columns 0.3s ease' }}>
        
        {/* Left Panel: Suppliers List */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Suppliers Registry</span>
            <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
              {filteredSuppliers.length} Supplier{filteredSuppliers.length !== 1 ? 's' : ''} Found
            </span>
          </div>
          
          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading suppliers directory...</p>
            ) : filteredSuppliers.length === 0 ? (
              <EmptyState
                icon="🤝"
                title="No Suppliers Found"
                description="No pharmaceutical suppliers, manufacturers, or distributors matched your active search term."
                actionText={canManage ? "Register New Supplier" : undefined}
                onAction={canManage ? openAddModal : undefined}
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Supplier Name</th>
                    <th>Contact Person</th>
                    <th>Phone</th>
                    <th>Email</th>
                    {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map(s => (
                    <tr 
                      key={s.id} 
                      onClick={() => handleRowClick(s.id)}
                      style={{ 
                        cursor: 'pointer',
                        backgroundColor: selectedSupplier?.id === s.id ? 'var(--theme-primary-bg)' : 'transparent'
                      }}
                    >
                      <td><strong><HighlightText text={s.name} search={filterSearch} /></strong></td>
                      <td>{s.contactPerson ? <HighlightText text={s.contactPerson} search={filterSearch} /> : <span style={{ color: 'var(--theme-text-muted)', fontSize: '12px' }}>—</span>}</td>
                      <td>{s.phone ? <HighlightText text={s.phone} search={filterSearch} /> : <span style={{ color: 'var(--theme-text-muted)', fontSize: '12px' }}>—</span>}</td>
                      <td>{s.email ? <HighlightText text={s.email} search={filterSearch} /> : <span style={{ color: 'var(--theme-text-muted)', fontSize: '12px' }}>—</span>}</td>
                      {canManage && (
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ marginRight: '8px' }}
                            onClick={(e) => openEditModal(s, e)}
                          >
                            Edit
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={(e) => handleDelete(s.id, s.name, e)}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Panel: Supplier Details */}
        {selectedSupplier && (
          <div className="widget-card" style={{ alignSelf: 'start' }}>
            <div className="widget-header">
              <span className="widget-title">ℹ️ Supplier Information</span>
              <button 
                className="modal-close" 
                onClick={() => setSelectedSupplier(null)}
                style={{ fontSize: '14px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--theme-text-muted)' }}
              >
                Close ✕
              </button>
            </div>
            
            <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '20px', marginBottom: '4px' }}>{selectedSupplier.name}</h3>
                <span className="badge badge-neutral">ID: {selectedSupplier.id}</span>
              </div>
              
              <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <strong>Contact Person:</strong> {selectedSupplier.contactPerson || '—'}
                </div>
                <div>
                  <strong>Phone:</strong> {selectedSupplier.phone || '—'}
                </div>
                <div>
                  <strong>Email:</strong> {selectedSupplier.email || '—'}
                </div>
                <div>
                  <strong>Address:</strong> {selectedSupplier.address || '—'}
                </div>
                <div>
                  <strong>Notes / Remarks:</strong> 
                  <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--theme-text-muted)', background: 'var(--theme-bg)', padding: '8px', borderRadius: 'var(--border-radius-md)' }}>
                    {selectedSupplier.notes || 'No notes compiled for this supplier.'}
                  </p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>Catalog Items Supplied:</strong>
                {selectedSupplier.items && selectedSupplier.items.length > 0 ? (
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedSupplier.items.map(item => {
                      const stockLevels = item.stockLevels || [];
                      const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
                      const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
                      const totalQty = ecartQty + centralQty;
                      return (
                        <li 
                          key={item.id}
                          style={{ 
                            padding: '8px 12px', 
                            background: 'var(--theme-bg)', 
                            borderRadius: 'var(--border-radius-sm)', 
                            fontSize: '13px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <strong>{item.name}</strong> <code style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginLeft: '4px' }}>{item.sku}</code>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span className="badge badge-neutral" style={{ fontSize: '10px' }} title="eCart Stock">
                              🛒 {ecartQty}
                            </span>
                            <span className="badge badge-secondary" style={{ fontSize: '10px' }} title="Central Storage Stock">
                              🏢 {centralQty}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', marginLeft: '4px', color: totalQty === 0 ? 'var(--color-critical)' : 'var(--theme-text-bold)' }}>
                              Total: {totalQty}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>
                    No catalog items are currently linked to this supplier.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">{modalMode === 'add' ? 'Add New Supplier' : 'Edit Supplier'}</span>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body">
                {formError && <div className="login-error">{formError}</div>}
                
                <div className="form-group">
                  <label className="form-label">Supplier Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Enter company name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Contact Person</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Representative name"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Contact number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input 
                      type="email" 
                      className="form-control" 
                      placeholder="email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Office / Warehouse address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes & Remarks</label>
                  <textarea 
                    className="form-control" 
                    placeholder="Enter payment terms, shipping speeds, or registration details..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ minHeight: '80px', resize: 'vertical' }}
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : (modalMode === 'add' ? 'Create Supplier' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
