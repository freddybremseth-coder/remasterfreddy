import { useEffect, useState } from "react";
import { Bot, Eye, Loader2, Save, ShieldCheck } from "lucide-react";
import {
  loadAutopilotSettings,
  saveAutopilotSettings,
  type AutopilotMode,
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
      setMessage(result.message || "Autopilot-innstillingene er lagret.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre autopilot-innstillingene.");
    } finally {
      setSaving(false);
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
        </>
      )}
    </section>
  );
}
