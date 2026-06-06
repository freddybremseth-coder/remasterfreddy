import { useEffect, useState } from "react";
import { Bot, Eye, Loader2, PlayCircle, Save, ShieldCheck } from "lucide-react";
import {
  loadAutopilotSettings,
  runAutopilot,
  saveAutopilotSettings,
  type AutopilotMode,
  type AutopilotRunResult,
  type AutopilotSettings,
} from "./lib/autopilot-settings";
import "./autopilot-control.css";

const modes: Array<{
  id: AutopilotMode;
  label: string;
  description: string;
}> = [
  {
    id: "off",
    label: "Av",
    description: "Ingen automatiske handlinger eller planlagring.",
  },
  {
    id: "preview",
    label: "Kun forhåndsvisning",
    description: "AI analyserer og foreslår tiltak, men utfører og lagrer ingenting.",
  },
  {
    id: "plan_non_destructive",
    label: "Lag trygge planer",
    description: "Kan lagre strategi-, innholds- og publiseringsplaner. YouTube-metadata må fortsatt godkjennes manuelt.",
  },
];

export default function AutopilotControl() {
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
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
      .then((result) => {
        setSettings(result);
        setMode(result.mode);
        setMaxActions(result.maxActionsPerRun);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente autopilot-innstillingene.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await saveAutopilotSettings(mode, maxActions);
      setSettings(result.settings);
      setMode(result.settings.mode);
      setMaxActions(result.settings.maxActionsPerRun);
      setRunResult(null);
      setMessage(result.message || "Autopilot-innstillingene er lagret.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre autopilot-innstillingene.");
    } finally {
      setSaving(false);
    }
  }

  async function run() {
    setRunning(true);
    setMessage("");
    setError("");
    try {
      const result = await runAutopilot();
      setRunResult(result);
      setMessage(result.message || "Autopilot-kjøringen er fullført.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Autopilot-kjøringen feilet.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="autopilot-control">
      <div className="autopilot-heading">
        <div>
          <p className="admin-eyebrow">Sikker automatisering</p>
          <h3>Autopilot</h3>
          <p>Velg hvor mye systemet kan gjøre uten ny godkjenning.</p>
        </div>
        <div className="autopilot-shield"><ShieldCheck size={22} /></div>
      </div>

      {loading ? (
        <div className="autopilot-loading"><Loader2 className="admin-spinner" size={20} /> Henter innstillinger …</div>
      ) : (
        <>
          <div className="autopilot-mode-grid">
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mode === item.id ? "active" : ""}
                onClick={() => setMode(item.id)}
              >
                {item.id === "preview" ? <Eye size={18} /> : <Bot size={18} />}
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </div>

          <div className="autopilot-settings-row">
            <label>
              <span>Maks planer per kjøring</span>
              <input
                type="number"
                min={1}
                max={10}
                value={maxActions}
                disabled={mode !== "plan_non_destructive"}
                onChange={(event) => setMaxActions(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
              />
            </label>
            <div className="autopilot-hard-limit">
              <ShieldCheck size={17} />
              <span><strong>Permanent sikkerhetsgrense</strong><small>Automatiske YouTube-titler, beskrivelser og tags er alltid deaktivert.</small></span>
            </div>
          </div>

          {settings?.updatedAt && (
            <small className="autopilot-updated">
              Sist endret {new Date(settings.updatedAt).toLocaleString("nb-NO")}
              {settings.updatedBy ? ` av ${settings.updatedBy}` : ""}
            </small>
          )}

          {message && <div className="admin-success autopilot-message">{message}</div>}
          {error && <div className="admin-error autopilot-message">{error}</div>}

          <button className="admin-primary autopilot-save" type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="admin-spinner" size={16} /> : <Save size={16} />}
            Lagre autopilot-innstillinger
          </button>

          <div className="autopilot-run">
            <button className="admin-secondary" type="button" onClick={run} disabled={running || saving || mode === "off"}>
              {running ? <Loader2 className="admin-spinner" size={16} /> : <PlayCircle size={16} />}
              Kjør sikker autopilot
            </button>

            {runResult && (
              <div className="autopilot-run-result">
                <div className="autopilot-run-stats">
                  <span><strong>{runResult.analyzedCount}</strong><small>Analysert</small></span>
                  <span><strong>{runResult.mode === "preview" ? runResult.wouldSaveCount || 0 : runResult.savedCount}</strong><small>{runResult.mode === "preview" ? "Ville lagret" : "Lagret"}</small></span>
                  <span><strong>{runResult.skippedCount}</strong><small>Hoppet over</small></span>
                  <span><strong>{runResult.metadataRequiresApprovalCount || runResult.metadataRequiresApproval.length}</strong><small>Metadata</small></span>
                </div>

                {runResult.results.length > 0 && (
                  <ul className="autopilot-run-list">
                    {runResult.results.slice(0, 5).map((item, index) => (
                      <li key={`${item.id || item.actionType || "run"}-${index}`}>
                        <strong>{item.title || item.actionType || "Tiltak"}</strong>
                        <small>{item.status}{item.reason ? ` · ${item.reason}` : ""}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
