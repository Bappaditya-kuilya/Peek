import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PendingViewers } from './PendingViewers.jsx';

describe('PendingViewers', () => {
  it('renders nothing when no pending viewers', () => {
    const { container } = render(<PendingViewers viewers={[]} onApprove={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows viewer name + Approve button', () => {
    render(<PendingViewers viewers={[{ receiverId: 'r1', viewerName: 'Alice' }]} onApprove={() => {}} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Approve')).toBeTruthy();
  });

  it('calls onApprove with receiverId', () => {
    const onApprove = vi.fn();
    render(<PendingViewers viewers={[{ receiverId: 'r1', viewerName: 'Alice' }]} onApprove={onApprove} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('r1');
  });
});
