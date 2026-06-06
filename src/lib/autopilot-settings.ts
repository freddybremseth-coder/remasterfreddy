import { getAdminSession } from "./supabase";

export type AutopilotMode = "off" | "preview" | "plan_non_destructive";

export interface AutopilotSettings {
  mode: AutopilotMode;
  allowMetadataUpdates: false;
  allowNonDestructivePlans: boolean;
  maxActionsPerRun: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AutopilotSettingsResponse {
  settings: AutopilotSettings;
  message?: string;
  warning?: string;
}

const DEFAULT_SETTINGS: AutopilotSettings = {
  mode: "off",
  allowMetadataUpdates: false,
  allowNonDestructivePlans: false,
  maxActionsPerRun: 3,
};

function normalizeMode(value: unknown): AutopilotMode {
  if (value === "preview" || value === "plan_non_destructive") return value;
  return "off";
}

function normalizeMaxActions(value: unknown) {
  const parsed = Number(value ?? DEFAULT_SETTINGS.maxActionsPerRun);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.maxActionsPerRun;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

function normalizeSettings(value: unknown): AutopilotSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mode = normalizeMode(raw.mode);

  return {
    mode,
    allowMetadataUpdates: false,
    allowNonDestructivePlans: mode === "plan_non_destructive" && raw.allowNonDestructivePlans !== false,
    maxActionsPerRun: normalizeMaxActions(raw.maxActionsPerRun),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : undefined,
  };
}

async function autopilotFetch(init: RequestInit = {}) {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");

  return fetch("/api/neural-beat-autopilot-settings", {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function loadAutopilotSettings(): Promise<AutopilotSettings> {
  const response = await autopilotFetch({ method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Kunne ikke hente autopilot-innstillingene.");
  }

  return normalizeSettings(data.settings);
}

export async function saveAutopilotSettings(
  mode: AutopilotMode,
  maxActionsPerRun: number,
): Promise<AutopilotSettingsResponse> {
  const safeMode = normalizeMode(mode);
  const response = await autopilotFetch({
    method: "PUT",
    body: JSON.stringify({
      mode: safeMode,
      allowMetadataUpdates: false,
      allowNonDestructivePlans: safeMode === "plan_non_destructive",
      maxActionsPerRun: normalizeMaxActions(maxActionsPerRun),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Kunne ikke lagre autopilot-innstillingene.");
  }

  return {
    ...data,
    settings: normalizeSettings(data.settings),
  } as AutopilotSettingsResponse;
}
