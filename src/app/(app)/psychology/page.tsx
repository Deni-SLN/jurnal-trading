"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { JournalEntry } from "@/types/database"
import { Brain } from "lucide-react"

export default function PsychologyPage() {
  const [journals, setJournals] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("journal_entries").select("*").order("created_at", { ascending: false })
      setJournals((data || []) as JournalEntry[])
      setLoading(false)
    }
    load()
  }, [])

  const stats = (() => {
    if (journals.length === 0) return null
    const emotionalControls = journals.map(j => j.emotional_control).filter(Boolean) as number[]
    const disciplines = journals.map(j => j.discipline).filter(Boolean) as number[]
    const patiences = journals.map(j => j.patience).filter(Boolean) as number[]

    const avgEmotional = emotionalControls.reduce((a, b) => a + b, 0) / (emotionalControls.length || 1)
    const avgDiscipline = disciplines.reduce((a, b) => a + b, 0) / (disciplines.length || 1)
    const avgPatience = patiences.reduce((a, b) => a + b, 0) / (patiences.length || 1)

    const beforeMap = new Map<string, { count: number }>()
    journals.forEach(j => {
      if (j.psychology_before) {
        beforeMap.set(j.psychology_before, { count: (beforeMap.get(j.psychology_before)?.count || 0) + 1 })
      }
    })

    return { avgEmotional, avgDiscipline, avgPatience, emotions: Array.from(beforeMap.entries()) }
  })()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Psychology Journal</h1>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !stats ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada catatan psikologi</p>
            <p className="text-sm mt-1">Catat emosi Anda saat mengisi trading journal</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Avg Emotional Control</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-blue-400">{stats.avgEmotional.toFixed(1)}/10</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Avg Discipline</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-emerald-400">{stats.avgDiscipline.toFixed(1)}/10</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Avg Patience</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-amber-400">{stats.avgPatience.toFixed(1)}/10</p></CardContent>
          </Card>

          <Card className="md:col-span-3">
            <CardHeader><CardTitle className="text-base">Emotion Frequency</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {stats.emotions.map(([emotion, data]) => (
                <div key={emotion} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300 font-medium">{emotion}</span>
                  <span className="text-sm font-mono text-gray-400">{data.count} kali</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
