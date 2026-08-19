import type { Metadata } from 'next';
import './globals.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: {
    default: 'RV Parks & Campgrounds Directory — Texas',
    template: '%s | RV Parks & Campgrounds',
  },
  description:
    'Data-driven directory of campgrounds and RV parks in Texas, built from Recreation.gov public facility data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main className="container">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
