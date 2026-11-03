import type { Metadata } from 'next';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ModalProvider } from '@/components/ui/modal-dialog';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'Specter — Web Change Monitor',
  description: 'Minimalist web monitoring and structured change detection.',
  icons: {
    icon: [
      { url: `${basePath}/favicon.ico`, sizes: '32x32' },
      { url: `${basePath}/icon.svg`, type: 'image/svg+xml' },
      { url: `${basePath}/icon.png`, type: 'image/png' },
    ],
    shortcut: `${basePath}/favicon.ico`,
    apple: `${basePath}/icon.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var saved = localStorage.getItem('specter-theme');
                if (saved === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-foreground selection:text-background">
        <QueryProvider>
          <ThemeProvider>
            <ModalProvider>{children}</ModalProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
