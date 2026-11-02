import type { Metadata } from 'next';
import { ModalProvider } from '@/components/ui/modal-dialog';
import './globals.css';

export const metadata: Metadata = {
  title: 'Specter — Autonomous Web Monitor',
  description: 'Minimalist autonomous web monitoring and change detection platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <ModalProvider>{children}</ModalProvider>
      </body>
    </html>
  );
}
