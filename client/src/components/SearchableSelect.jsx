import React, { useState, useEffect, useRef } from 'react';

const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Type to search item...',
  disabled = false,
  required = false,
  className = '',
  style = {},
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  // Find currently selected option object
  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options by search term
  const filteredOptions = options.filter((opt) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const labelMatch = (opt.label || '').toLowerCase().includes(term);
    const skuMatch = (opt.sku || opt.item?.sku || '').toLowerCase().includes(term);
    return labelMatch || skuMatch;
  });

  const handleSelect = (option) => {
    onChange(option ? option.value : '', option);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', null);
    setSearchTerm('');
  };

  return (
    <div
      ref={containerRef}
      className={`searchable-select-container ${className}`}
      style={{ position: 'relative', width: '100%', ...style }}
    >
      {/* Input / Display Field */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <input
          type="text"
          className="form-control"
          placeholder={selectedOption ? selectedOption.label : placeholder}
          value={isOpen ? searchTerm : selectedOption ? selectedOption.label : ''}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          disabled={disabled}
          required={required && !value}
          style={{
            paddingRight: value ? '32px' : '24px',
            backgroundColor: disabled ? 'var(--theme-bg-disabled)' : 'var(--theme-card-bg)',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />

        {/* Clear Button */}
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: '24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--theme-text-muted)',
              fontSize: '12px',
              padding: '2px 6px',
            }}
            title="Clear selection"
          >
            ✕
          </button>
        )}

        {/* Dropdown Caret */}
        <span
          style={{
            position: 'absolute',
            right: '8px',
            pointerEvents: 'none',
            fontSize: '10px',
            color: 'var(--theme-text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </div>

      {/* Options Popup */}
      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            marginTop: '4px',
            maxHeight: '240px',
            overflowY: 'auto',
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: 'var(--border-radius-md)',
            boxShadow: 'var(--theme-shadow-md)',
          }}
        >
          {filteredOptions.length === 0 ? (
            <div
              style={{
                padding: '10px 14px',
                fontSize: '13px',
                color: 'var(--theme-text-muted)',
                textAlign: 'center',
              }}
            >
              No matching items found
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--theme-primary-bg)' : 'transparent',
                    color: isSelected ? 'var(--theme-primary)' : 'var(--theme-text)',
                    fontWeight: isSelected ? '600' : 'normal',
                    borderBottom: '1px solid var(--theme-border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--theme-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>{opt.label}</span>
                  {opt.sublabel && (
                    <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginLeft: '8px' }}>
                      {opt.sublabel}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
