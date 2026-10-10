import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import Nav from '@/components/Nav';
import HelpBot from '@/components/HelpBot';
import { MonthProvider } from '@/lib/monthStore';

export const metadata = { title: 'Robot24.com Field Team', description: 'Field crew directory, contracts and payments' };
export const viewport = { themeColor: '#0f1d44' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@500;600;700;800&family=Michroma&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>
          <MonthProvider>
            <Nav />
            <main>{children}</main>
            <HelpBot />
          </MonthProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
