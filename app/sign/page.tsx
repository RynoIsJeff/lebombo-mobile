"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { ChevronLeft, PenLine, Check, X } from "lucide-react"
import { getJobCard, getSettings, putJobCard } from "@/lib/db"
import { totalHours, visitHours, formatRand } from "@/lib/hours"
import type { JobCard } from "@/lib/types"
import { SignaturePad } from "@/components/signature-pad"
import { useSync } from "../app-chrome"

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso))

const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#8A8A8A]">
        {label}
      </div>
      <div className="mt-0.5 text-[14px] text-charcoal">{value}</div>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-deep-navy mb-2">
      {children}
    </h2>
  )
}

/**
 * The finished job card, as the store manager sees it before signing.
 *
 * This is deliberately a document, not a form. The technician hands their phone
 * over at this point, so nothing here is editable and none of our input fields
 * are on screen — the manager reads the work that was done and signs for it,
 * exactly as they did on the carbon-copy book.
 */
function SignSheet() {
  const router = useRouter()
  const params = useSearchParams()
  const localId = params.get("id")
  const { online, runSync, bump } = useSync()

  const [card, setCard] = useState<JobCard | null>(null)
  const [technician, setTechnician] = useState<{ name: string; signature: string | null }>({
    name: "",
    signature: null,
  })
  const [signing, setSigning] = useState(false)
  const [name, setName] = useState("")
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!localId) {
        router.replace("/")
        return
      }
      const [existing, settings] = await Promise.all([getJobCard(localId), getSettings()])
      if (cancelled) return
      if (!existing) {
        router.replace("/")
        return
      }
      setCard(existing)
      setTechnician({ name: settings.technicianName, signature: settings.signature })
      setName(existing.managerName)
      setSignature(existing.managerSignature)
    })()
    return () => {
      cancelled = true
    }
  }, [localId, router])

  const confirm = useCallback(async () => {
    if (!card) return
    if (!name.trim()) {
      setError("Please write your name.")
      return
    }
    if (!signature) {
      setError("Please sign above.")
      return
    }

    setError(null)
    setSaving(true)
    try {
      await putJobCard({
        ...card,
        managerName: name.trim(),
        managerSignature: signature,
        status: "queued",
        syncError: null,
      })
      bump()
      // Straight out the door if there is signal; otherwise it waits its turn.
      if (online) runSync({ silent: true })
      router.push("/")
    } finally {
      setSaving(false)
    }
  }, [card, name, signature, online, runSync, bump, router])

  if (!card) {
    return <main className="flex-1 px-5 py-8 text-[14px] text-steel-grey">Loading…</main>
  }

  const hours = totalHours(card.visits)
  const materials = card.materials.filter((m) => m.description.trim())
  const alreadySigned = card.status !== "draft" && card.status !== "signing"

  return (
    <>
      {/* The only way back into the form, and it goes once it is signed. */}
      {!alreadySigned && !signing && (
        <header
          className="sticky top-0 z-20 bg-paper/95 backdrop-blur px-3 py-2 flex items-center border-b border-hairline"
          style={{ top: "env(safe-area-inset-top)" }}
        >
          <button
            onClick={() => router.push(`/job?id=${card.localId}`)}
            className="h-10 px-3 rounded-xl flex items-center gap-1 text-[13px] font-medium text-steel-grey active:bg-[#F1EFEA]"
          >
            <ChevronLeft className="h-4 w-4" />
            Change something
          </button>
        </header>
      )}

      <main className="flex-1 px-4 py-5 pb-56">
        {/* The job card itself, laid out like the printed one. */}
        <div className="card overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b-2 border-sun-yellow">
            <div className="flex items-start gap-3">
              <Image
                src="/icon-192.png"
                alt=""
                width={42}
                height={42}
                className="rounded-lg shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="font-heading font-bold text-[17px] leading-tight text-charcoal">
                  LEBOMBO
                </div>
                <div className="text-[10.5px] font-semibold tracking-[0.08em] text-burnt-orange">
                  REPAIRS AND MAINTENANCE
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-heading font-bold text-[15px] text-deep-navy">JOB CARD</div>
                <div className="text-[11px] text-steel-grey">
                  {card.jobCardNumber ? `No. ${card.jobCardNumber}` : "Number issued by office"}
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-[#F1EFEA]">
            <Row label="Customer" value={card.storeName} />
            <Row label="Date" value={formatDate(card.visits[0]?.visitDate ?? card.createdAt)} />
            {card.orderNumber && <Row label="Order number" value={card.orderNumber} />}
            {card.unitNumber && <Row label="Unit" value={card.unitNumber} />}
            <Row label="Technician" value={technician.name} />
            {hours !== null && <Row label="Time on site" value={`${hours} hours`} />}
          </div>

          <div className="px-5 py-4 border-b border-[#F1EFEA]">
            <Heading>Time on site</Heading>
            <div className="space-y-1.5">
              {card.visits.map((v, i) => {
                const h = visitHours(v.timeIn, v.timeOut)
                return (
                  <div key={i} className="flex justify-between gap-3 text-[13.5px]">
                    <span className="text-charcoal">{formatDate(v.visitDate)}</span>
                    <span className="text-steel-grey">
                      {v.timeIn || "—"} – {v.timeOut || "—"}
                      {h !== null && ` · ${h} h`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="px-5 py-4 border-b border-[#F1EFEA]">
            <Heading>Work done</Heading>
            <ol className="list-decimal list-inside space-y-1">
              {card.items
                .filter((i) => i.trim())
                .map((item, i) => (
                  <li key={i} className="text-[13.5px] text-charcoal whitespace-pre-wrap">
                    {item}
                  </li>
                ))}
            </ol>
          </div>

          {materials.length > 0 && (
            <div className="px-5 py-4 border-b border-[#F1EFEA]">
              <Heading>Material / spares</Heading>
              <div className="space-y-1.5">
                {materials.map((m, i) => (
                  <div key={i} className="flex justify-between gap-3 text-[13.5px]">
                    <span className="text-charcoal min-w-0">
                      {m.description}
                      {m.quantity !== 1 && (
                        <span className="text-steel-grey"> × {formatQty(m.quantity)}</span>
                      )}
                    </span>
                    {m.unitCost !== null && (
                      <span className="text-steel-grey shrink-0 tabular-nums">
                        {formatRand(m.unitCost * m.quantity)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {card.notes.trim() && (
            <div className="px-5 py-4 border-b border-[#F1EFEA]">
              <Heading>Notes</Heading>
              <p className="text-[13.5px] text-steel-grey whitespace-pre-wrap">{card.notes}</p>
            </div>
          )}

          <div className="px-5 py-4">
            <Heading>Signed by</Heading>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="h-14 flex items-end border-b border-charcoal">
                  {technician.signature && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={technician.signature}
                      alt=""
                      className="max-h-14 max-w-full w-auto object-contain"
                    />
                  )}
                </div>
                <div className="mt-1.5 text-[12.5px] font-semibold text-charcoal">
                  {technician.name}
                </div>
                <div className="text-[10px] uppercase tracking-[0.06em] text-[#8A8A8A]">
                  Technician
                </div>
              </div>
              <div>
                <div className="h-14 flex items-end border-b border-charcoal">
                  {signature && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={signature}
                      alt=""
                      className="max-h-14 max-w-full w-auto object-contain"
                    />
                  )}
                </div>
                <div className="mt-1.5 text-[12.5px] font-semibold text-charcoal min-h-[18px]">
                  {name || "—"}
                </div>
                <div className="text-[10px] uppercase tracking-[0.06em] text-[#8A8A8A]">
                  Store manager
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The signing panel, opened by the manager from the button below. */}
        {signing && !alreadySigned && (
          <div className="mt-5 card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-charcoal">Sign off this job</h2>
              <button
                onClick={() => setSigning(false)}
                className="h-9 w-9 -mr-1 rounded-lg flex items-center justify-center text-steel-grey active:bg-[#F1EFEA]"
                aria-label="Close"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div>
              <label className="field-label" htmlFor="manager">
                Your name
              </label>
              <input
                id="manager"
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Store manager or department head"
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>

            <SignaturePad
              label="Your signature"
              value={signature}
              onChange={setSignature}
              heightClass="h-40"
            />

            {error && (
              <div className="rounded-xl border border-[#F0C9C4] bg-[#FDECEA] px-4 py-2.5 text-[13px] text-[#A93226]">
                {error}
              </div>
            )}

            <button onClick={confirm} disabled={saving} className="btn-primary">
              <Check className="h-5 w-5" strokeWidth={2.5} />
              {saving ? "Saving…" : "Confirm and finish"}
            </button>
          </div>
        )}
      </main>

      {!signing && !alreadySigned && (
        <div
          className="fixed inset-x-0 bottom-0 px-5 pt-3 bg-gradient-to-t from-paper via-paper to-transparent"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
        >
          <p className="mb-2.5 text-center text-[12.5px] text-steel-grey">
            Hand the phone to the store manager to sign.
          </p>
          <button onClick={() => setSigning(true)} className="btn-primary">
            <PenLine className="h-5 w-5" strokeWidth={2.4} />
            Tap to sign
          </button>
        </div>
      )}
    </>
  )
}

export default function SignPage() {
  return (
    <Suspense
      fallback={<main className="flex-1 px-5 py-8 text-[14px] text-steel-grey">Loading…</main>}
    >
      <SignSheet />
    </Suspense>
  )
}
