import type { Metadata, Viewport } from "next"
import "./globals.css"
import { AppChrome } from "./app-chrome"

export const metadata: Metadata = {
  title: "Lebombo Job Cards",
  description: "Log job cards in the field, with or without signal.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Job Cards",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays on: a technician may need to check a signature or a
  // serial number they have just typed.
  maximumScale: 5,
  themeColor: "#121212",
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
