"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={className} data-value={value}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { _value: value, _onValueChange: onValueChange })
        }
        return child
      })}
    </div>
  )
}

function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { _value?: string; _onValueChange?: (v: string) => void }) {
  const { _value, _onValueChange, ...rest } = props as any
  return (
    <div className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-gray-800/50 p-1 text-gray-400", className)} {...rest}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { _value, _onValueChange })
        }
        return child
      })}
    </div>
  )
}

function TabsTrigger({ className, value, children, _value, _onValueChange, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string; _value?: string; _onValueChange?: (v: string) => void }) {
  const isActive = _value === value
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all",
        isActive ? "bg-gray-700 text-gray-100 shadow" : "hover:text-gray-200",
        className
      )}
      onClick={() => _onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  )
}

function TabsContent({ value, children, className, _value, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string; _value?: string; _onValueChange?: (v: string) => void }) {
  if (_value !== value) return null
  const { _onValueChange, ...rest } = props as any
  return <div className={cn("mt-2", className)} {...rest}>{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
