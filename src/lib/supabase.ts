const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const storageKey = "remasterfreddy.admin.session";

export const ADMIN_EMAIL = "freddy.bremseth@gmail.com";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

function headers(accessToken?: string) {
  return {
    apikey: supabaseAnonKey || "",
    Authorization: `Bearer ${accessToken || supabaseAnonKey || ""}`,
    "Content-Type": "application/json",
  };
}

function readStoredSession(): AdminSession | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    if (!session.accessToken || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const session = readStoredSession();
  if (!session || !isSupabaseConfigured) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: headers(session.accessToken),
  });
  if (!response.ok) {
    window.localStorage.removeItem(storageKey);
    return null;
  }

  const user = await response.json().catch(() => ({}));
  const email = String(user.email || "").toLowerCase();
  return { ...session, email };
}

export async function signInAdmin(email: string, password: string): Promise<AdminSession> {
  if (!isSupabaseConfigured) throw new Error("Supabase er ikke konfigurert for denne nettsiden ennå.");

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== ADMIN_EMAIL) throw new Error("Denne e-postadressen har ikke administratortilgang.");

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email: normalizedEmail, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || "Innloggingen feilet.");

  const authenticatedEmail = String(data.user?.email || "").toLowerCase();
  if (authenticatedEmail !== ADMIN_EMAIL) throw new Error("Denne brukeren har ikke tilgang til Re-Master Freddy Admin.");

  const session: AdminSession = {
    accessToken: String(data.access_token || ""),
    refreshToken: String(data.refresh_token || ""),
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    email: authenticatedEmail,
  };

  window.localStorage.setItem(storageKey, JSON.stringify(session));
  return session;
}

export function signOutAdmin() {
  window.localStorage.removeItem(storageKey);
}
