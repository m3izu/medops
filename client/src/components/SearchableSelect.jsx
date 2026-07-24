import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, openUpward: false });
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const itemRefs = useRef([]);

  // Find currently selected option object
  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  // Recalculate dropdown position whenever isOpen is true, or on scroll/resize
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 240; // Max height of dropdown
      const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setDropdownPos({
        top: openUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        openUpward,
      });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isInsideContainer = containerRef.current && containerRef.current.contains(e.target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!isInsideContainer && !isInsideDropdown) {
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

  // Reset highlightedIndex when search term or isOpen changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen]);

  // Scroll active item into view when highlightedIndex changes
  useEffect(() => {
    if (isOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

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

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        if (!disabled) setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredOptions.length > 0 ? (prev - 1 + filteredOptions.length) % filteredOptions.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
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
          onKeyDown={handleKeyDown}
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
      {isOpen && !disabled && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            zIndex: 99999,
            maxHeight: '240px',
            overflowY: 'auto',
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            borderRadius: 'var(--border-radius-md)',
            boxShadow: 'var(--shadow-lg), 0 10px 25px -5px rgba(0,0,0,0.3)',
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
            filteredOptions.map((opt, index) => {
              const isSelected = String(opt.value) === String(value);
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={opt.value}
                  ref={(el) => (itemRefs.current[index] = el)}
                  onClick={() => handleSelect(opt)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: isHighlighted || isSelected ? 'var(--theme-primary-bg)' : 'transparent',
                    color: isSelected ? 'var(--theme-primary)' : 'var(--theme-text)',
                    fontWeight: isSelected ? '600' : 'normal',
                    borderLeft: isHighlighted ? '3px solid var(--theme-primary)' : '3px solid transparent',
                    borderBottom: '1px solid var(--theme-border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
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
        </div>,
        document.body
      )}
    </div>
  );
};

export default SearchableSelect;
