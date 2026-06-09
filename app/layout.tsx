import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm',
});

export const metadata: Metadata = {
  title: 'Tradesheet — Options Tracker',
  description: 'Personal options trade journal for ThinkOrSwim / Charles Schwab',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={ibmPlexSans.className} style={{ height: '100%', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
