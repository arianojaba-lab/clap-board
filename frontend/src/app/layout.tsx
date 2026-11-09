import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clap Board",
  description: "A calm, colorful space to plan and move work forward.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
