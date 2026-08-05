import type { Metadata, Viewport } from "next";
import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "PB";

export const metadata: Metadata = {
  title: {
    default: `${appName} — instant pocket`,
    template: `%s — ${appName}`,
  },
  description: "0~99 번호 하나로 텍스트와 작은 파일을 빠르게 넘기는 공용 포켓.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f5f2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
