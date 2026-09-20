"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, RefreshCw, Store, LogOut, Link2 } from "lucide-react"
import { getSettings, saveSettings } from "@/lib/db"
import { pairDevice, refreshClients } from "@/lib/sync"
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
  const { online, runSync } = useSync()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [code, setCode] = useState("")
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      if (!s.token) router.replace("/setup")
      else {
        setSettings(s)
        // Open straight onto the code field when the office has stopped
        // recognising this phone — that is the only reason to be here.
        if (s.deviceRevoked) setReconnecting(true)
      }
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

  /**
   * Reconnect with nothing but the access code. The name and signature already
   * on the phone go back up as they are, so a technician does not have to sign
   * again standing at the roadside — and no job card is touched.
   */
  const reconnect = async () => {
    setBusy(true)
    setReconnectError(null)
    try {
      const result = await pairDevice({
        accessCode: code,
        technicianName: settings.technicianName,
        deviceLabel: settings.deviceLabel,
        signature: settings.signature,
      })
      if (!result.ok) {
        setReconnectError(result.error ?? "Could not connect this phone.")
        return
      }
      setSettings(await getSettings())
      setReconnecting(false)
      setCode("")
      setMessage(null)
      // Anything waiting goes now that the office knows this phone again.
      runSync({ silent: true })
      router.push("/")
    } finally {
      setBusy(false)
    }
  }

  const unpair = async () => {
    if (
      !confirm(
        "Sign this phone out? Your job cards stay on this phone — you will just need the access code to connect again before they can send."
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
            Connection
          </h2>

          {settings.deviceRevoked && (
            <div className="rounded-xl border border-[#F0C9C4] bg-[#FDECEA] px-4 py-3 mb-3">
              <p className="text-[13px] text-[#A93226]">
                <strong className="font-semibold">
                  The office does not recognise this phone.
                </strong>{" "}
                Your job cards are all still here. Enter the access code to connect again
                and they will send themselves.
              </p>
            </div>
          )}

          {reconnecting ? (
            <div className="card p-4 space-y-4">
              <div>
                <label className="field-label" htmlFor="code">
                  Access code
                </label>
                <input
                  id="code"
                  className="field-input font-mono tracking-wider uppercase"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XX"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  autoFocus
                />
                <p className="mt-1.5 text-[12.5px] text-steel-grey">
                  From the office. Your name and signature stay as they are.
                </p>
              </div>

              {reconnectError && (
                <div className="rounded-xl border border-[#F0C9C4] bg-[#FDECEA] px-4 py-2.5 text-[13px] text-[#A93226]">
                  {reconnectError}
                </div>
              )}

              <button
                onClick={reconnect}
                disabled={busy || !code.trim()}
                className="btn-primary"
              >
                <Link2 className="h-[18px] w-[18px]" />
                {busy ? "Connecting…" : "Connect this phone"}
              </button>
              <button
                onClick={() => {
                  setReconnecting(false)
                  setReconnectError(null)
                  setCode("")
                }}
                disabled={busy}
                className="btn-secondary h-11"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setReconnecting(true)}
              className={settings.deviceRevoked ? "btn-primary" : "btn-secondary"}
            >
              <Link2 className="h-[18px] w-[18px]" />
              Reconnect this phone
            </button>
          )}
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
