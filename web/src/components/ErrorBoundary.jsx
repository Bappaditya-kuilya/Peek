import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <div className="app-frame">
            <div className="panel" style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
              <h2 className="section-title">Something went wrong</h2>
              <p className="helper-copy" style={{ marginBottom: 16 }}>
                An unexpected error crashed this screen. You can reload to try again.
              </p>
              <button
                type="button"
                className="button-primary"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
