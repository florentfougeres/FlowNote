import { Component, type ReactNode } from "react";
import { reportError } from "./errors";

interface State {
  error: Error | null;
}

/** A rendering error shows what happened instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportError(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="crash">
        <h1>Une erreur est survenue</h1>
        <p>Vos notes ne sont pas affectées : rien n'a été écrit.</p>
        <pre>{`${error.message}\n\n${error.stack ?? ""}`}</pre>
        <button onClick={() => location.reload()}>Recharger l'application</button>
      </main>
    );
  }
}
