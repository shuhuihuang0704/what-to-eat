import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What to Eat",
  description: "会管理冰箱，也会陪你做饭的家庭食品管家。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
