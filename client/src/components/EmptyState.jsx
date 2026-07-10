import React from 'react';

const EmptyState = ({ icon, title, description, actionText, onAction }) => {
  return (
    <div 
      className="widget-card" 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '48px 24px', 
        textAlign: 'center',
        background: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
        borderRadius: 'var(--border-radius-lg)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div 
        style={{ 
          fontSize: '48px', 
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'var(--theme-primary-bg)',
          color: 'var(--theme-primary)',
          userSelect: 'none'
        }}
      >
        {icon}
      </div>
      
      <h3 
        style={{ 
          fontSize: '18px', 
          fontWeight: '700', 
          color: 'var(--theme-text-bold)',
          marginBottom: '8px'
        }}
      >
        {title}
      </h3>
      
      <p 
        style={{ 
          fontSize: '14px', 
          color: 'var(--theme-text-muted)', 
          maxWidth: '380px', 
          lineHeight: '1.5',
          marginBottom: actionText && onAction ? '20px' : '0'
        }}
      >
        {description}
      </p>
      
      {actionText && onAction && (
        <button 
          type="button" 
          className="btn btn-primary" 
          onClick={onAction}
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
