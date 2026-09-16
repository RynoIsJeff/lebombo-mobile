"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  Plus,
  Trash2,
  Check,
  CalendarPlus,
  CloudOff,
  Clock,
} from "lucide-react"
import {
  deleteJobCard,
  getJobCard,
  getSettings,
  putJobCard,
} from "@/lib/db"
import { totalHours, visitHours, todayISO } from "@/lib/hours"
import { emptyJobCard, type CachedClient, type JobCard } from "@/lib/types"
import { SignaturePad } from "@/components/signature-pad"
import { StorePicker } from "@/components/store-picker"
import { useSync } from "../app-chrome"

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8A8A8A] mb-2">
        {title}
      </h2>
      {hint && <p className="text-[12.5px] text-steel-grey mb-2.5 -mt-1">{hint}</p>}
      {children}
    </section>
  )
}

function JobForm() {
  const router = useRouter()
  const params = useSearchParams()
  const localId = params.get("id")
  const { online, runSync, bump } = useSync()

  const [card, setCard] = useState<JobCard | null>(null)
  const [clients, setClients] = useState<CachedClient[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = useRef(false)

  /* Load, or start a new card. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const settings = await getSettings()
      if (!settings.token) {
        router.replace("/setup")
        return
      }
      if (cancelled) return
      setClients(settings.clients)

      if (localId) {
        const existing = await getJobCard(localId)
        if (!existing) {
          router.replace("/")
          return
        }
        if (!cancelled) setCard(existing)
      } else {
        const fresh = emptyJobCard(crypto.randomUUID(), todayISO())
        if (!cancelled) setCard(fresh)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [localId, router])

  const update = useCallback((patch: Partial<JobCard>) => {
    dirty.current = true
    setCard((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  /* Autosave. A phone that dies mid-job must not take the job with it. */
  useEffect(() => {
    if (!card || !dirty.current) return
    const handle = setTimeout(() => {
      putJobCard(card).catch(() => {})
      dirty.current = false
    }, 700)
    return () => clearTimeout(handle)
  }, [card])

  if (!card) {
    return <main className="flex-1 px-5 py-8 text-[14px] text-steel-grey">Loading…</main>
  }

  const readOnly = card.status === "synced" || card.status === "syncing"
  const hours = totalHours(card.visits)
  const filledItems = card.items.filter((i) => i.trim())

  const saveDraft = async () => {
    setSaving(true)
    try {
      await putJobCard({ ...card, status: card.status === "failed" ? "failed" : "draft" })
      dirty.current = false
      bump()
      router.push("/")
    } finally {
      setSaving(false)
    }
  }

  const complete = async () => {
    // Only what the office genuinely cannot work without.
    if (!card.storeName.trim()) {
      setError("Choose the store first.")
      return
    }
    if (filledItems.length === 0) {
      setError("Write down what you did on this job.")
      return
    }
    if (!card.managerName.trim() || !card.managerSignature) {
      setError("The store manager needs to sign the job off.")
      return
    }

    setError(null)
    setSaving(true)
    try {
      await putJobCard({
        ...card,
        items: filledItems,
        status: "queued",
        capturedAt: card.capturedAt ?? new Date().toISOString(),
        syncError: null,
      })
      dirty.current = false
      bump()
      // Straight out the door if there is signal; otherwise it waits its turn.
      if (online) runSync({ silent: true })
      router.push("/")
    } finally {
      setSaving(false)
    }
  }

  const discard = async () => {
    if (!confirm("Delete this job card? It has not been sent to the office.")) return
    await deleteJobCard(card.localId)
    bump()
    router.push("/")
  }

  return (
    <>
      <header
        className="sticky top-0 z-20 bg-paper/95 backdrop-blur px-3 py-2.5 flex items-center gap-1 border-b border-hairline"
        style={{ top: "env(safe-area-inset-top)" }}
      >
        <button
          onClick={() => router.push("/")}
          className="h-11 w-11 rounded-xl flex items-center justify-center text-steel-grey active:bg-[#F1EFEA]"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading font-bold text-[17px] leading-tight text-charcoal truncate">
            {card.jobCardNumber ? `Job Card ${card.jobCardNumber}` : "New job card"}
          </h1>
          {!card.jobCardNumber && (
            <p className="text-[12px] text-steel-grey">
              Numbered by the office when it sends
            </p>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={discard}
            className="h-11 w-11 rounded-xl flex items-center justify-center text-steel-grey active:bg-[#FDECEA] active:text-[#A93226]"
            aria-label="Delete job card"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </header>

      <main className="flex-1 px-5 py-5 space-y-7 pb-40">
        {readOnly && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#B9E0C9] bg-[#E7F5EC] px-4 py-3">
            <Check className="h-4 w-4 text-[#1B7F47] mt-0.5 shrink-0" />
            <p className="text-[13px] text-[#14663A]">
              Sent to the office as job card{" "}
              <strong className="font-semibold">{card.jobCardNumber}</strong>. It cannot be
              changed now — phone the office if something is wrong.
            </p>
          </div>
        )}

        {card.syncError && (
          <div className="rounded-xl border border-[#F0C9C4] bg-[#FDECEA] px-4 py-3 text-[13px] text-[#A93226]">
            {card.syncError}
          </div>
        )}

        <fieldset disabled={readOnly} className="space-y-7 disabled:opacity-70">
          <Section title="Job">
            <div className="space-y-4">
              <StorePicker
                clients={clients}
                clientId={card.clientId}
                storeName={card.storeName}
                onChange={(next) => update(next)}
              />

              <div>
                <label className="field-label" htmlFor="order">
                  Order number <span className="font-normal text-steel-grey">(optional)</span>
                </label>
                <input
                  id="order"
                  className="field-input"
                  value={card.orderNumber}
                  onChange={(e) => update({ orderNumber: e.target.value })}
                  placeholder="The store's PO number"
                  enterKeyHint="next"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="unit">
                  Unit number <span className="font-normal text-steel-grey">(optional)</span>
                </label>
                <input
                  id="unit"
                  className="field-input"
                  value={card.unitNumber}
                  onChange={(e) => update({ unitNumber: e.target.value })}
                  placeholder="MBA-SP-BAKE-0002"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  enterKeyHint="next"
                />
              </div>
            </div>
          </Section>

          <Section
            title={card.visits.length === 1 ? "Time on site" : `Time on site · ${card.visits.length} visits`}
            hint="Add a visit for each day you come back to this job."
          >
            <div className="space-y-3">
              {card.visits.map((visit, index) => {
                const vHours = visitHours(visit.timeIn, visit.timeOut)
                return (
                  <div key={index} className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8A8A8A]">
                        {card.visits.length > 1 ? `Visit ${index + 1}` : "Date"}
                      </span>
                      <div className="flex items-center gap-2">
                        {vHours !== null && (
                          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-deep-navy">
                            <Clock className="h-3 w-3" />
                            {vHours} h
                          </span>
                        )}
                        {card.visits.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              update({ visits: card.visits.filter((_, i) => i !== index) })
                            }
                            className="h-7 w-7 -mr-1 rounded-lg flex items-center justify-center text-steel-grey active:bg-[#FDECEA] active:text-[#A93226]"
                            aria-label={`Remove visit ${index + 1}`}
                          >
                            <Trash2 className="h-[15px] w-[15px]" />
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="date"
                      className="field-input mb-3"
                      value={visit.visitDate}
                      onChange={(e) => {
                        const visits = [...card.visits]
                        visits[index] = { ...visit, visitDate: e.target.value }
                        update({ visits })
                      }}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      {(["timeIn", "timeOut"] as const).map((key) => (
                        <div key={key}>
                          <label className="block text-[12px] text-steel-grey mb-1">
                            {key === "timeIn" ? "Time in" : "Time out"}
                          </label>
                          <input
                            type="time"
                            className="field-input"
                            value={visit[key]}
                            onChange={(e) => {
                              const visits = [...card.visits]
                              visits[index] = { ...visit, [key]: e.target.value }
                              update({ visits })
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() =>
                  update({
                    visits: [...card.visits, { visitDate: todayISO(), timeIn: "", timeOut: "" }],
                  })
                }
                className="btn-secondary h-12"
              >
                <CalendarPlus className="h-[18px] w-[18px]" />
                Add another visit
              </button>

              {hours !== null && card.visits.length > 1 && (
                <p className="text-center text-[13px] font-semibold text-charcoal">
                  {hours} hours on site altogether
                </p>
              )}
            </div>
          </Section>

          <Section title="What you did" hint="One line for each job, like the old card.">
            <div className="space-y-2.5">
              {card.items.map((item, index) => (
                <div key={index} className="flex items-start gap-2">
                  <textarea
                    className="field-textarea flex-1 min-h-[52px] resize-y"
                    rows={1}
                    value={item}
                    onChange={(e) => {
                      const items = [...card.items]
                      items[index] = e.target.value
                      update({ items })
                    }}
                    placeholder="Connect standby bin divider"
                  />
                  {card.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => update({ items: card.items.filter((_, i) => i !== index) })}
                      className="h-[52px] w-11 shrink-0 rounded-xl flex items-center justify-center text-steel-grey active:bg-[#FDECEA] active:text-[#A93226]"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="h-[16px] w-[16px]" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => update({ items: [...card.items, ""] })}
                className="btn-secondary h-12"
              >
                <Plus className="h-[18px] w-[18px]" />
                Add a line
              </button>
            </div>
          </Section>

          <Section title="Material / spares" hint="Parts you fitted. The office puts the prices on.">
            <div className="space-y-2.5">
              {card.materials.map((material, index) => (
                <div key={index} className="flex items-start gap-2">
                  <input
                    className="field-input flex-1"
                    value={material.description}
                    onChange={(e) => {
                      const materials = [...card.materials]
                      materials[index] = { ...material, description: e.target.value }
                      update({ materials })
                    }}
                    placeholder="Contactor 25A"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="field-input w-20 shrink-0 text-center"
                    value={material.quantity}
                    onChange={(e) => {
                      const materials = [...card.materials]
                      materials[index] = { ...material, quantity: Number(e.target.value) }
                      update({ materials })
                    }}
                    aria-label="Quantity"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update({ materials: card.materials.filter((_, i) => i !== index) })
                    }
                    className="h-12 w-11 shrink-0 rounded-xl flex items-center justify-center text-steel-grey active:bg-[#FDECEA] active:text-[#A93226]"
                    aria-label={`Remove material ${index + 1}`}
                  >
                    <Trash2 className="h-[16px] w-[16px]" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  update({ materials: [...card.materials, { description: "", quantity: 1 }] })
                }
                className="btn-secondary h-12"
              >
                <Plus className="h-[18px] w-[18px]" />
                Add a part
              </button>
            </div>
          </Section>

          <Section
            title="Notes"
            hint="Anything worth recording about the job. Prints on the job card the customer gets, so write it for them as well as the office."
          >
            <textarea
              className="field-textarea min-h-[90px] resize-y"
              value={card.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Waiting on a part, returning Thursday. Fan bearings worn — will need replacing soon."
            />
          </Section>

          <Section title="Sign off" hint="The store manager or department head signs here.">
            <div className="space-y-4">
              <div>
                <label className="field-label" htmlFor="manager">
                  Their name
                </label>
                <input
                  id="manager"
                  className="field-input"
                  value={card.managerName}
                  onChange={(e) => update({ managerName: e.target.value })}
                  placeholder="Who signed the job off"
                  autoComplete="off"
                  enterKeyHint="done"
                />
              </div>
              <SignaturePad
                label="Their signature"
                value={card.managerSignature}
                onChange={(managerSignature) => update({ managerSignature })}
              />
            </div>
          </Section>
        </fieldset>
      </main>

      {!readOnly && (
        <div
          className="fixed inset-x-0 bottom-0 px-5 pt-3 bg-gradient-to-t from-paper via-paper to-transparent space-y-2.5"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
        >
          {error && (
            <div className="rounded-xl border border-[#F0C9C4] bg-[#FDECEA] px-4 py-2.5 text-[13px] text-[#A93226]">
              {error}
            </div>
          )}
          <button onClick={complete} disabled={saving} className="btn-primary">
            <Check className="h-5 w-5" strokeWidth={2.5} />
            {online ? "Finish and send" : "Finish — send when there is signal"}
          </button>
          <button onClick={saveDraft} disabled={saving} className="btn-secondary">
            {!online && <CloudOff className="h-4 w-4" />}
            Save and finish later
          </button>
        </div>
      )}
    </>
  )
}

export default function JobPage() {
  return (
    <Suspense
      fallback={<main className="flex-1 px-5 py-8 text-[14px] text-steel-grey">Loading…</main>}
    >
      <JobForm />
    </Suspense>
  )
}
