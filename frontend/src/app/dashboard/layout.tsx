import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — Monitors',
  description: 'Manage scheduled web extraction monitors and structured change detection.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/dashboard/',
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
