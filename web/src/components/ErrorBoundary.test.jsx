import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.jsx';

function ThrowingComponent() {
  throw new Error('test crash');
}

function GoodComponent() {
  return <div>all good</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><GoodComponent /></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('shows recovery UI on render error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><ThrowingComponent /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();
    spy.mockRestore();
  });

  it('Reload button triggers page reload', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true });
    render(<ErrorBoundary><ThrowingComponent /></ErrorBoundary>);
    fireEvent.click(screen.getByText('Reload'));
    expect(reloadSpy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
