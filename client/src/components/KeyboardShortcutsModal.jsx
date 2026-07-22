import React from 'react';

const SHORTCUTS = [
  { keyCombo: 'Ctrl + K  /  ⌘ + K', label: 'Global Quick Search & Command Palette', description: 'Search and jump to any page, patient, or item instantly' },
  { keyCombo: '?', label: 'Open Keyboard Shortcuts Cheat Sheet', description: 'Show this keyboard shortcuts reference modal anywhere in MedOPS' },
  { keyCombo: 'Esc', label: 'Close Modal or Drawer', description: 'Close any active modal, dialog, or drawer window' },
  { keyCombo: 'Ctrl + Shift + F', label: 'Focus Search Filter Input', description: 'Focus the primary search bar on the current table page' },
  { keyCombo: 'Ctrl + P', label: 'Print Current View / Sheet', description: 'Open printable browser view for Stocktake sheet or Monthly Report' },
];

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '560px', padding: '0', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}
      >
        <div
          className="modal-header"
          style={{
            background: 'var(--theme-primary-bg)',
            borderBottom: '1px solid var(--theme-border)',
            padding: '16px 20px',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⌨️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--theme-text-bold)' }}>Keyboard Shortcuts</h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--theme-text-muted)' }}>Quick hotkeys for clinical efficiency</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '18px' }}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {SHORTCUTS.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                background: 'var(--theme-bg)',
                borderRadius: 'var(--border-radius-md)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <div>
                <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--theme-text-bold)' }}>{item.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>{item.description}</div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: 'var(--theme-card-bg)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  color: 'var(--theme-primary)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.keyCombo}
              </span>
            </div>
          ))}
        </div>

        <div
          className="modal-footer"
          style={{
            padding: '12px 20px',
            background: 'var(--theme-bg)',
            borderTop: '1px solid var(--theme-border)',
            textAlign: 'right',
          }}
        >
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Got it (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
