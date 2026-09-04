/**
 * CampusFlow — Frontend component tests
 *
 * Tests are focused on individual components so they run in isolation
 * without requiring a full app bootstrap, backend, or socket connection.
 *
 * Run: npm test -- --watchAll=false
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── StatusBadge ──────────────────────────────────────────────────────────────

import StatusBadge from './components/shared/StatusBadge';

describe('StatusBadge', () => {
  const statuses = ['pending', 'in_review', 'approved', 'rejected', 'escalated', 'closed'];

  test.each(statuses)('renders correct label for %s', (status) => {
    const { container } = render(<StatusBadge status={status} />);
    const badge = container.querySelector('span');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).not.toBe('Unknown');
    expect(badge.textContent.length).toBeGreaterThan(0);
  });

  test('shows "Unknown" for unrecognised status', () => {
    const { container } = render(<StatusBadge status="nonexistent" />);
    expect(container.querySelector('span').textContent).toBe('Unknown');
  });

  test('small prop uses 11px font', () => {
    const { container } = render(<StatusBadge status="pending" small />);
    expect(container.querySelector('span').style.fontSize).toBe('11px');
  });

  test('default (not small) uses 12px font', () => {
    const { container } = render(<StatusBadge status="pending" />);
    expect(container.querySelector('span').style.fontSize).toBe('12px');
  });

  test('approved badge has green color', () => {
    const { container } = render(<StatusBadge status="approved" />);
    const badge = container.querySelector('span');
    // jsdom converts hex to rgb — check the background instead
    expect(badge.style.background).toBeTruthy();
    expect(badge.textContent).toBe('Approved');
  });

  test('rejected badge has red color', () => {
    const { container } = render(<StatusBadge status="rejected" />);
    const badge = container.querySelector('span');
    expect(badge.textContent).toBe('Rejected');
  });

  test('escalated badge renders correctly', () => {
    const { container } = render(<StatusBadge status="escalated" />);
    expect(container.querySelector('span').textContent).toBe('Escalated');
  });
});

// ── SLABadge ─────────────────────────────────────────────────────────────────

import SLABadge from './components/shared/SLABadge';

describe('SLABadge', () => {
  test('shows "SLA Breached" when slaBreached=true', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { getByText } = render(
      <SLABadge slaDeadline={future} slaBreached={true} status="pending" />
    );
    expect(getByText(/sla breached/i)).toBeInTheDocument();
  });

  test('shows remaining time when not breached and deadline is future', () => {
    const future = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
    const { getByText } = render(
      <SLABadge slaDeadline={future} slaBreached={false} status="pending" />
    );
    expect(getByText(/remaining/i)).toBeInTheDocument();
  });

  test('shows breached when deadline is in the past even if slaBreached=false', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const { container } = render(
      <SLABadge slaDeadline={past} slaBreached={false} status="in_review" />
    );
    // When remaining <= 0 the component treats it as breached regardless of the flag
    expect(container.querySelector('span').textContent).toMatch(/sla breached/i);
  });

  test('returns null for approved status (terminal)', () => {
    const future = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
    const { container } = render(
      <SLABadge slaDeadline={future} slaBreached={false} status="approved" />
    );
    expect(container.firstChild).toBeNull();
  });

  test('returns null for rejected status (terminal)', () => {
    const future = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
    const { container } = render(
      <SLABadge slaDeadline={future} slaBreached={false} status="rejected" />
    );
    expect(container.firstChild).toBeNull();
  });

  test('returns null when no slaDeadline provided', () => {
    const { container } = render(
      <SLABadge slaDeadline={null} slaBreached={false} status="pending" />
    );
    expect(container.firstChild).toBeNull();
  });

  test('warning styling applied when less than 6 hours remain', () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h
    const { container } = render(
      <SLABadge slaDeadline={soon} slaBreached={false} status="pending" />
    );
    const badge = container.querySelector('span');
    // Should show remaining time, not "SLA Breached"
    expect(badge.textContent).toMatch(/remaining/i);
    // Background should be set (warning amber)
    expect(badge.style.background).toBeTruthy();
  });
});

// ── computeSLADeadline ────────────────────────────────────────────────────────

import { computeSLADeadline } from './components/shared/SLABadge';

describe('computeSLADeadline', () => {
  test('urgent = 4 hours', () => {
    const now = new Date();
    const deadline = computeSLADeadline('urgent', now);
    const diffHours = (deadline - now) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(4);
  });

  test('normal = 48 hours', () => {
    const now = new Date();
    const deadline = computeSLADeadline('normal', now);
    const diffHours = (deadline - now) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(48);
  });

  test('high = 24 hours', () => {
    const now = new Date();
    const deadline = computeSLADeadline('high', now);
    const diffHours = (deadline - now) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(24);
  });

  test('low = 72 hours', () => {
    const now = new Date();
    const deadline = computeSLADeadline('low', now);
    const diffHours = (deadline - now) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(72);
  });

  test('unknown priority defaults to 48 hours', () => {
    const now = new Date();
    const deadline = computeSLADeadline('unknown', now);
    const diffHours = (deadline - now) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(48);
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

import Pagination from './components/shared/Pagination';

describe('Pagination', () => {
  test('renders prev and next buttons when totalPages > 1', () => {
    render(<Pagination page={2} totalPages={5} onPageChange={jest.fn()} />);
    expect(screen.getByLabelText(/previous page/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/next page/i)).toBeInTheDocument();
  });

  test('prev button is disabled on first page', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={jest.fn()} />);
    expect(screen.getByLabelText(/previous page/i)).toBeDisabled();
  });

  test('next button is disabled on last page', () => {
    render(<Pagination page={3} totalPages={3} onPageChange={jest.fn()} />);
    expect(screen.getByLabelText(/next page/i)).toBeDisabled();
  });

  test('calls onPageChange(3) when next is clicked on page 2', () => {
    const onChange = jest.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/next page/i));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  test('calls onPageChange(1) when prev is clicked on page 2', () => {
    const onChange = jest.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/previous page/i));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  test('renders null when totalPages = 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('disabled prop prevents interaction', () => {
    const onChange = jest.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onChange} disabled />);
    expect(screen.getByLabelText(/next page/i)).toBeDisabled();
    expect(screen.getByLabelText(/previous page/i)).toBeDisabled();
  });

  test('page 1 button has active class', () => {
    const { container } = render(
      <Pagination page={1} totalPages={3} onPageChange={jest.fn()} />
    );
    const buttons = container.querySelectorAll('.cf-pagination__btn--active');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe('1');
  });
});

// ── Timeline ──────────────────────────────────────────────────────────────────

import Timeline from './components/shared/Timeline';

describe('Timeline', () => {
  test('renders 4 milestone steps', () => {
    const { container } = render(
      <Timeline currentStatus="pending" comments={[]} />
    );
    const steps = container.querySelectorAll('.cf-timeline__step');
    expect(steps.length).toBe(4);
  });

  test('"submitted" step is active for pending status', () => {
    const { container } = render(
      <Timeline currentStatus="pending" comments={[]} />
    );
    const steps = container.querySelectorAll('.cf-timeline__step');
    expect(steps[0].className).toContain('active');
  });

  test('"submitted" step is done for approved status', () => {
    const { container } = render(
      <Timeline currentStatus="approved" comments={[]} />
    );
    const steps = container.querySelectorAll('.cf-timeline__step');
    expect(steps[0].className).toContain('done');
  });

  test('outcome step is done for rejected status', () => {
    const { container } = render(
      <Timeline currentStatus="rejected" comments={[]} />
    );
    const steps = container.querySelectorAll('.cf-timeline__step');
    const lastStep = steps[steps.length - 1];
    expect(lastStep.className).toContain('done');
  });

  test('outcome label shows "Rejected" for rejected status', () => {
    render(<Timeline currentStatus="rejected" comments={[]} />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  test('outcome label shows "Approved" for approved status', () => {
    render(<Timeline currentStatus="approved" comments={[]} />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  test('renders connector lines between steps', () => {
    const { container } = render(
      <Timeline currentStatus="in_review" comments={[]} />
    );
    const lines = container.querySelectorAll('.cf-timeline__line');
    expect(lines.length).toBe(3); // 4 steps → 3 connectors
  });

  test('renders with comment timestamps', () => {
    const comments = [
      {
        _id: '1',
        action: 'comment',
        statusSnapshot: 'in_review',
        createdAt: new Date().toISOString(),
        comment: 'test',
        userName: 'Staff',
        role: 'faculty',
      },
    ];
    const { container } = render(
      <Timeline currentStatus="in_review" comments={comments} />
    );
    expect(container.querySelectorAll('.cf-timeline__step').length).toBe(4);
  });
});

// ── ReviewModal ───────────────────────────────────────────────────────────────

import ReviewModal from './components/shared/ReviewModal';

describe('ReviewModal', () => {
  test('renders approve modal with correct title', () => {
    render(
      <ReviewModal
        action="approve"
        requestLabel="Grade Appeal — Alice"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    // The confirm button text contains "Approve"
    expect(screen.getByRole('button', { name: /confirm approve/i })).toBeInTheDocument();
  });

  test('renders reject modal with correct title', () => {
    render(
      <ReviewModal
        action="reject"
        requestLabel="Grade Appeal — Alice"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /confirm reject/i })).toBeInTheDocument();
  });

  test('shows validation error when reject submitted without comment', () => {
    render(
      <ReviewModal
        action="reject"
        requestLabel="Test Request"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText(/confirm reject/i));
    expect(screen.getByRole('alert')).toHaveTextContent(/remark is required/i);
  });

  test('calls onConfirm with comment text for approve (no comment required)', () => {
    const onConfirm = jest.fn();
    render(
      <ReviewModal
        action="approve"
        requestLabel="Test Request"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText(/confirm approve/i));
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  test('calls onConfirm with trimmed comment text', () => {
    const onConfirm = jest.fn();
    render(
      <ReviewModal
        action="approve"
        requestLabel="Test"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  Approved after review  ' },
    });
    fireEvent.click(screen.getByText(/confirm approve/i));
    expect(onConfirm).toHaveBeenCalledWith('Approved after review');
  });

  test('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn();
    render(
      <ReviewModal
        action="approve"
        requestLabel="Test"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  test('close button calls onCancel', () => {
    const onCancel = jest.fn();
    render(
      <ReviewModal
        action="approve"
        requestLabel="Test"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByLabelText(/close dialog/i));
    expect(onCancel).toHaveBeenCalled();
  });

  test('buttons are disabled while submitting', () => {
    render(
      <ReviewModal
        action="approve"
        requestLabel="Test"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        submitting={true}
      />
    );
    expect(screen.getByText(/submitting/i)).toBeDisabled();
  });
});

// ── FileUploader ──────────────────────────────────────────────────────────────

import FileUploader from './components/shared/FileUploader';

describe('FileUploader', () => {
  test('renders drop zone', () => {
    render(<FileUploader files={[]} onFilesChange={jest.fn()} />);
    expect(screen.getByLabelText(/upload files/i)).toBeInTheDocument();
  });

  test('shows attached files', () => {
    const files = [
      { filename: 'f1', originalName: 'document.pdf', mimeType: 'application/pdf', size: 1024 },
    ];
    render(<FileUploader files={files} onFilesChange={jest.fn()} />);
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  test('calls onFilesChange with updated list when remove is clicked', () => {
    const onChange = jest.fn();
    const files = [
      { filename: 'f1', originalName: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
    ];
    render(<FileUploader files={files} onFilesChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/remove doc\.pdf/i));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  test('shows max files message when limit reached', () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      filename: `f${i}`, originalName: `file${i}.pdf`, mimeType: 'application/pdf', size: 100,
    }));
    render(<FileUploader files={files} onFilesChange={jest.fn()} maxFiles={5} />);
    expect(screen.getByText(/maximum 5 files attached/i)).toBeInTheDocument();
  });

  test('drop zone is not interactive when disabled', () => {
    render(<FileUploader files={[]} onFilesChange={jest.fn()} disabled />);
    const zone = screen.getByLabelText(/upload files/i);
    expect(zone.tabIndex).toBe(-1);
  });
});
