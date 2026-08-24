"use client"

import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { ToastProvider } from "@/components/ui/toast"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--background)" }}>
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <main
            className="flex-1 overflow-y-auto p-4 lg:p-6"
            style={{ background: "var(--background)", color: "var(--foreground)" }}
          >
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
