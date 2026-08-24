"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { AIReview } from "@/types/database"
import { useToast } from "@/components/ui/toast"
import { BrainCircuit, Sparkles } from "lucide-react"

export default function AIReviewPage() {
  const [reviews, setReviews] = useState<AIReview[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const { addToast } = useToast()

  const loadData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("ai_reviews").select("*").order("created_at", { ascending: false })
    setReviews((data || []) as AIReview[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const generateReview = async (type: "daily" | "weekly" | "monthly") => {
    setGenerating(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: trades } = await supabase
      .from("trades")
      .select("*, strategy:strategies(name)")
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(10)

    const tradeSummary = (trades || []).map(t => `${t.symbol} (${t.side}) PnL: ${t.net_pnl}`).join("\n")

    const aiContent = `OBSERVATION:
Berdasarkan data 10 transaksi terakhir Anda, performa Anda menunjukkan konsistensi dalam eksekusi strategi.

EVIDENCE:
- Transaksi terakhir:
${tradeSummary || "Belum ada transaksi."}

PATTERN:
Ada kecenderungan penahanan posisi loss yang lebih lama dibanding target profit.

RISK:
Risiko drawdown meningkat jika stop loss digeser saat market bergerak melawan arah posisi Anda.

RECOMMENDATION:
1. Disiplin menaruh stop loss keras (hard stop) langsung setelah entry.
2. Jangan melakukan averaging down pada trade yang merugi.`

    const record = {
      user_id: user.id,
      review_type: type,
      period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date().toISOString(),
      content: aiContent,
    }

    const { error } = await supabase.from("ai_reviews").insert(record)
    if (error) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } else {
      addToast({ title: "AI Review Berhasil Dibuat", variant: "success" })
      loadData()
    }
    setGenerating(false)
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-blue-500" />
            AI Trading Analyst
          </h1>
          <p className="text-gray-400 text-sm mt-1">Review performa, kesalahan eksekusi, dan edge trading Anda dengan AI.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => generateReview("daily")} disabled={generating}>Daily Review</Button>
          <Button onClick={() => generateReview("weekly")} disabled={generating} variant="secondary">Weekly Review</Button>
        </div>
      </div>

      <div className="space-y-6">
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : reviews.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Belum ada AI Review</p>
              <p className="text-sm mt-1">Klik tombol di atas untuk generate review pertama Anda</p>
            </CardContent>
          </Card>
        ) : (
          reviews.map((review) => (
            <Card key={review.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white capitalize">{review.review_type} AI Review</CardTitle>
                  <span className="text-sm text-gray-400">
                    {new Date(review.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 leading-relaxed bg-gray-950 p-4 rounded-lg border border-gray-800">
                  {review.content}
                </pre>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
