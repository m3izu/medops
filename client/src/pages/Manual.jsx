import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MANUAL_SECTIONS } from '../data/manualContent';

const Manual = () => {
  const { user, hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Filter sections user is permitted to see
  const userSections = MANUAL_SECTIONS.filter(section => 
    section.permission === null || hasPermission(section.permission)
  );

  // Categories present in permitted sections
  const categories = ['ALL', ...new Set(userSections.map(s => s.category))];

  // Apply search & category filter
  const filteredSections = userSections.filter(section => {
    const matchesCategory = selectedCategory === 'ALL' || section.category === selectedCategory;
    const matchesSearch = !search || 
      section.title.toLowerCase().includes(search.toLowerCase()) ||
      section.fullGuide.overview.toLowerCase().includes(search.toLowerCase()) ||
      section.fullGuide.steps.some(step => step.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Group filtered sections by category
  const groupedSections = filteredSections.reduce((acc, section) => {
    acc[section.category] = acc[section.category] || [];
    acc[section.category].push(section);
    return acc;
  }, {});

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page-container printable-manual">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h2 style={{ margin: 0 }}>📖 System End-User Manual</h2>
            <span className="badge badge-neutral" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
              Tailored for {user?.role?.replace('_', ' ')}
            </span>
          </div>
          <p className="page-title-desc">
            Role-customized operational guide for MedOPS. Content updates automatically based on your active system permissions.
          </p>
        </div>
        <div>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handlePrint}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            🖨️ Print Manual
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="widget-card" style={{ marginBottom: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="🔍 Search instructions, keywords, or workflows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button
                key={cat}
                className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedCategory(cat)}
                style={{ fontSize: '12px' }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Manual Content Sections */}
      {Object.keys(groupedSections).length === 0 ? (
        <div className="widget-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
          <p style={{ fontSize: '14px', margin: 0 }}>No manual instructions found matching your search term.</p>
        </div>
      ) : (
        Object.entries(groupedSections).map(([catName, sections]) => (
          <div key={catName} style={{ marginBottom: '28px' }}>
            <h3 style={{ 
              fontSize: '15px', 
              textTransform: 'uppercase', 
              letterSpacing: '0.8px', 
              color: 'var(--theme-primary)', 
              marginBottom: '14px',
              borderBottom: '2px solid var(--theme-border)',
              paddingBottom: '6px'
            }}>
              {catName}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {sections.map(sec => (
                <div key={sec.id} className="widget-card" id={`section-${sec.id}`}>
                  <div className="widget-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>{sec.icon}</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>
                        {sec.title}
                      </h4>
                      {sec.permission && (
                        <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontStyle: 'italic' }}>
                          Requires permission: <code>{sec.permission}</code>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--theme-text)', lineHeight: '1.6' }}>
                      {sec.fullGuide.overview}
                    </p>

                    <div>
                      <strong style={{ display: 'block', fontSize: '13px', color: 'var(--theme-text-bold)', marginBottom: '8px' }}>
                        Step-by-Step Instructions:
                      </strong>
                      <ol style={{ margin: 0, paddingLeft: '22px', fontSize: '13px', color: 'var(--theme-text)', lineHeight: '1.7' }}>
                        {sec.fullGuide.steps.map((step, idx) => (
                          <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default Manual;
