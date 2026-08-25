import { NextResponse } from "next/server"

export const preferredRegion = "sin1"
export const dynamic = "force-dynamic"

export async function GET() {
  const results: Record<string, unknown> = {
    vercelRegion: process.env.VERCEL_REGION ?? "unknown",
    proxySet: !!process.env.BYBIT_PROXY_URL,
  }

  // Direct call to Bybit
  try {
    const res = await fetch("https://api.bybit.com/v5/market/time", { cache: "no-store" })
    const text = await res.text()
    results.direct = { status: res.status, body: text.slice(0, 200) }
  } catch (e) {
    results.direct = { error: (e as Error).message }
  }

  // Via proxy (if configured)
  const proxy = process.env.BYBIT_PROXY_URL?.trim()
  if (proxy) {
    try {
      const url = `${proxy.replace(/\/$/, "")}?url=${encodeURIComponent("https://api.bybit.com/v5/market/time")}`
      const res = await fetch(url, { cache: "no-store" })
      const text = await res.text()
      results.proxy = { status: res.status, body: text.slice(0, 200) }
    } catch (e) {
      results.proxy = { error: (e as Error).message }
    }
  }

  return NextResponse.json(results)
}
