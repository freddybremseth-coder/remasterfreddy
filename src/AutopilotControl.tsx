import { useEffect, useState } from "react";
import { Bot, Eye, Loader2, PlayCircle, Save, ShieldCheck } from "lucide-react";
import {
  loadAutopilotSettings,
  runAutopilot,
  saveAutopilotSettings,
  type AutopilotLastRun,
  type AutopilotMode,
  type AutopilotRunResult,
  type AutopilotSettings,
} from "./lib/autopilot-settings";
import "./autopilot-control.css";

const modes: Array<{ id: AutopilotMode; label: string; description: string }> = [
  { id: "off", label: "Av", description: "Ingen automatiske handlinger eller planlagring." },
  { id: "preview", label: "Kun forhåndsvisning", description: "AI analyserer og foreslår tiltak, men utfører og lagrer ingenting." },
  { id: "plan_non_destructive", label: "Lag trygge planer", description: "Lagrer strategi-, innholds- og publiseringsplaner uten å endre YouTube-metadata." },
  { id: "execute_guarded", label: "Utfør og mål", description: "Trygge beskrivelser og tags kjøres daglig når modusen er lagret, eller manuelt med «Kjør». Titler krever egen godkjenning." },
];

export default function AutopilotControl() {
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [lastRun, setLastRun] = useState<AutopilotLastRun | null>(null);
  const [mode, setMode] = useState<AutopilotMode>("off");
  const [maxActions, setMaxActions] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<AutopilotRunResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAutopilotSettings()
      .then((result) => { setSettings(result.settings); setLastRun(result.lastRun); setMode(result.settings.mode); setMaxActions(result.settings.maxActionsPerRun); })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente autopilot-innstillingene."))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setMessage(""); setError("");
    try {
      const result = await saveAutopilotSettings(mode, maxActions);
      setSettings(result.settings); setMode(result.settings.mode); setMaxActions(result.settings.maxActionsPerRun); setRunResult(null);
      setMessage(result.message || "Autopilot-innstillingene er lagret.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre autopilot-innstillingene.");
    } finally { setSaving(false); }
  }

  async function run() {
    setRunning(true); setMessage(""); setError("");
    try {
      const result = await runAutopilot();
      setRunResult(result);
      setMessage(result.message || "Autopilot-kjøringen er fullført.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Autopilot-kjøringen feilet.");
    } finally { setRunning(false); }
  }

  const allowsActionBudget = mode === "plan_non_destructive" || mode === "execute_guarded";
  const unsavedChanges = Boolean(settings && (mode !== settings.mode || maxActions !== settings.maxActionsPerRun));
  const nextUtc = new Date();
  nextUtc.setUTCHours(20, 10, 0, 0);
  if (nextUtc.getTime() <= Date.now()) nextUtc.setUTCDate(nextUtc.getUTCDate() + 1);
  const formatSpanishTime = (value: Date | string) => new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
  const lastDetailCount = (name: string) => {
    const raw = lastRun?.details?.[name];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  };

  return (
    <section className="autopilot-control">
      <div className="autopilot-heading">
        <div>
          <p className="admin-eyebrow">Sikker automatisering</p>
          <h3>Autopilot</h3>
          <p>Velg og lagre handlingsnivået. «Utfør og mål» har en daglig sikker kjøring kl. 20:10 UTC (21:10 vintertid / 22:10 sommertid i Spania). «Kjør» starter en ekstra, manuell kjøring.</p>
        </div>
        <div className="autopilot-shield"><ShieldCheck size={22} /></div>
      </div>

      {loading ? <div className="autopilot-loading"><Loader2 className="admin-spinner" size={20} /> Henter innstillinger …</div> : <>
        <div className="autopilot-mode-grid">
          {modes.map((item) => (
            <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
              {item.id === "preview" ? <Eye size={18} /> : item.id === "execute_guarded" ? <PlayCircle size={18} /> : <Bot size={18} />}
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
            </button>
          ))}
        </div>

        <div className="autopilot-settings-row">
          <label>
            <span>Maks tiltak per kjøring</span>
            <input type="number" min={1} max={10} value={maxActions} disabled={!allowsActionBudget}
              onChange={(event) => setMaxActions(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} />
          </label>
          <div className="autopilot-hard-limit">
            <ShieldCheck size={17} />
            <span><strong>Permanent sikkerhetsgrense</strong><small>Titler og thumbnails endres ikke automatisk. I «Utfør og mål» kan beskrivelser og tags forbedres, logges og måles.</small></span>
          </div>
        </div>

        <div className="autopilot-run-result" aria-label="Status for planlagt autopilot">
          <p><strong>Planlagt autopilot</strong> · {settings?.mode === "execute_guarded" ? "Aktiv" : "Ikke aktiv i Utfør og mål"}</p>
          <p>Neste planlagte tidspunkt: {formatSpanishTime(nextUtc)} (Spania).</p>
          {lastRun ? <>
            <p>Siste registrerte planlagte kjøring: {formatSpanishTime(lastRun.at)} · {lastRun.status === "success" ? "Vellykket" : "Feilet"}.</p>
            <div className="autopilot-run-stats">
              <span><strong>{lastDetailCount("executed_count") ?? "–"}</strong><small>Utført</small></span>
              <span><strong>{lastDetailCount("saved_count") ?? "–"}</strong><small>Planlagt</small></span>
              <span><strong>{lastDetailCount("skipped_count") ?? "–"}</strong><small>Hoppet over</small></span>
              <span><strong>{lastDetailCount("approval_count") ?? "–"}</strong><small>Foreslått til godkjenning</small></span>
            </div>
            {lastRun.status === "error" && <p className="admin-error">Den siste planlagte kjøringen feilet. Sjekk loggene før ny kjøring.</p>}
          </> : <p>Ingen registrert planlagt kjøring er tilgjengelig ennå. Dette er ikke en bekreftelse på at autopiloten har kjørt.</p>}
        </div>
        {settings?.updatedAt && <small className="autopilot-updated">Sist endret {new Date(settings.updatedAt).toLocaleString("nb-NO")}{settings.updatedBy ? ` av ${settings.updatedBy}` : ""}</small>}
        {message && <div className="admin-success autopilot-message">{message}</div>}
        {error && <div className="admin-error autopilot-message">{error}</div>}

        <button className="admin-primary autopilot-save" type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="admin-spinner" size={16} /> : <Save size={16} />} Lagre autopilot-innstillinger
        </button>

        <p className="autopilot-updated">Viktig: Lagring utfører ikke tiltak umiddelbart. Når «Utfør og mål» er lagret, brukes denne modusen ved neste daglige kjøring. Titler og thumbnails krever fortsatt egen godkjenning.</p>
        {unsavedChanges && <p className="autopilot-updated">Du har ulagrede endringer. Lagre før du starter en manuell kjøring.</p>}
        <div className="autopilot-run">
          <button className="admin-secondary" type="button" onClick={run} disabled={running || saving || loading || unsavedChanges || mode === "off"}>
            {running ? <Loader2 className="admin-spinner" size={16} /> : <PlayCircle size={16} />} {mode === "execute_guarded" ? "Kjør utfør og mål" : "Kjør sikker autopilot"}
          </button>

          {runResult && <div className="autopilot-run-result">
            <div className="autopilot-run-stats">
              <span><strong>{runResult.analyzedCount}</strong><small>Analysert</small></span>
              <span><strong>{runResult.executedCount || 0}</strong><small>Utført</small></span>
              <span><strong>{runResult.mode === "preview" ? runResult.wouldSaveCount || 0 : runResult.savedCount}</strong><small>{runResult.mode === "preview" ? "Ville lagret" : "Planlagt"}</small></span>
              <span><strong>{runResult.skippedCount}</strong><small>Hoppet over</small></span>
            </div>
            {(runResult.metadataRequiresApprovalCount || 0) > 0 && <p>{runResult.metadataRequiresApprovalCount} metadataforslag krever separat godkjenning (blant annet titler).</p>}
            {runResult.results.length > 0 && <ul className="autopilot-run-list">
              {runResult.results.slice(0, 5).map((item, index) => <li key={`${item.id || item.actionType || "run"}-${index}`}>
                <strong>{item.title || item.actionType || "Tiltak"}</strong><small>{item.status}{item.reason ? ` · ${item.reason}` : ""}</small>
              </li>)}
            </ul>}
          </div>}
        </div>
      </>}
    </section>
  );
}
