"use client";

import { Home, Trophy, Upload, Sun, Moon, LogOut, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { name: "Home", href: "/", icon: Home },
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { name: "Submit", href: "/submit", icon: Upload },
];

export default function ContestantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  return (
    <div className="min-h-full flex flex-col">
      {/* TopAppBar */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-primary">Logical Architect</span>
          </div>

          {/* Centered Nav - Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-white text-primary font-semibold"
                      : "text-on-surface-variant hover:bg-surface-container-high/20"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Right side - User controls */}
          <div className="flex items-center gap-3">
            <span className="hidden md:block text-sm text-on-surface-variant">
              Xin chao, <span className="font-medium text-on-surface">User</span>
            </span>
            <User className="w-5 h-5 text-on-surface-variant" />
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded hover:bg-surface-container-high/20 transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              className="p-2 rounded hover:bg-surface-container-high/20 transition-colors"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* BottomNav - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl border-t border-outline-variant/20">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 px-4 py-2 ${
                  isActive
                    ? "text-primary font-medium"
                    : "text-on-surface-variant"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom padding for mobile nav */}
      <div className="md:hidden h-16" />
    </div>
  );
}