import { Component } from "react";
import { RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-dvh flex items-center justify-center p-6 bg-base-200">
        <div className="surface p-8 max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-base-content/70">
            The page hit an unexpected error. Reloading usually fixes it.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
