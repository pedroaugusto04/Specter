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
    default: 'Specter — Web Change Monitor & Structured Extraction',
    template: '%s | Specter',
  },
  description:
    'Minimalist web monitoring, structured change detection, and automated alerts via Telegram and Webhooks.',
  applicationName: 'Specter',
  authors: [{ name: 'Specter Team' }],
  generator: 'Next.js',
  keywords: [
    'Specter',
    'web change monitor',
    'website monitoring',
    'visual diff tracker',
    'web change detector',
    'automated web scraping',
    'data extraction',
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
    title: 'Specter — Web Change Monitor & Structured Extraction',
    description: 'Scheduled web extraction, visual change detection, and automated notifications.',
    images: [
      {
        url: `${basePath}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Specter — Web Change Monitor & Structured Extraction',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Specter — Web Change Monitor',
    description: 'Minimalist web monitoring and structured change detection.',
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
      description:
        'Minimalist web monitoring and structured change detection with visual diffs and automated alerts.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      featureList: [
        'Automated Web Scraping and Monitoring',
        'Visual Diff Slider & Screenshot Comparison',
        'No-Code Structured Data Extraction',
        'Scheduled Cron Jobs',
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
            text: 'Specter is an automated website change monitoring and structured data extraction tool that tracks visual differences and extracts structured data on scheduled cron intervals.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does Specter detect website changes?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Specter runs scheduled headless browser crawls to take page snapshots, analyze content hash differences, compare visual diffs side-by-side, and extract targeted data structures.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can Specter monitor dynamic JavaScript websites?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Specter uses Playwright headless browser engines that wait for network idle and dynamic JavaScript hydration before inspecting the page.',
          },
        },
        {
          '@type': 'Question',
          name: 'What notification channels does Specter support for change alerts?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Specter supports instant notifications via Telegram bots, custom Webhooks (for Discord, Slack, Zapier), and direct email alerts.',
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
