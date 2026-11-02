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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-indigo-500/20 selection:text-indigo-200">
        <ModalProvider>{children}</ModalProvider>
      </body>
    </html>
  );
}
