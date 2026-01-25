import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ValueEdge | Sports Betting Intelligence",
  description: "Real-time value bet finder that identifies betting opportunities across multiple bookmakers. Discover edges and maximize your expected value.",
  keywords: ["sports betting", "value betting", "odds comparison", "betting edge", "expected value"],
  authors: [{ name: "ValueEdge" }],
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "ValueEdge | Sports Betting Intelligence",
    description: "Real-time value bet finder that identifies betting opportunities across multiple bookmakers.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
