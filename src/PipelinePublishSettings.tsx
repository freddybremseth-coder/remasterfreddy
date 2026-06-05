import { CalendarClock, Globe2, Send } from "lucide-react";
import { PipelineOptions } from "./lib/admin-api";
import "./pipeline-publish-settings.css";

type PublishMode = "now" | "auto" | "custom";

interface PipelinePublishSettingsProps {
  value: PipelineOptions;
  onChange: (value: PipelineOptions) => void;
}

function getMode(value: PipelineOptions): PublishMode {
  if (value.customPublishAt) return "custom";
  if (value.autoSchedule) return "auto";
  return "now";
}

function toLocalDateTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultCustomPublishTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return date.toISOString();
}

export default function PipelinePublishSettings({ value, onChange }: PipelinePublishSettingsProps) {
  const mode = getMode(value);

  function setMode(nextMode: PublishMode) {
    if (nextMode === "now") {
      onChange({ ...value, autoSchedule: false, customPublishAt: undefined });
    } else if (nextMode === "auto") {
      onChange({ ...value, autoSchedule: true, customPublishAt: undefined });
    } else {
      onChange({
        ...value,
        autoSchedule: false,
        customPublishAt: value.customPublishAt || defaultCustomPublishTime(),
      });
    }
  }

  function setCustomTime(localValue: string) {
    if (!localValue) {
      onChange({ ...value, customPublishAt: undefined });
      return;
    }
    const date = new Date(localValue);
    onChange({
      ...value,
      autoSchedule: false,
      customPublishAt: Number.isNaN(date.getTime()) ? undefined : date.toISOString(),
    });
  }

  return (
    <div className="pipeline-publish-settings">
      <div className="publish-settings-heading">
        <div>
          <strong>Publiseringsinnstillinger</strong>
          <span>Velg tidspunkt og språk før videoen produseres.</span>
        </div>
        <CalendarClock size={20} />
      </div>

      <div className="publish-mode-grid">
        <button type="button" className={mode === "now" ? "active" : ""} onClick={() => setMode("now")}>
          <Send size={18} />
          <span><strong>Publiser med en gang</strong><small>Videoen publiseres når pipelinen er ferdig.</small></span>
        </button>
        <button type="button" className={mode === "auto" ? "active" : ""} onClick={() => setMode("auto")}>
          <CalendarClock size={18} />
          <span><strong>Beste tidspunkt</strong><small>Systemet velger tidspunkt ut fra sjanger og kanalhistorikk.</small></span>
        </button>
        <button type="button" className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}>
          <CalendarClock size={18} />
          <span><strong>Velg dato og tid</strong><small>Du bestemmer nøyaktig publiseringstidspunkt.</small></span>
        </button>
      </div>

      {mode === "custom" && (
        <label className="publish-date-field">
          <span>Publiseringsdato og tid</span>
          <input
            type="datetime-local"
            value={toLocalDateTime(value.customPublishAt)}
            min={toLocalDateTime(new Date().toISOString())}
            onChange={(event) => setCustomTime(event.target.value)}
          />
          <small>Tidspunktet tolkes i din lokale tidssone og sendes til YouTube som UTC.</small>
        </label>
      )}

      <label className="publish-language-toggle">
        <input
          type="checkbox"
          checked={value.multilingualDescription !== false}
          onChange={(event) => onChange({ ...value, multilingualDescription: event.target.checked })}
        />
        <Globe2 size={19} />
        <span>
          <strong>Flerspråklig YouTube-beskrivelse</strong>
          <small>Legg inn introduksjon og CTA på norsk, engelsk og spansk.</small>
        </span>
      </label>
    </div>
  );
}
