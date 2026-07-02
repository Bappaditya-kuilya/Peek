import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressBar } from './ProgressBar.jsx';

describe('ProgressBar', () => {
  it('renders progress bar for mid-range values', () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
    expect(container.querySelector('.file-progress-bar').style.width).toBe('50%');
  });

  it('hides when value is 0 or 100', () => {
    const { container } = render(<ProgressBar value={0} />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    const { container: c2 } = render(<ProgressBar value={100} />);
    expect(c2.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('shows error state with retry button', () => {
    const onRetry = vi.fn();
    render(<ProgressBar error onRetry={onRetry} />);
    expect(screen.getByText('Retry')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('hides retry button when no onRetry provided', () => {
    render(<ProgressBar error />);
    expect(screen.queryByText('Retry')).toBeNull();
  });
});
