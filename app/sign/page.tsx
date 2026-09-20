"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { ChevronLeft, PenLine, Check, X } from "lucide-react"
import { getJobCard, getSettings, putJobCard } from "@/lib/db"
import { totalHours, visitHours } from "@/lib/hours"
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

/** Section heading, matching the printed job card. */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-deep-navy mb-2">
      {children}
    </h2>
  )
}

/**
 * The finished job card, as the store manager sees it before signing.
 *
 * Two things govern what is on this screen. It is a document, not a form — the
 * technician hands their phone over, so none of our input fields are here. And
 * it is the same document the store's head office is sent for payment, so it
 * carries no money: what the parts cost us stays in the office.
 *
 * It deliberately mirrors lib/job-card-template.tsx on the platform, section for
 * section, so what the manager signs is what prints.
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
  const workDone = card.items.filter((i) => i.trim())
  const alreadySigned = card.status !== "draft" && card.status !== "signing"

  return (
    <>
      {/* The technician's way back to correct something. Gone once it is signed. */}
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
        <div className="card overflow-hidden">
          {/* Letterhead */}
          <div className="px-5 pt-5 pb-4 border-b-[3px] border-sun-yellow">
            <div className="flex items-start gap-3">
              <Image
                src="/icon-192.png"
                alt=""
                width={44}
                height={44}
                className="rounded-lg shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="font-heading font-bold text-[18px] leading-none text-charcoal">
                  LEBOMBO
                </div>
                <div className="mt-0.5 text-[10px] font-bold tracking-[0.08em] text-burnt-orange leading-tight">
                  REPAIRS AND MAINTENANCE
                </div>
                <div className="mt-0.5 text-[9px] text-steel-grey leading-tight">
                  (Pty) Ltd. 2017/390176/07
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="text-[10.5px] text-steel-grey leading-snug">
                447 Suikerbekkie Avenue
                <br />
                Pongola, KZN, 3170
              </div>
              <div className="text-right shrink-0">
                <div className="font-heading font-bold text-[17px] text-deep-navy leading-none">
                  JOB CARD
                </div>
                <div className="mt-1 text-[15px] font-bold text-burnt-orange leading-none">
                  {card.jobCardNumber ? `No. ${card.jobCardNumber}` : "No. —"}
                </div>
              </div>
            </div>
          </div>

          {/* Customer / attended by */}
          <div className="px-5 py-4 border-b border-[#F1EFEA] grid grid-cols-2 gap-4">
            <div>
              <Heading>Customer</Heading>
              <p className="text-[13.5px] font-semibold text-charcoal">{card.storeName}</p>
              {card.unitNumber && (
                <p className="text-[12px] text-steel-grey">Unit: {card.unitNumber}</p>
              )}
            </div>
            <div>
              <Heading>Attended by</Heading>
              <p className="text-[13.5px] font-semibold text-charcoal">{technician.name}</p>
              <p className="text-[12px] text-steel-grey">
                {card.visits.length === 1 ? "1 visit" : `${card.visits.length} visits`}
                {hours !== null && ` · ${hours} hours on site`}
              </p>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-[#F1EFEA] grid grid-cols-2 gap-4">
            <div>
              <Heading>Date</Heading>
              <p className="text-[13.5px] text-charcoal">
                {formatDate(card.visits[0]?.visitDate ?? card.createdAt)}
              </p>
            </div>
            {card.orderNumber && (
              <div>
                <Heading>Order number</Heading>
                <p className="text-[13.5px] text-charcoal">{card.orderNumber}</p>
              </div>
            )}
          </div>

          {/* Time on site */}
          <div className="px-5 py-4 border-b border-[#F1EFEA]">
            <Heading>Time on site</Heading>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-deep-navy text-white">
                  {["Date", "In", "Out", "Hours"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-2 py-1.5 font-bold uppercase text-[9.5px] tracking-[0.06em] ${
                        i === 3 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.visits.map((v, i) => {
                  const h = visitHours(v.timeIn, v.timeOut)
                  return (
                    <tr key={i} className="border-b border-[#E5E5E5] last:border-0">
                      <td className="px-2 py-1.5 text-charcoal">{formatDate(v.visitDate)}</td>
                      <td className="px-2 py-1.5 text-steel-grey">{v.timeIn || "—"}</td>
                      <td className="px-2 py-1.5 text-steel-grey">{v.timeOut || "—"}</td>
                      <td className="px-2 py-1.5 text-right text-charcoal">
                        {h === null ? "—" : `${h} h`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {card.visits.length > 1 && hours !== null && (
                <tfoot>
                  <tr className="border-t-2 border-deep-navy">
                    <td colSpan={3} className="px-2 py-1.5 font-bold text-charcoal">
                      Total
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold text-charcoal">{hours} h</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Job description */}
          <div className="px-5 py-4 border-b border-[#F1EFEA]">
            <Heading>Job description</Heading>
            {workDone.length === 0 ? (
              <p className="text-[12.5px] italic text-[#9A9A9A]">No job description recorded.</p>
            ) : (
              <ol className="list-decimal list-inside space-y-1">
                {workDone.map((item, i) => (
                  <li key={i} className="text-[13px] text-charcoal whitespace-pre-wrap">
                    {item}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Material / spares — quantities only, as on the printed card */}
          {materials.length > 0 && (
            <div className="px-5 py-4 border-b border-[#F1EFEA]">
              <Heading>Material / spares</Heading>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-deep-navy text-white">
                    <th className="px-2 py-1.5 text-left font-bold uppercase text-[9.5px] tracking-[0.06em]">
                      Description
                    </th>
                    <th className="px-2 py-1.5 text-right font-bold uppercase text-[9.5px] tracking-[0.06em]">
                      Qty
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={i} className="border-b border-[#E5E5E5] last:border-0">
                      <td className="px-2 py-1.5 text-charcoal">{m.description}</td>
                      <td className="px-2 py-1.5 text-right text-charcoal">
                        {formatQty(m.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {card.notes.trim() && (
            <div className="px-5 py-4 border-b border-[#F1EFEA]">
              <Heading>Notes</Heading>
              <p className="text-[12.5px] text-steel-grey whitespace-pre-wrap">{card.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="px-5 py-5">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <div className="relative h-12 border-b border-charcoal">
                  {technician.signature && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={technician.signature}
                      alt=""
                      className="absolute left-0.5 bottom-px max-h-12 max-w-full w-auto object-contain mix-blend-multiply"
                    />
                  )}
                </div>
                <div className="mt-1.5 text-[12px] font-bold text-charcoal">{technician.name}</div>
                <div className="text-[9.5px] uppercase tracking-[0.06em] text-steel-grey">
                  Technician
                </div>
              </div>
              <div>
                <div className="relative h-12 border-b border-charcoal">
                  {signature && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={signature}
                      alt=""
                      className="absolute left-0.5 bottom-px max-h-12 max-w-full w-auto object-contain mix-blend-multiply"
                    />
                  )}
                </div>
                <div className="mt-1.5 text-[12px] font-bold text-charcoal min-h-[16px]">
                  {name || "—"}
                </div>
                <div className="text-[9.5px] uppercase tracking-[0.06em] text-steel-grey">
                  Store Manager / Dept Head
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-t-2 border-sun-yellow">
            <p className="text-[10px] text-steel-grey leading-snug">
              Logged in the field and signed off on site.
            </p>
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
