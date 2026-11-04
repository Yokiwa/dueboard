import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ fallback: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('DueBoard UI error', error);
  }

  override render() {
    if (this.state.failed) {
      return (
        <p role="alert" className="mx-auto max-w-xl p-8 text-center text-db-muted">
          {this.props.fallback}
        </p>
      );
    }
    return this.props.children;
  }
}
