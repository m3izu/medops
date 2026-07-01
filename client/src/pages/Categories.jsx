import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const Categories = () => {
  const { hasPermission } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [modalCatId, setModalCatId] = useState(null);

  // Form Fields
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [formError, setFormError] = useState('');

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await api.get('/categories');
      // response.data contains root categories with children array
      setCategories(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Failed to fetch categories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openAddModal = (defaultParentId = '') => {
    setModalMode('add');
    setModalCatId(null);
    setName('');
    setParentId(defaultParentId);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (cat, e) => {
    e.stopPropagation();
    setModalMode('edit');
    setModalCatId(cat.id);
    setName(cat.name || '');
    setParentId(cat.parentId || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Category name is required');
      return;
    }

    try {
      if (modalMode === 'add') {
        await api.post('/categories', { name, parentId: parentId || null });
      } else {
        await api.put(`/categories/${modalCatId}`, { name });
      }
      setIsModalOpen(false);
      fetchCategories(); // Refresh tree
    } catch (err) {
      console.error('Submit failed:', err);
      setFormError(err.response?.data?.error || 'An error occurred while saving the category.');
    }
  };

  const handleDelete = async (id, catName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete category "${catName}"? Any associated items or subcategories must be removed first.`)) {
      return;
    }

    try {
      await api.delete(`/categories/${id}`);
      fetchCategories();
    } catch (err) {
      console.error('Delete failed:', err);
      alert(err.response?.data?.error || 'Failed to delete category. Ensure it does not contain subcategories or items.');
    }
  };

  const canManage = hasPermission('manage_categories');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Item Classification</h2>
          <p className="page-title-desc">Configure categories and subcategories to classify inventory items and streamline requisition reports.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => openAddModal('')}>
            + Add Category
          </button>
        )}
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        {/* Categories Tree Container */}
        {loading ? (
          <div className="widget-card">
            <div className="widget-body">
              <p style={{ color: 'var(--theme-text-muted)' }}>Loading item classifications...</p>
            </div>
          </div>
        ) : categories.length === 0 ? (
          <div className="widget-card">
            <div className="widget-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <p style={{ color: 'var(--theme-text-muted)', marginBottom: '16px' }}>No categories registered yet.</p>
              {canManage && (
                <button className="btn btn-primary btn-sm" onClick={() => openAddModal('')}>
                  Create First Category
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
            {categories.map(root => (
              <div key={root.id} className="widget-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div className="widget-header" style={{ padding: '12px 20px', background: 'var(--theme-primary-bg)', borderBottom: '1px solid var(--theme-border)' }}>
                  <span className="widget-title" style={{ fontSize: '15px', color: 'var(--theme-primary)', fontWeight: 'bold' }}>
                    🏷️ {root.name}
                  </span>
                  
                  {canManage && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={(e) => openEditModal(root, e)}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={(e) => handleDelete(root.id, root.name, e)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="widget-body" style={{ flexGrow: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {root.children && root.children.length > 0 ? (
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                      {root.children.map(sub => (
                        <li 
                          key={sub.id}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '8px 12px', 
                            background: 'var(--theme-bg)', 
                            borderRadius: 'var(--border-radius-md)',
                            borderLeft: '3px solid var(--theme-border)'
                          }}
                        >
                          <span style={{ fontSize: '13px', fontWeight: '500' }}>{sub.name}</span>
                          
                          {canManage && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button 
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 6px', fontSize: '10px' }}
                                onClick={(e) => openEditModal(sub, e)}
                              >
                                Edit
                              </button>
                              <button 
                                className="btn btn-danger btn-sm"
                                style={{ padding: '2px 6px', fontSize: '10px' }}
                                onClick={(e) => handleDelete(sub.id, sub.name, e)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', flexGrow: 1, fontStyle: 'italic', padding: '8px 0' }}>
                      No subcategories defined.
                    </p>
                  )}
                  
                  {canManage && (
                    <button 
                      className="btn btn-secondary btn-sm" 
                      style={{ marginTop: '12px', width: '100%', borderStyle: 'dashed' }}
                      onClick={() => openAddModal(root.id)}
                    >
                      + Add Subcategory to {root.name}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">
                {modalMode === 'add' ? 'Create New Category' : 'Rename Category'}
              </span>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body">
                {formError && <div className="login-error">{formError}</div>}
                
                <div className="form-group">
                  <label className="form-label">Category Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Medications, Dialysis Supplies, Oral"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                {modalMode === 'add' && (
                  <div className="form-group">
                    <label className="form-label">Parent Classification</label>
                    <select 
                      className="form-control" 
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                    >
                      <option value="">None (Make it a Top-level Category)</option>
                      {categories.map(root => (
                        <option key={root.id} value={root.id}>
                          {root.name}
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '4px' }}>
                      To create a subcategory (e.g. "Oral" under "Medications"), select the parent category above.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'add' ? 'Create Category' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;
