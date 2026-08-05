import { HomeLauncher } from "@/components/HomeLauncher";

export default function HomePage() {
  return (
    <main className="home-shell">
      <div className="home-noise" aria-hidden="true" />
      <section className="home-card">
        <header className="brand-row">
          <a className="brand" href="/" aria-label="PB 홈">PB<span className="brand-dot">.</span></a>
          <span className="permanent-badge">NO TIMER</span>
        </header>

        <div className="hero-copy">
          <p className="eyebrow">PUBLIC POCKET · 00—99</p>
          <h1>번호 하나면<br />끝.</h1>
          <p className="hero-subtitle">로그인도, 만료 시간도 없습니다. 같은 번호를 다른 기기에서 열면 텍스트와 파일이 그대로 있습니다.</p>
        </div>

        <HomeLauncher />

        <footer className="home-footer">
          <span>영구 보관 · 공간 부족 시 오래된 슬롯부터 정리</span>
          <span>민감한 정보 저장 금지</span>
        </footer>
      </section>
    </main>
  );
}
