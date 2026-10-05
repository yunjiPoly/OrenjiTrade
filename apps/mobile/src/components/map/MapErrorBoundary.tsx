import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface MapErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  /** Name in the console warning (e.g. `CollectorMap`). */
  name?: string;
}

interface MapErrorBoundaryState {
  failed: boolean;
}

/**
 * A native map must never take its screen down (missing key, unsupported device, ...): render the
 * fallback instead. Remount with a new `key` to retry.
 */
export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  override state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      `[${this.props.name ?? 'Map'}] map failed to render, showing the fallback`,
      error,
      info.componentStack
    );
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
