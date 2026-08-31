import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const fontHeading = Geist({
  subsets: ["latin"],
  variable: "--font-heading-base",
});

const fontSans = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans-base",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-base",
});

export const metadata: Metadata = {
  title: {
    default: "Promotion Application Portal",
    template: "%s · MIT Promotion Portal",
  },
  description:
    "Internal promotion application portal for Manipal Institute of Technology.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        fontHeading.variable,
        fontSans.variable,
        fontMono.variable,
      )}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster richColors closeButton position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
