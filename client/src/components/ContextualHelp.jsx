import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MANUAL_SECTIONS } from '../data/manualContent';

const ContextualHelp = () => {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  // Close drawer on page navigation
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Filter sections that the user has permission to see AND match the current route
  const currentPath = location.pathname;

  const userPermittedSections = MANUAL_SECTIONS.filter(section => 
    section.permission === null || hasPermission(section.permission)
  );

  const currentPageSections = userPermittedSections.filter(section => {
    if (Array.isArray(section.route)) {
      return section.route.includes(currentPath);
    }
    return section.route === currentPath;
  });

  // Fallback to overview if current page has no specific section
  const displaySections = currentPageSections.length > 0 
    ? currentPageSections 
    : userPermittedSections.filter(s => s.id === 'overview');

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        className="help-fab"
        onClick={() => setIsOpen(!isOpen)}
        title="Page Quick Help & Manual"
        aria-label="Toggle Quick Help"
      >
        <span style={{ fontSize: '18px', fontWeight: 'bold' }}>❓</span>
      </button>

      {/* Slide-out Help Drawer Overlay */}
      {isOpen && (
        <div className="help-drawer-overlay" onClick={() => setIsOpen(false)}>
          <div 
            className="help-drawer" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="help-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>💡</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>
                    Quick Help & Tips
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                    Concise operational guidance for this page
                  </p>
                </div>
              </div>
              <button 
                className="help-drawer-close"
                onClick={() => setIsOpen(false)}
                title="Close Help"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body */}
            <div className="help-drawer-body">
              {displaySections.map(section => (
                <div key={section.id} className="help-section-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{section.icon}</span>
                    <strong style={{ fontSize: '14px', color: 'var(--theme-text-bold)' }}>
                      {section.title}
                    </strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--theme-text-muted)', lineHeight: '1.6' }}>
                    {section.quickHelp.map((tip, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{tip}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Drawer Footer Link to Full Manual */}
            <div className="help-drawer-footer">
              <Link 
                to="/manual" 
                className="btn btn-primary btn-sm"
                onClick={() => setIsOpen(false)}
                style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', padding: '8px 12px' }}
              >
                📖 Open Full Interactive Manual
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ContextualHelp;
