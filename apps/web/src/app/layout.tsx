import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Institutional Knowledge Platform',
  description:
    'A search-first institutional document and knowledge platform. Find the authoritative source in seconds.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
