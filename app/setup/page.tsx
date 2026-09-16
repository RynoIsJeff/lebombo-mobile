"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { getSettings, saveSettings } from "@/lib/db"
import { refreshClients } from "@/lib/sync"
import { SignaturePad } from "@/components/signature-pad"

export default function SetupPage() {
  const router = useRouter()
  const [technicianName, setTechnicianName] = useState("")
  const [deviceLabel, setDeviceLabel] = useState("")
  const [accessCode, setAccessCode] = useState("")
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiBase, setApiBase] = useState("")

  useEffect(() => {
    getSettings().then((s) => {
      setApiBase(s.apiBase)
      // Re-pairing after a revoke keeps the details already entered.
      if (s.technicianName) setTechnicianName(s.technicianName)
      if (s.deviceLabel) setDeviceLabel(s.deviceLabel)
      if (s.signature) setSignature(s.signature)
    })
  }, [])

  const ready = technicianName.trim() && accessCode.trim() && signature

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return

    if (!navigator.onLine) {
      setError("Setting up needs a connection, just this once. Try where there is signal.")
      return
    }

    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${apiBase}/api/mobile/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessCode: accessCode.trim(),
          technicianName: technicianName.trim(),
          deviceLabel: deviceLabel.trim() || null,
          signature,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.error ?? "Could not set this phone up. Check the code and try again.")
        return
      }

      await saveSettings({
        token: data.token,
        technicianName: technicianName.trim(),
        deviceLabel: deviceLabel.trim(),
        signature,
      })
      // Pull the store list now, while there is definitely a connection.
      await refreshClients().catch(() => {})
      router.replace("/")
    } catch {
      setError("Could not reach the office. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex-1 px-5 pb-10">
      <div className="pt-10 pb-7 text-center">
        <Image
          src="/icon-192.png"
          alt="Lebombo"
          width={64}
          height={64}
          className="mx-auto rounded-2xl"
          priority
        />
        <h1 className="mt-4 font-heading font-bold text-[26px] leading-tight text-charcoal">
          Set up your phone
        </h1>
        <p className="mt-2 text-[14px] text-steel-grey leading-relaxed">
          Once only, and it needs signal. After this you can log job cards anywhere.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="field-label" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            className="field-input"
            value={technicianName}
            onChange={(e) => setTechnicianName(e.target.value)}
            placeholder="Sipho Ndlovu"
            autoComplete="name"
            enterKeyHint="next"
          />
          <p className="mt-1.5 text-[12.5px] text-steel-grey">
            Goes on every job card you log.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="device">
            This phone <span className="font-normal text-steel-grey">(optional)</span>
          </label>
          <input
            id="device"
            className="field-input"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="Sipho's Samsung"
            enterKeyHint="next"
          />
        </div>

        <SignaturePad
          label="Your signature"
          value={signature}
          onChange={setSignature}
        />
        <p className="-mt-3 text-[12.5px] text-steel-grey">
          Signed once here, then added to every job card automatically.
        </p>

        <div>
          <label className="field-label" htmlFor="code">
            Access code
          </label>
          <input
            id="code"
            className="field-input font-mono tracking-wider uppercase"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
          />
          <p className="mt-1.5 text-[12.5px] text-steel-grey">
            From the office. Not stored on this phone.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-[#F0C9C4] bg-[#FDECEA] px-4 py-3 text-[13.5px] text-[#A93226]">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={!ready || busy}>
          {busy ? "Setting up…" : "Set up this phone"}
        </button>
      </form>
    </main>
  )
}
