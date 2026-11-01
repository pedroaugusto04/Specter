import type { Metadata } from 'next';
import { ModalProvider } from '@/components/ui/modal-dialog';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dynamic Scrapper — Autonomous AI Web Monitor',
  description:
    'Web scraping and monitoring platform combining single-turn AI compilation with continuous deterministic execution.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <ModalProvider>{children}</ModalProvider>
      </body>
    </html>
  );
}
