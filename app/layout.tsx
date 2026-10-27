import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SITE } from "@/lib/site-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Turn your manga or webtoon chapter into a vertical video ready for TikTok, Reels and Shorts: AI-animated panels, titles and captions. A Nexulys SaaS.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "KomaMotion AI — A Nexulys SaaS",
    template: "%s · KomaMotion AI",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "KomaMotion AI — Your manga chapter, ready to post",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "KomaMotion AI — Your manga chapter, ready to post",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
