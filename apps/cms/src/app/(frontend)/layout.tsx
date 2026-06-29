import React from "react";
import "./globals.css";

export const metadata = {
  title: "CoSiMo",
  description: "Agentic AI for inclusive mobility — InnoTrans 2026 showcase.",
};

/**
 * Frontend (PWA + host console) root layout. Renders its own <html>/<body>;
 * the Payload admin route group has a separate root layout.
 */
export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
