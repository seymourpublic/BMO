import React from 'react';

interface State {
  crashed: boolean;
}

// If anything in the app crashes, show a friendly restart screen instead of a blank page
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('BMO crashed:', error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center bg-[#bfe9dd] text-[#173a33]">
        <div className="text-5xl" aria-hidden="true">😵</div>
        <p className="font-bold">Oh no! BMO's circuits got scrambled.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full px-6 py-3 font-bold text-white bg-[#e43d3d] shadow"
        >
          Restart BMO
        </button>
      </div>
    );
  }
}
