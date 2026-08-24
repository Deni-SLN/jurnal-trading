import { create } from "zustand"
import { Trade, Strategy, WatchlistItem, User } from "@/types/database"

interface AppState {
  user: User | null
  setUser: (user: User | null) => void
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  selectedPeriod: string
  setSelectedPeriod: (period: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  selectedPeriod: "30D",
  setSelectedPeriod: (period) => set({ selectedPeriod: period }),
}))
