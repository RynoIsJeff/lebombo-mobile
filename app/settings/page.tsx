"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, RefreshCw, Store, LogOut } from "lucide-react"
import { getSettings, saveSettings } from "@/lib/db"
import { refreshClients } from "@/lib/sync"
import { SignaturePad } from "@/components/signature-pad"
import type { Settings } from "@/lib/types"
import { useSync } from "../app-chrome"

function formatWhen(iso: string | null) {
  if (!iso) return "never"
  const then = new Date(iso)
  const minutes = Math.floor((Date.now() - then.getTime()) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(then)
}

export default function MobileSettingsPage() {
  const router = useRouter()
  const { online } = useSync()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      if (!s.token) router.replace("/setup")
      else setSettings(s)
    })
  }, [router])

  if (!settings) {
    return <main className="flex-1 px-5 py-8 text-[14px] text-steel-grey">Loading…</main>
  }

  const save = async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(patch))
  }

  const pullStores = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const clients = await refreshClients()
      setSettings(await getSettings())
      setMessage(
        clients ? `${clients.length} stores updated` : "Could not reach the office"
      )
    } catch {
      setMessage("Could not reach the office")
    } finally {
      setBusy(false)
    }
  }

  const unpair = async () => {
    if (
      !confirm(
        "Sign this phone out? Any job card that has not been sent yet will be lost. Only do this if everything shows as Sent."
      )
    )
      return
    await saveSettings({ token: null })
    router.replace("/setup")
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
        <h1 className="font-heading font-bold text-[17px] text-charcoal">Settings</h1>
      </header>

      <main className="flex-1 px-5 py-5 space-y-7 pb-16">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8A8A8A] mb-2">
            You
          </h2>
          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="name">
                Your name
              </label>
              <input
                id="name"
                className="field-input"
                value={settings.technicianName}
                onChange={(e) => save({ technicianName: e.target.value })}
              />
              <p className="mt-1.5 text-[12.5px] text-steel-grey">
                Changing this only affects job cards you log from now on.
              </p>
            </div>
            <SignaturePad
              label="Your signature"
              value={settings.signature}
              onChange={(signature) => save({ signature })}
              heightClass="h-36"
            />
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8A8A8A] mb-2">
            Stores
          </h2>
          <div className="card p-4">
            <div className="flex items-center gap-2.5">
              <Store className="h-4 w-4 text-steel-grey shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-charcoal">
                  {settings.clients.length} stores on this phone
                </p>
                <p className="text-[12.5px] text-steel-grey">
                  Updated {formatWhen(settings.clientsFetchedAt)}
                </p>
              </div>
            </div>
            <button
              onClick={pullStores}
              disabled={busy || !online}
              className="btn-secondary h-11 mt-3.5"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              {online ? "Update store list" : "No signal"}
            </button>
            {message && (
              <p className="mt-2.5 text-center text-[13px] text-steel-grey">{message}</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8A8A8A] mb-2">
            This phone
          </h2>
          <div className="card p-4 space-y-3">
            <div className="flex justify-between gap-3 text-[13.5px]">
              <span className="text-steel-grey">Last synced</span>
              <span className="text-charcoal font-medium">
                {formatWhen(settings.lastSyncAt)}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-[13.5px]">
              <span className="text-steel-grey">Office</span>
              <span className="text-charcoal font-medium truncate max-w-[60%] text-right">
                {settings.apiBase.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </div>
          <button
            onClick={unpair}
            className="mt-3 w-full h-12 rounded-xl flex items-center justify-center gap-2 text-[14px] font-semibold text-[#A93226] active:bg-[#FDECEA] transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign this phone out
          </button>
        </section>
      </main>
    </>
  )
}
