export default function LoadingSlot() {
  return (
    <main className="pb-screen" aria-busy="true">
      <div className="pb-aurora" aria-hidden="true" />
      <section className="pb-glass-card pb-skeleton">
        <header className="pb-brand">Project<br />PB</header>
        <span className="pb-slot-number">--</span>
        <div className="pb-editor" />
      </section>
    </main>
  );
}
