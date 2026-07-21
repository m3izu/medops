import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSectionsForRoute } from '../data/manualContent';

const ContextualHelp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { hasPermission } = useAuth();
  const location = useLocation();
  const drawerRef = useRef(null);

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close drawer on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && drawerRef.current && !drawerRef.current.contains(e.target)) {
        // Don't close if clicking the FAB button itself
        if (e.target.closest('.help-fab')) return;
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  // Get sections for the current page
  const currentRoute = location.pathname;
  const sections = getSectionsForRoute(currentRoute, hasPermission);

  // Don't render FAB on the manual page itself
  if (currentRoute === '/manual') return null;

  return (
    <>
      {/* FAB Button */}
      <button
        className="help-fab"
        onClick={() => setIsOpen(!isOpen)}
        title="Quick Help"
        aria-label="Toggle contextual help"
      >
        {isOpen ? '✕' : '?'}
      </button>

      {/* Backdrop */}
      {isOpen && <div className="help-drawer-backdrop" onClick={() => setIsOpen(false)} />}

      {/* Slide-out Drawer */}
      <div
        ref={drawerRef}
        className={`help-drawer ${isOpen ? 'open' : ''}`}
      >
        <div className="help-drawer-header">
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--theme-text-bold)' }}>
            Quick Help
          </h3>
          <button
            className="help-drawer-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close help"
          >
            ✕
          </button>
        </div>

        <div className="help-drawer-body">
          {sections.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: '13px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📖</div>
              No help topics available for this page.
            </div>
          ) : (
            sections.map(section => (
              <div key={section.id} className="help-drawer-section">
                <div className="help-drawer-section-title">
                  <span style={{ marginRight: '6px' }}>{section.icon}</span>
                  {section.title}
                </div>
                <ul className="help-drawer-tips">
                  {section.quickHelp.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="help-drawer-footer">
          <Link
            to="/manual"
            className="btn btn-primary btn-sm"
            style={{
              width: '100%',
              justifyContent: 'center',
              textDecoration: 'none',
              padding: '8px 16px',
              fontSize: '13px',
            }}
            onClick={() => setIsOpen(false)}
          >
            📖 View Full System Manual
          </Link>
        </div>
      </div>
    </>
  );
};

export default ContextualHelp;
