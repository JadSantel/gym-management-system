"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChecksumException, DecodeHintType, FormatException, NotFoundException } from "@zxing/library";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { scanSchema } from "@/lib/attendance-schema";
import { acceptCameraRead, type CameraGate } from "@/lib/camera-gate";
import type { ScanResult } from "@/lib/attendance";
export function AttendanceScanner() {
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState("Ready for a personal member QR."), [result, setResult] = useState<ScanResult | null>(null);
  const [camera, setCamera] = useState(false), [cameraStarting, setCameraStarting] = useState(false), [cameraError, setCameraError] = useState("");
  const input = useRef<HTMLInputElement>(null), video = useRef<HTMLVideoElement>(null), feedback = useRef<HTMLDivElement>(null);
  const pending = useRef<{ code: string; requestId: string } | null>(null), blocked = useRef(false), controls = useRef<IScannerControls | null>(null), generation = useRef(0);
  const gate = useRef<CameraGate>({ code: null, missingSince: null });
  const releaseCamera = useCallback(() => {
    generation.current++; controls.current?.stop(); controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
  }, []);
  function stopCamera() { releaseCamera(); setCamera(false); setCameraStarting(false); }
  useEffect(() => () => releaseCamera(), [releaseCamera]);
  async function submitCode(code: string) {
    if (blocked.current) return;
    const parsed = scanSchema.safeParse(pending.current ?? { code: code.trim(), requestId: crypto.randomUUID() });
    if (!parsed.success) { setMessage("Scan a personal member QR. A reception registration QR cannot record attendance."); setResult(null); return; }
    pending.current = parsed.data; blocked.current = true; setBusy(true); setResult(null); setMessage("Checking current server state…");
    try {
      const response = await fetch("/api/attendance/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 500) throw new Error();
        setUncertain(true); setMessage(`${data.error} Retry the same scan after resolving this issue, or review attendance history.`);
      } else { setResult(data); setMessage(data.message); pending.current = null; setUncertain(false); if (input.current) input.current.value = ""; }
    } catch { setUncertain(true); setMessage("Attendance not confirmed. Retry the same request when connected. Do not scan again to guess the result."); }
    finally { blocked.current = false; setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); }
  }
  async function startCamera() {
    const preview = video.current; if (!preview) return;
    setCameraError(""); setCameraStarting(true); gate.current = { code: null, missingSince: null }; const attempt = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("SECURE_CONTEXT");
      const { BrowserCodeReader, BrowserQRCodeReader } = await import("@zxing/browser");
      if (attempt !== generation.current) return;
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 100 });
      const flatReader = new BrowserQRCodeReader(new Map([[DecodeHintType.PURE_BARCODE, true]]));
      const handle = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, preview, (decoded, error) => {
        if (attempt !== generation.current || blocked.current || pending.current) return;
        let result = decoded;
        // Some valid, flat QR patterns confuse ZXing's perspective detector. Retry its pure-symbol path locally.
        if (!result && (error instanceof ChecksumException || error instanceof FormatException)) {
          try { result = flatReader.decodeFromCanvas(BrowserCodeReader.createCanvasFromMediaElement(preview)); } catch { /* Keep scanning; this frame may need perspective detection. */ }
        }
        if (result && acceptCameraRead(gate.current, result.getText(), performance.now())) void submitCode(result.getText());
        else if (error instanceof NotFoundException) acceptCameraRead(gate.current, null, performance.now());
      });
      if (attempt !== generation.current) { handle.stop(); if (preview.srcObject instanceof MediaStream) preview.srcObject.getTracks().forEach(track => track.stop()); return; }
      controls.current = handle; setCamera(true);
    } catch (error) {
      if (preview.srcObject instanceof MediaStream) preview.srcObject.getTracks().forEach(track => track.stop());
      if (attempt === generation.current) setCameraError(error instanceof DOMException && error.name === "NotAllowedError" ? "Camera permission denied. Allow camera access in browser settings, then try again, or use a keyboard scanner." : "Camera unavailable. Check that it is connected and not in use. Phone cameras require reachable HTTPS. You can use a keyboard scanner instead.");
    } finally { if (attempt === generation.current) setCameraStarting(false); }
  }
  return <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="panel space-y-5" aria-labelledby="keyboard-scanner-title"><h2 id="keyboard-scanner-title" className="panel-title">Keyboard scanner</h2>
      <p className="text-sm text-muted-foreground">Focus the field, scan a QR with a USB keyboard scanner, then send Enter. You may also enter the code manually.</p>
      <form onSubmit={event => { event.preventDefault(); void submitCode(input.current?.value ?? ""); }} className="space-y-4" aria-busy={busy}>
        <label htmlFor="attendance-code">Personal member QR code<Input id="attendance-code" ref={input} autoComplete="off" spellCheck={false} maxLength={43} disabled={busy || uncertain} /></label>
        <Button type="submit" disabled={busy || uncertain}>{busy ? "Checking…" : "Record scan"}</Button>
      </form>
      {uncertain && <Button variant="outline" disabled={busy} onClick={() => void submitCode("")}>Retry same scan</Button>}
      <div ref={feedback} role="status" tabIndex={-1} className="rounded-md bg-muted p-4 outline-offset-4">
        {result?.memberName && <p className="mb-2 font-semibold">{result.memberName}</p>}
        <p className="font-medium">{result && `${result.status}: `}{message}</p>
        {result && <p className="mt-2 text-sm text-muted-foreground">Server checked {new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", timeStyle: "medium" }).format(new Date(result.checkedAt))} PHT.</p>}
      </div>
      <p className="text-sm text-muted-foreground">OUT becomes IN only with current verified membership. IN becomes OUT during the same Manila day, even after expiry. Repeats within eight seconds are ignored. No offline queue.</p>
      <Link href="/attendance" className="text-link">Review attendance history and corrections</Link>
    </section>
    <section className="panel space-y-5" aria-labelledby="camera-scanner-title"><h2 id="camera-scanner-title" className="panel-title">Camera scanner</h2>
      <p className="text-sm text-muted-foreground">Frames decode on this device. Remove the code from view before presenting it again. Staff must confirm the person presenting a member QR.</p>
      <video ref={video} muted playsInline className={`aspect-video w-full rounded-md bg-muted ${camera || cameraStarting ? "" : "hidden"}`} aria-label="Local camera preview" />
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={camera || cameraStarting} onClick={() => void startCamera()}>{cameraStarting ? "Opening camera…" : "Start camera"}</Button><Button variant="outline" disabled={!camera && !cameraStarting} onClick={stopCamera}>Stop camera</Button></div>
      {cameraError && <p role="alert" className="text-sm text-destructive">{cameraError}</p>}
      <p className="text-sm text-muted-foreground">Local synthetic use only. Physical USB scanners, webcams, mobile cameras and hosted phone access require separate verification.</p>
    </section>
  </div>;
}
