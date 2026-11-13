import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Acceptable usage, service availability, and terms of service for Specter.',
  alternates: {
    canonical: '/terms/',
  },
  openGraph: {
    title: 'Terms of Service | Specter',
    description: 'Acceptable usage, service availability, and terms of service for Specter.',
    url: '/terms/',
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
