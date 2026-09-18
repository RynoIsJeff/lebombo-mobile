"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus,
  CloudOff,
  RefreshCw,
  Check,
  Clock,
  FileEdit,
  PenLine,
  AlertTriangle,
  Settings as SettingsIcon,
} from "lucide-react"
import { allJobCards, getSettings } from "@/lib/db"
import { totalHours } from "@/lib/hours"
import type { JobCard } from "@/lib/types"
import { useSync } from "./app-chrome"

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(
    new Date(iso)
  )
}

function JobRow({ card }: { card: JobCard }) {
  const hours = totalHours(card.visits)
  const itemCount = card.items.filter((i) => i.trim()).length
  const meta: Record<
    JobCard["status"],
    { label: string; className: string; Icon: typeof Check }
  > = {
    draft: { label: "Draft", className: "bg-[#F1EFEA] text-[#6E6A63]", Icon: FileEdit },
    signing: { label: "To sign", className: "bg-[#EDE9FB] text-[#5B3FBF]", Icon: PenLine },
    queued: { label: "Waiting", className: "bg-[#FEF6E0] text-[#B45309]", Icon: Clock },
    syncing: { label: "Sending", className: "bg-[#EAF2FB] text-deep-navy", Icon: RefreshCw },
    synced: { label: "Sent", className: "bg-[#E7F5EC] text-[#1B7F47]", Icon: Check },
    failed: { label: "Problem", className: "bg-[#FDECEA] text-[#A93226]", Icon: AlertTriangle },
  }
  const { label, className, Icon } = meta[card.status]

  return (
    <Link
      href={card.status === "signing" ? `/sign?id=${card.localId}` : `/job?id=${card.localId}`}
      className="flex items-center gap-3 px-4 py-3.5 active:bg-[#FAF9F6] transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[15px] text-charcoal truncate">
            {card.storeName || "No store yet"}
          </span>
          {card.jobCardNumber && (
            <span className="text-[13px] font-semibold text-deep-navy shrink-0">
              #{card.jobCardNumber}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12.5px] text-steel-grey truncate">
          {card.visits[0]?.visitDate ? formatDate(card.visits[0].visitDate) : "—"}
          {card.visits.length > 1 && ` · ${card.visits.length} visits`}
          {hours !== null && ` · ${hours} h`}
          {itemCount > 0 && ` · ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
        </div>
        {card.syncError && (
          <div className="mt-1 text-[12px] text-[#A93226]">{card.syncError}</div>
        )}
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] font-semibold ${className}`}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
    </Link>
  )
}

export default function HomePage() {
  const router = useRouter()
  const { online, syncing, version, runSync } = useSync()
  const [cards, setCards] = useState<JobCard[] | null>(null)
  const [technicianName, setTechnicianName] = useState("")

  const load = useCallback(async () => {
    const settings = await getSettings()
    if (!settings.token) {
      router.replace("/setup")
      return
    }
    setTechnicianName(settings.technicianName)
    setCards(await allJobCards())
  }, [router])

  useEffect(() => {
    load()
  }, [load, version])

  const drafts = cards?.filter((c) => c.status === "draft") ?? []
  const toSign = cards?.filter((c) => c.status === "signing") ?? []
  const pending = cards?.filter((c) => ["queued", "syncing", "failed"].includes(c.status)) ?? []
  const sent = cards?.filter((c) => c.status === "synced") ?? []

  const groups = [
    { key: "drafts", title: "Not finished", cards: drafts },
    { key: "signing", title: "Waiting for a signature", cards: toSign },
    { key: "pending", title: "Waiting to send", cards: pending },
    { key: "sent", title: "Sent to the office", cards: sent },
  ].filter((g) => g.cards.length > 0)

  return (
    <>
      <header className="px-5 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading font-bold text-[25px] leading-tight text-charcoal">
              Job Cards
            </h1>
            {technicianName && (
              <p className="mt-0.5 text-[13.5px] text-steel-grey truncate">{technicianName}</p>
            )}
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="h-11 w-11 -mr-2 rounded-xl flex items-center justify-center text-steel-grey active:bg-[#F1EFEA]"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>
        <div className="mt-2.5 h-0.5 w-16 rounded bg-sun-yellow" />
      </header>

      {/* Sync bar — the honest answer to "did the office get it?" */}
      <div className="px-5 pb-4">
        <button
          onClick={() => runSync()}
          disabled={syncing || !online}
          className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-colors ${
            !online
              ? "border-[#E5E3DE] bg-[#F5F4F1]"
              : pending.length > 0
                ? "border-[#F0D9A8] bg-[#FEF6E0] active:bg-[#FBEFD3]"
                : "border-[#B9E0C9] bg-[#E7F5EC] active:bg-[#DCEFE4]"
          }`}
        >
          {!online ? (
            <CloudOff className="h-4 w-4 text-steel-grey shrink-0" />
          ) : (
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${
                pending.length > 0 ? "text-[#B45309]" : "text-[#1B7F47]"
              } ${syncing ? "animate-spin" : ""}`}
            />
          )}
          <span className="flex-1 text-[13.5px] font-semibold text-charcoal">
            {!online
              ? pending.length > 0
                ? `No signal · ${pending.length} waiting`
                : "No signal · everything is sent"
              : syncing
                ? "Sending…"
                : pending.length > 0
                  ? `${pending.length} waiting · tap to send`
                  : "Everything is sent"}
          </span>
        </button>
        {!online && (
          <p className="mt-2 text-[12.5px] text-steel-grey">
            Keep working — job cards save on this phone and send themselves when signal
            comes back.
          </p>
        )}
      </div>

      <main className="flex-1 px-5 pb-32">
        {cards === null ? (
          <p className="text-[14px] text-steel-grey">Loading…</p>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D5CE] py-16 px-6 text-center">
            <p className="text-[15px] font-semibold text-charcoal">No job cards yet</p>
            <p className="mt-1.5 text-[13.5px] text-steel-grey leading-relaxed">
              Tap the button below when you start a job.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8A8A8A]">
                  {group.title} · {group.cards.length}
                </h2>
                <div className="card divide-y divide-[#F1EFEA] overflow-hidden">
                  {group.cards.map((card) => (
                    <JobRow key={card.localId} card={card} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <div
        className="fixed inset-x-0 bottom-0 px-5 pt-3 bg-gradient-to-t from-paper via-paper to-transparent"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <Link href="/job" className="btn-primary">
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          New job card
        </Link>
      </div>
    </>
  )
}
