import Link from "next/link";

export default function NotFound() {
  return (
    <main className="simple-page">
      <div className="simple-card">
        <p className="eyebrow">NOT FOUND</p>
        <h1>없는 슬롯입니다.</h1>
        <p>PB 슬롯 번호는 0부터 99까지입니다.</p>
        <Link href="/" className="primary-link">홈으로 돌아가기</Link>
      </div>
    </main>
  );
}
