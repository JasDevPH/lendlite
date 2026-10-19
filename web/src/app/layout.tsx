import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Inter: a highly legible UI typeface, common in fintech. next/font self-hosts
// it at build time (no request to Google from the user's browser).
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'LendLite — Personal loans, decided fast',
    template: '%s · LendLite',
  },
  description: 'Apply for a personal loan from $2,000 to $50,000 online and track your application in real time.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-AU" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
