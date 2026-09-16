"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Sign with a finger. Pointer events cover finger, stylus and mouse in one path,
 * and `touch-action: none` stops the page scrolling out from under a signature
 * halfway through.
 *
 * The canvas is backed at device resolution so the line is not a blurry mess on
 * a phone screen, then exported at a fixed width — a signature has to survive
 * being printed on an invoice, but it does not need to be a megabyte.
 */
export function SignaturePad({
  value,
  onChange,
  label,
  heightClass = "h-44",
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  label: string
  heightClass?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  /** Size the backing store to the element, then restore whatever was signed. */
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const width = Math.round(rect.width * dpr)
    const height = Math.round(rect.height * dpr)
    if (canvas.width === width && canvas.height === height) return

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#121212"

    if (value) {
      const img = new Image()
      img.onload = () => {
        // The stored image is cropped to its ink, so it is drawn contained
        // rather than stretched across the pad.
        const fit = Math.min(rect.width / img.width, rect.height / img.height, 1)
        const w = img.width * fit
        const h = img.height * fit
        ctx.drawImage(img, (rect.width - w) / 2, (rect.height - h) / 2, w, h)
      }
      img.src = value
      setHasInk(true)
    }
  }, [value])

  useEffect(() => {
    fitCanvas()
    window.addEventListener("resize", fitCanvas)
    return () => window.removeEventListener("resize", fitCanvas)
  }, [fitCanvas])

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    lastPoint.current = pointFrom(e)
    // A tap with no drag should still leave a mark.
    const ctx = canvasRef.current?.getContext("2d")
    const p = lastPoint.current
    if (ctx && p) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = "#121212"
      ctx.fill()
    }
    setHasInk(true)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext("2d")
    const from = lastPoint.current
    if (!ctx || !from) return

    const to = pointFrom(e)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    lastPoint.current = to
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    lastPoint.current = null
    commit()
  }

  /**
   * Crop to the ink, flatten onto white, and hand back a PNG.
   *
   * Cropping matters more than it sounds: a signature scrawled in the middle of
   * the pad, exported whole, is mostly blank and renders as a postage stamp on
   * the printed job card. Trimmed to its own bounds it fills the signature line
   * the way ink on paper does.
   */
  const commit = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d", { willReadFrequently: true })
    if (!canvas || !ctx) return

    const { width, height } = canvas
    const { data } = ctx.getImageData(0, 0, width, height)

    // The pad itself is transparent — only strokes have alpha.
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    if (maxX < 0) {
      // Everything was erased between the last stroke and here.
      onChange(null)
      return
    }

    const pad = Math.round(Math.min(width, height) * 0.05)
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(width - 1, maxX + pad)
    maxY = Math.min(height - 1, maxY + pad)

    const cropWidth = maxX - minX + 1
    const cropHeight = maxY - minY + 1

    const TARGET_WIDTH = 900
    const scale = Math.min(1, TARGET_WIDTH / cropWidth)
    const out = document.createElement("canvas")
    out.width = Math.max(1, Math.round(cropWidth * scale))
    out.height = Math.max(1, Math.round(cropHeight * scale))

    const outCtx = out.getContext("2d")
    if (!outCtx) return
    // Signatures land on white paper and white PDF pages; a transparent
    // background renders as black-on-black in some PDF viewers.
    outCtx.fillStyle = "#FFFFFF"
    outCtx.fillRect(0, 0, out.width, out.height)
    outCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, out.width, out.height)

    onChange(out.toDataURL("image/png"))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] font-semibold text-charcoal">{label}</label>
        {hasInk && (
          <button
            type="button"
            onClick={clear}
            className="text-[13px] font-semibold text-burnt-orange px-2 py-1 -mr-2"
          >
            Clear
          </button>
        )}
      </div>
      <div
        className={`relative rounded-xl border-2 border-dashed ${
          hasInk ? "border-hairline bg-white" : "border-[#D8D5CE] bg-white"
        } ${heightClass} overflow-hidden`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className="absolute inset-0 w-full h-full touch-none"
        />
        {!hasInk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[14px] text-[#B4B0A8]">Sign here</span>
          </div>
        )}
        <div className="absolute bottom-3 left-4 right-4 border-b border-[#D8D5CE] pointer-events-none" />
      </div>
    </div>
  )
}
