export default function LoadingSlot() {
  return (
    <main className="slot-shell" aria-busy="true">
      <header className="slot-topbar">
        <span className="skeleton square" />
        <span className="slot-brand">PB<span>.</span></span>
        <span className="skeleton pill" />
      </header>
      <div className="workspace-grid">
        <section className="editor-panel skeleton-panel" />
        <aside className="side-panel skeleton-panel" />
      </div>
    </main>
  );
}
