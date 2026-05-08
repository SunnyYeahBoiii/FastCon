import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "FastCons - Judge Platform",
  description: "PKL Judge platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const initialThemeClass = themeCookie === "dark" ? "dark" : "";

  return (
    <html
      lang="vi"
      className={`h-full ${initialThemeClass}`.trim()}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem("theme");
                  if (!saved) {
                    var cookie = document.cookie
                      .split("; ")
                      .find(function(entry) { return entry.startsWith("theme="); });
                    if (cookie) saved = cookie.split("=")[1];
                  }
                  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  var dark = saved === "dark" || (!saved && prefersDark);
                  document.documentElement.classList.toggle("dark", dark);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
