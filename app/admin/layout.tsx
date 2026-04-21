"use client";

import {
  LayoutDashboard,
  Users,
  FileCheck,
  LogOut,
  Bell,
  Terminal,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/lib/theme";

const adminNavItems = [
  {
    name: "Quản lý cuộc thi",
    href: "/admin/contests",
    icon: LayoutDashboard,
  },
  {
    name: "Quản lý người dùng",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "Kiểm tra bài nộp",
    href: "/admin/submissions",
    icon: FileCheck,
  },
];

const SIDEBAR_COLLAPSED = 72;
const SIDEBAR_EXPANDED = 240;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { isDark, toggle: toggleTheme } = useTheme();
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="min-h-full flex">
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 bottom-0 bg-surface-container-low flex flex-col overflow-hidden transition-all duration-300"
        style={{ width: sidebarWidth }}
      >
        {/* Profile Section */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-on-primary" />
          </div>
          <div className={collapsed ? "hidden" : "block min-w-0"}>
            <div className="text-xs font-semibold text-on-surface truncate">
              Admin Hệ thống
            </div>
            <div className="text-xs text-on-surface-variant truncate">
              Quản trị viên
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-2">
            {adminNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-primary-container/20 text-primary font-semibold"
                        : "text-on-surface-variant hover:bg-surface-container-high/20"
                    }`}
                    title={item.name}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span
                      className={`text-sm truncate transition-opacity duration-200 ${
                        collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                      }`}
                    >
                      {item.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-outline-variant/20">
          <button
            className="flex items-center gap-2 px-3 py-2 rounded text-on-surface-variant hover:bg-surface-container-high/20 transition-colors w-full whitespace-nowrap"
            aria-label="Logout"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span
              className={`text-sm transition-opacity duration-200 ${
                collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
              }`}
            >
              Đăng xuất
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col min-h-full transition-all duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20">
          <div className="h-14 px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="p-2 rounded hover:bg-surface-container-high/20 transition-colors"
                aria-label={collapsed ? "Mở sidebar" : "Thu gọn sidebar"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="w-5 h-5 text-on-surface-variant" />
                ) : (
                  <PanelLeftClose className="w-5 h-5 text-on-surface-variant" />
                )}
              </button>
              <Terminal className="w-5 h-5 text-primary" />
              <span className="text-lg font-semibold text-on-surface">
                Logical Architect Admin
              </span>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded hover:bg-surface-container-high/20 transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-on-surface-variant" />
              ) : (
                <Moon className="w-5 h-5 text-on-surface-variant" />
              )}
            </button>
            <button
              className="p-2 rounded hover:bg-surface-container-high/20 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-surface">{children}</main>
      </div>
    </div>
  );
}
