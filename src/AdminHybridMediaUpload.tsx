import { useState } from "react";
import { getAdminSession } from "./lib/supabase";

export default function AdminHybridMediaUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [lane, setLane] = useState("calm");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const durationSeconds = Number(duration);
    if (kind === "video" && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 120)) {
      setMessage("Skriv inn klippets varighet mellom 0 og 120 sekunder.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const session = await getAdminSession();
      if (!session) throw new Error("Logg inn på nytt.");
      const post = async (action: string, body: Record<string, unknown>) => {
        const response = await fetch("/api/hybrid-media?action=" + action, {
          method: "POST",
          headers: { Authorization: "Bearer " + session.accessToken, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Medietjenesten er utilgjengelig");
        return result;
      };
      const ticket = await post("upload-ticket", { name: file.name, kind, mimeType: file.type, size: file.size });
      if (ticket.method !== "supabase-signed-upload" || !ticket.signedUrl || !ticket.storagePath) throw new Error("Sikker opplastingsbillett mangler.");
      const uploaded = await fetch(ticket.signedUrl, {
        method: "PUT", headers: { "Content-Type": file.type }, body: file,
      });
      if (!uploaded.ok) throw new Error("Opplastingen feilet (HTTP " + uploaded.status + ")");
      const registered = await post("register", {
        storagePath: ticket.storagePath, title: file.name.replace(/\.[^.]+$/, ""),
        kind, lane, moods: [], ...(kind === "video" ? { durationSeconds } : {}),
      });
      if (!registered.assetId) throw new Error("Filen ble lastet opp, men registreringen feilet.");
      setMessage("Filen er lagret. Den er ikke godkjent for bruk ennå.");
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ukjent feil");
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-card">
    <h3>Gjenbrukbare videoer og bilder</h3>
    <p>Last opp egne medier. Alle nye filer må godkjennes før de kan brukes i videoplaner.</p>
    <label htmlFor="hybrid-file">Velg video eller bilde</label>
    <input id="hybrid-file" type="file" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
      onChange={event => { setFile(event.target.files?.[0] || null); setMessage(""); }} />
    <label htmlFor="hybrid-lane">Sjanger</label>
    <select id="hybrid-lane" value={lane} onChange={event => setLane(event.target.value)}>
      <option value="calm">Ambient / rolig</option>
      <option value="mediterranean">Lounge / Middelhavet</option>
      <option value="energy">Dance / energi</option>
      <option value="emotional">Drømmende / emosjonelt</option>
    </select>
    {file?.type.startsWith("video/") && <>
      <label htmlFor="hybrid-duration">Videoklippets lengde (sekunder)</label>
      <input id="hybrid-duration" type="number" min="0.1" max="120" step="0.01"
        value={duration} onChange={event => setDuration(event.target.value)} />
    </>}
    <button className="admin-secondary" type="button" disabled={!file || busy} onClick={upload}>
      {busy ? "Laster opp…" : "Lagre i mediebiblioteket"}
    </button>
    {message && <p role="status">{message}</p>}
  </section>;
}
