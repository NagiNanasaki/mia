import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mia — English Practice Chat",
  description: "Chat with Mia, your friendly British anime-loving English practice buddy!",
  other: {
    'theme-color': '#ffffff',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Sync dark mode before first paint to prevent flash + fix iOS status bar */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var dark = localStorage.getItem('mia_dark') === '1';
            if (dark) {
              document.documentElement.classList.add('dark');
              document.documentElement.style.backgroundColor = '#111827';
              document.body && (document.body.style.backgroundColor = '#111827');
              var m = document.querySelector('meta[name="theme-color"]');
              if (m) m.setAttribute('content', '#111827');
            }
          })();
        `}} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
