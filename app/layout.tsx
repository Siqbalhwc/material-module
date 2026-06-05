export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Tailwind CSS CDN — instantly styles the entire app */}
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