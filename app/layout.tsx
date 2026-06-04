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
      <head>
        {/* Tailwind CDN with custom brand colors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    brand: {
                      50: '#f0fdf4',
                      100: '#dcfce7',
                      200: '#bbf7d0',
                      300: '#86efac',
                      400: '#4ade80',
                      500: '#22c55e',
                      600: '#16a34a',
                      700: '#15803d',
                      800: '#166534',
                      900: '#14532d',
                    }
                  }
                }
              }
            }`,
          }}
        />
        <script src="https://cdn.tailwindcss.com"></script>

        {/* Inter font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased bg-gray-50 text-gray-900 font-sans"
        style={{ margin: 0, fontFamily: "'Inter', sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}