import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Queue Dashboard",
  description: "Mini job queue management dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
