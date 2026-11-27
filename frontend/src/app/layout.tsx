import type { Metadata } from 'next';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ModalProvider } from '@/components/ui/modal-dialog';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://specterdev.online';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Specter — Website Change Monitor & Visual Diff Tracking',
    template: '%s | Specter',
  },
  description:
    'Track visual and content changes across any website. Automated scheduled monitoring and instant alerts whenever updates occur.',
  applicationName: 'Specter',
  authors: [{ name: 'Specter Team' }],
  generator: 'Next.js',
  keywords: [
    'Specter',
    'web change monitor',
    'website monitoring',
    'visual diff tracker',
    'web change detector',
    'website change detection',
    'cron scheduler',
    'telegram alerts',
  ],
  referrer: 'origin-when-cross-origin',
  creator: 'Specter Team',
  publisher: 'Specter',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: `${basePath}/favicon.ico`, sizes: '32x32' },
      { url: `${basePath}/icon.svg`, type: 'image/svg+xml' },
      { url: `${basePath}/icon.png`, type: 'image/png' },
    ],
    shortcut: `${basePath}/favicon.ico`,
    apple: `${basePath}/icon.png`,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Specter',
    title: 'Specter — Website Change Monitor & Visual Diff Tracking',
    description: 'Track visual and content changes across any website with automated alerts.',
    images: [
      {
        url: `${basePath}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Specter — Website Change Monitor',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Specter — Website Change Monitor',
    description: 'Track visual and content changes across any website with automated alerts.',
    images: [`${basePath}/og-image.png`],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Specter',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'All',
      url: siteUrl,
      codeRepository: 'https://github.com/pedroaugusto04/Specter',
      description: 'Website change monitoring and visual diff tracking with automated alerts.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      featureList: [
        'Website Change Monitoring',
        'Visual Diff Slider & Screenshot Comparison',
        'Scheduled Cron Monitoring',
        'Telegram and Webhook Alert Integrations',
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is Specter?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Specter is an automated website change monitoring tool that tracks visual and content differences on scheduled intervals.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does Specter detect website changes?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Specter takes periodic snapshots of your target pages and compares them side-by-side to highlight visual and content differences the moment they happen.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can Specter monitor dynamic JavaScript websites?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Specter fully renders modern dynamic pages and JavaScript before checking for updates.',
          },
        },
        {
          '@type': 'Question',
          name: 'What notification channels does Specter support for change alerts?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Specter supports instant notifications via Telegram, custom Webhooks (Discord, Slack, Zapier), and email alerts.',
          },
        },
      ],
    },
  ],
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
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
