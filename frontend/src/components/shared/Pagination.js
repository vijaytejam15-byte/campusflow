import React from "react";

/**
 * Pagination — page-navigation controls.
 *
 * Props
 * ─────
 * page        {number}   current page (1-indexed)
 * totalPages  {number}   total number of pages
 * onPageChange{function} called with the new page number
 * disabled    {boolean}  disables all controls while data is loading
 */
export default function Pagination({ page, totalPages, onPageChange, disabled = false }) {
  if (totalPages <= 1) return null;

  // Build a window of page numbers: always show first, last, and up to 3
  // pages around the current page, with ellipsis gaps where needed.
  function pageNumbers() {
    const pages = [];
    const delta = 1; // pages to show either side of current

    const rangeStart = Math.max(2, page - delta);
    const rangeEnd   = Math.min(totalPages - 1, page + delta);

    pages.push(1);

    if (rangeStart > 2) pages.push("...");

    for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);

    if (rangeEnd < totalPages - 1) pages.push("...");

    if (totalPages > 1) pages.push(totalPages);

    return pages;
  }

  return (
    <nav className="cf-pagination" aria-label="Pagination">
      {/* Previous */}
      <button
        type="button"
        className="cf-pagination__btn"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous page"
      >
        ‹
      </button>

      {/* Page numbers */}
      {pageNumbers().map((p, idx) =>
        p === "..." ? (
          <span key={`ellipsis-${idx}`} className="cf-pagination__ellipsis" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`cf-pagination__btn${p === page ? " cf-pagination__btn--active" : ""}`}
            onClick={() => p !== page && onPageChange(p)}
            disabled={disabled || p === page}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}

      {/* Next */}
      <button
        type="button"
        className="cf-pagination__btn"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}
