import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TidbitCapture from "./TidbitCapture";
import "./App.css";

type ErrorBoundaryState = {
  error: Error | null;
};

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-error-screen">
          <section className="app-error-card" role="alert">
            <h1>Glyphary hit a display error</h1>
            <p>{this.state.error.message}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootView =
  new URLSearchParams(window.location.search).get("view") === "tidbit-capture" ? (
    <TidbitCapture />
  ) : (
    <App />
  );

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{rootView}</ErrorBoundary>
  </React.StrictMode>,
);
