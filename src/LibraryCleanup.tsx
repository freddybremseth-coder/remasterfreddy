import { useState } from "react";
import { CheckCircle2, Loader2, Sparkles, Wand2 } from "lucide-react";
import { getAdminSession } from "./lib/supabase";

interface CleanupProposal {
  songId: string;
  oldTitle: string;
  newTitle: string;
  hook: string;
  thumbnailUrl?: string;
  youtubeUrl?: string;
}

interface ApplyResult {
  songId: string;
  status: string;
  newTitle?: string;
  error?: string;
  reason?: string;
}

async function cleanupFetch(path: string, init: RequestInit = {}) {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export default function LibraryCleanup() {
  const [proposals, setProposals] = useState<CleanupProposal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<ApplyResult[]>([]);

  async function generate() {
    setGenerating(true);
    setError("");
    setMessage("");
    setApplied([]);
    try {
      const response = await cleanupFetch("/api/neural-beat-library-cleanup?limit=8", { method: "GET" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke generere forslag.");
      const items: CleanupProposal[] = Array.isArray(data.proposals) ? data.proposals : [];
      setProposals(items);
      setSelected(new Set(items.map((p) => p.songId)));
      setRemaining(typeof data.remaining === "number" ? data.remaining : null);
      if (items.length === 0) setMessage(data.message || "Ingen flere videoer å rydde opp i. 🎉");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Kunne ikke generere forslag.");
    } finally {
      setGenerating(false);
    }
  }

  function toggle(songId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }

  async function apply() {
    if (selected.size === 0) return;
    setApplying(true);
    setError("");
    setMessage("");
    try {
      const response = await cleanupFetch("/api/neural-beat-library-cleanup", {
        method: "POST",
        body: JSON.stringify({ songIds: Array.from(selected) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke oppdatere videoene.");
      const results: ApplyResult[] = Array.isArray(data.results) ? data.results : [];
      setApplied(results);
      const okCount = results.filter((r) => r.status === "applied").length;
      setMessage(`${okCount} av ${results.length} videoer fikk ny tittel og thumbnail.`);
      setProposals((prev) => prev.filter((p) => !selected.has(p.songId)));
      setSelected(new Set());
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Kunne ikke oppdatere videoene.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="admin-card library-cleanup">
      <div className="admin-studio-header">
        <div>
          <p className="admin-eyebrow">Bibliotek</p>
          <h2>Bulk-opprydding av gamle videoer</h2>
          <p>
            Genererer nye klikkvennlige titler, tags og brandede thumbnails for eldre videoer.
            Ingenting endres på YouTube før du godkjenner.
            {remaining !== null && remaining > 0 && ` ${remaining} videoer gjenstår etter denne bunken.`}
          </p>
        </div>
        <button className="admin-secondary" onClick={generate} disabled={generating || applying}>
          {generating ? <Loader2 className="admin-spinner" size={16} /> : <Sparkles size={16} />}
          Generer forslag (8)
        </button>
      </div>

      {error && <div className="admin-error admin-inline-message">{error}</div>}
      {message && <div className="admin-success"><CheckCircle2 size={17} />{message}</div>}
      {generating && (
        <div className="admin-empty">
          <Loader2 className="admin-spinner" size={22} /> Analyserer videoer og komponerer thumbnails … dette tar rundt et minutt.
        </div>
      )}

      {proposals.length > 0 && (
        <>
          <div className="admin-song-list">
            {proposals.map((proposal) => (
              <article className="admin-song-row" key={proposal.songId}>
                <input
                  type="checkbox"
                  checked={selected.has(proposal.songId)}
                  onChange={() => toggle(proposal.songId)}
                  aria-label={`Velg ${proposal.oldTitle}`}
                />
                {proposal.thumbnailUrl && (
                  <img
                    src={proposal.thumbnailUrl}
                    alt=""
                    style={{ width: 120, borderRadius: 8, aspectRatio: "16/9", objectFit: "cover" }}
                  />
                )}
                <div className="admin-song-copy">
                  <span style={{ opacity: 0.6, textDecoration: "line-through" }}>{proposal.oldTitle}</span>
                  <strong>{proposal.newTitle}</strong>
                </div>
              </article>
            ))}
          </div>
          <button
            className="admin-primary"
            onClick={apply}
            disabled={applying || selected.size === 0}
          >
            {applying ? <Loader2 className="admin-spinner" size={16} /> : <Wand2 size={16} />}
            Godkjenn og oppdater {selected.size} videoer på YouTube
          </button>
        </>
      )}

      {applied.length > 0 && (
        <div className="admin-step-list">
          {applied.map((result) => (
            <span key={result.songId} data-status={result.status === "applied" ? "completed" : "failed"}>
              {result.newTitle || result.songId}: {result.status}
              {result.error ? ` — ${result.error}` : result.reason ? ` — ${result.reason}` : ""}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
