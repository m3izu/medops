import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAllSectionsGrouped } from '../data/manualContent';

const CATEGORY_ICONS = {
  'Getting Started': '🚀',
  'Patient Care': '🩺',
  'Inventory Management': '📦',
  'Stocktake & Audit': '📋',
  'Reports & Administration': '⚙️',
};

const Manual = () => {
  const { user, hasPermission } = useAuth();
  const [expandedSection, setExpandedSection] = useState(null);

  const grouped = getAllSectionsGrouped(hasPermission);
  const categories = Object.keys(grouped);

  const roleName = user?.role?.replace(/_/g, ' ') || 'User';

  const toggleSection = (sectionId) => {
    setExpandedSection(prev => prev === sectionId ? null : sectionId);
  };

  const expandAll = () => {
    // Set to a special marker to expand all
    setExpandedSection('__ALL__');
  };

  const collapseAll = () => {
    setExpandedSection(null);
  };

  const isSectionExpanded = (sectionId) => {
    return expandedSection === '__ALL__' || expandedSection === sectionId;
  };

  const totalSections = categories.reduce((sum, cat) => sum + grouped[cat].length, 0);

  return (
    <div className="page-container manual-page" style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div>
            <h2 style={{ margin: 0 }}>📖 System Manual</h2>
            <p className="page-title-desc" style={{ marginTop: '4px' }}>
              Step-by-step instructions for using MedOPS, personalized for your role and permissions.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={expandAll} style={{ fontSize: '12px' }}>
              Expand All
            </button>
            <button className="btn btn-secondary btn-sm" onClick={collapseAll} style={{ fontSize: '12px' }}>
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Role Badge */}
      <div className="widget-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'var(--theme-primary-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', flexShrink: 0,
          }}>
            📖
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--theme-text-bold)' }}>
              Personalized for: <span className="badge badge-neutral" style={{ marginLeft: '6px', fontSize: '11px' }}>{roleName}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
              Showing {totalSections} guide section{totalSections !== 1 ? 's' : ''} based on your current permissions. This manual updates automatically when your permissions change.
            </div>
          </div>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="widget-card" style={{ marginBottom: '24px' }}>
        <div className="widget-header">
          <span className="widget-title">Table of Contents</span>
        </div>
        <div className="widget-body" style={{ padding: '12px 20px' }}>
          {categories.map(category => (
            <div key={category} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-primary)', marginBottom: '4px' }}>
                {CATEGORY_ICONS[category] || '📄'} {category}
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'none' }}>
                {grouped[category].map(section => (
                  <li key={section.id} style={{ marginBottom: '2px' }}>
                    <a
                      href={`#manual-${section.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setExpandedSection(section.id);
                        setTimeout(() => {
                          document.getElementById(`manual-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 50);
                      }}
                      style={{
                        fontSize: '13px',
                        color: 'var(--theme-text)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '2px 0',
                      }}
                    >
                      <span style={{ fontSize: '14px' }}>{section.icon}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Sections */}
      {categories.map(category => (
        <div key={category} style={{ marginBottom: '28px' }}>
          <h3 style={{
            fontSize: '13px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: 'var(--theme-primary)',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '2px solid var(--theme-primary-bg)',
          }}>
            {CATEGORY_ICONS[category] || '📄'} {category}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {grouped[category].map(section => {
              const isExpanded = isSectionExpanded(section.id);
              return (
                <div
                  key={section.id}
                  id={`manual-${section.id}`}
                  className="widget-card"
                  style={{ overflow: 'hidden' }}
                >
                  {/* Section Header (clickable accordion) */}
                  <div
                    onClick={() => toggleSection(section.id)}
                    style={{
                      padding: '14px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background 0.15s',
                      background: isExpanded ? 'var(--theme-primary-bg)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>{section.icon}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--theme-text-bold)' }}>
                        {section.title}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '14px',
                      color: 'var(--theme-text-muted)',
                      transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      display: 'inline-block',
                    }}>
                      ▼
                    </span>
                  </div>

                  {/* Section Body (expanded content) */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 20px 18px 20px',
                      borderTop: '1px solid var(--theme-border)',
                    }}>
                      <ol style={{
                        margin: '14px 0 0 0',
                        paddingLeft: '18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}>
                        {section.fullGuide.map((step, idx) => (
                          <li key={idx} style={{
                            fontSize: '13px',
                            lineHeight: '1.7',
                            color: 'var(--theme-text)',
                          }}>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: '20px 0',
        color: 'var(--theme-text-muted)',
        fontSize: '12px',
        borderTop: '1px solid var(--theme-border)',
      }}>
        MedOPS System Manual • Auto-generated based on your role permissions • {new Date().getFullYear()}
      </div>
    </div>
  );
};

export default Manual;
