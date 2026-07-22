import React from 'react';

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startItem = totalItems === 0 ? 0 : Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const delta = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  };

  return (
    <div className="pagination-bar">
      <div className="pagination-info">
        Showing <span className="pagination-highlight">{startItem}</span> to{' '}
        <span className="pagination-highlight">{endItem}</span> of{' '}
        <span className="pagination-highlight">{totalItems}</span> entries
      </div>

      <div className="pagination-controls">
        {onPageSizeChange && (
          <div className="pagination-size-selector">
            <span>Rows:</span>
            <select
              className="form-control form-control-sm"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          className="btn btn-sm btn-outline"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title="Previous Page"
        >
          ‹ Prev
        </button>

        <div className="pagination-pages">
          {getPageNumbers().map((p, idx) => (
            <React.Fragment key={idx}>
              {p === '...' ? (
                <span className="pagination-ellipsis">...</span>
              ) : (
                <button
                  className={`btn btn-sm ${p === currentPage ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        <button
          className="btn btn-sm btn-outline"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title="Next Page"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
