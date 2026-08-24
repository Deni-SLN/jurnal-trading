"use client"

import { Menu, Bell, Moon, Sun, LogOut } from "lucide-react"
import { useAppStore } from "@/stores/app-store"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useTheme } from "@/components/providers"

export function Header() {
  const { toggleSidebar, user } = useAppStore()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <header
      className="h-16 border-b flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 backdrop-blur-sm"
      style={{
        background: "var(--header-bg)",
        borderColor: "var(--header-border)",
      }}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="lg:hidden transition-colors"
          style={{ color: "var(--muted-foreground)" }}
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-sm font-medium hidden sm:block" style={{ color: "var(--muted-foreground)" }}>
          SOFIA Trading Journal
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>

        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>

        <div
          className="flex items-center gap-3 ml-2 pl-2 border-l"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              {user?.full_name || user?.email || "User"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
