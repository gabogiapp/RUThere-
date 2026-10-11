import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RUThere - Rutgers University Club & Campus Events Calendar",
  description: "Explore, track, and synchronize all Rutgers University student club events in real time.",
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
