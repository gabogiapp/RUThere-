import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RUThere - Rutgers Instagram Scraper & Event Aggregator",
  description: "Asynchronous Bright Data Instagram scraper test application for Rutgers club events.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
