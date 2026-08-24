"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app-store"
import {
  LayoutDashboard,
  LineChart,
  BookOpen,
  Target,
  Eye,
  Brain,
  Shield,
  Settings,
  TrendingUp,
  Calendar,
  FileText,
  X,
  ArrowLeftRight,
} from "lucide-react"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/strategies", label: "Strategies", icon: Target },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/psychology", label: "Psychology", icon: Brain },
  { href: "/risk", label: "Risk", icon: Shield },
  { href: "/ai-review", label: "AI Review", icon: TrendingUp },
  { href: "/import", label: "Import", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen } = useAppStore()

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          "border-r",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: "var(--sidebar-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between h-16 px-6 border-b"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <Link href="/dashboard" className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-500" />
            <span className="font-bold text-lg" style={{ color: "var(--sidebar-text-active)" }}>
              SOFIA
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden transition-colors"
            style={{ color: "var(--sidebar-text)" }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="p-4 space-y-0.5 overflow-y-auto h-[calc(100%-4rem)]">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                )}
                style={
                  isActive
                    ? {
                        background: "var(--sidebar-active-bg)",
                        color: "var(--sidebar-text-active)",
                      }
                    : {
                        color: "var(--sidebar-text)",
                      }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background =
                      "var(--sidebar-hover-bg)"
                    ;(e.currentTarget as HTMLElement).style.color =
                      "var(--sidebar-hover-text)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background =
                      "transparent"
                    ;(e.currentTarget as HTMLElement).style.color =
                      "var(--sidebar-text)"
                  }
                }}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
