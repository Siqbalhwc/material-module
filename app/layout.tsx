import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Material Management",
  description: "Material flow tracking — gate pass to dispatch",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900 font-sans" style={{ fontFamily: "'Inter', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}