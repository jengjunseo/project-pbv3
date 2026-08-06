import { HomeLauncher } from "@/components/HomeLauncher";

export default function HomePage() {
  return (
    <main className="home-shell minimal-home">
      <div className="home-noise" aria-hidden="true" />
      <section className="home-card minimal-home-card">
        <div className="minimal-brand">Project<br />PB</div>
        <HomeLauncher />
      </section>
    </main>
  );
}
