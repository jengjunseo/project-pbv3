"use client";

import Link from "next/link";

export default function SlotError({ reset }: { reset: () => void }) {
  return (
    <main className="simple-page">
      <div className="simple-card">
        <p className="eyebrow">CONNECTION ERROR</p>
        <h1>슬롯을 불러오지 못했습니다.</h1>
        <p>저장소 연결을 확인한 뒤 다시 시도하세요.</p>
        <div className="simple-actions">
          <button className="primary-link" onClick={reset}>다시 시도</button>
          <Link href="/" className="secondary-link">홈으로</Link>
        </div>
      </div>
    </main>
  );
}
