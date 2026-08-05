import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PB — Pocket Bridge",
  description: "번호 하나로 텍스트와 파일을 빠르게 넘기는 로그인 없는 공용 포켓",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
