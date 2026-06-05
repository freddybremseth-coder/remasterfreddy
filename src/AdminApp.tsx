import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Image, Loader2, LockKeyhole, LogOut, Music2, ShieldCheck } from "lucide-react";
import AdminAnalytics from "./AdminAnalytics";
import AdminAssets from "./AdminAssets";
import AdminStudio from "./AdminStudio";
import { ADMIN_EMAIL, getAdminSession, isSupabaseConfigured, signInAdmin, signOutAdmin } from "./lib/supabase";
import "./admin.css";
import "./admin-tabs.css";

type AdminState = "loading" | "signed-out" | "authorized" | "forbidden";
type AdminTab = "publishing" | "assets" | "analytics";

const tabs: Array<{ id: AdminTab; label: string; description: string; icon: typeof Music2 }> = [
  { id: "publishing", label: "Publisering", description: "MP3 og YouTube-pipeline", icon: Music2 },
  { id: "assets", label: "Bildebank", description: "Bilder, logoer og thumbnails", icon: Image },
  { id: "analytics", label: "Statistikk", description: "YouTube-data og vekstanalyse", icon: BarChart3 },
];

export default function AdminApp() {
  const [state, setState] = useState<AdminState>("loading");
  const [activeTab, setActiveTab] = useState<AdminTab>("publishing");
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminSession()
      .then((session) => {
        if (!session) setState("signed-out");
        else if (session.email.toLowerCase() === ADMIN_EMAIL) setState("authorized");
        else setState("forbidden");
      })
      .catch(() => setState("signed-out"));
  }, []);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const session = await signInAdmin(email, password);
      setState(session.email === ADMIN_EMAIL ? "authorized" : "forbidden");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Innloggingen feilet.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    signOutAdmin();
    setPassword("");
    setState("signed-out");
  }

  if (state === "loading") {
    return <main className="admin-shell admin-centered"><Loader2 className="admin-spinner" size={34} /></main>;
  }

  if (state === "forbidden") {
    return (
      <main className="admin-shell admin-centered">
        <section className="admin-card admin-login-card">
          <ShieldCheck size={38} />
          <h1>Ingen administratortilgang</h1>
          <p>Kun {ADMIN_EMAIL} har tilgang til Re-Master Freddy Admin.</p>
          <button className="admin-primary" onClick={handleLogout}>Logg ut</button>
        </section>
      </main>
    );
  }

  if (state === "signed-out") {
    return (
      <main className="admin-shell admin-centered">
        <a className="admin-back" href="/"><ArrowLeft size={17} /> Tilbake til nettsiden</a>
        <section className="admin-card admin-login-card">
          <div className="admin-brand-mark"><LockKeyhole size={27} /></div>
          <p className="admin-eyebrow">Re-Master Freddy</p>
          <h1>Admin login</h1>
          <p>Logg inn for å administrere musikk, visuelle ressurser og YouTube-publisering.</p>
          <form onSubmit={handleLogin}>
            <label>
              E-post
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label>
              Passord
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            {error && <div className="admin-error">{error}</div>}
            {!isSupabaseConfigured && (
              <div className="admin-warning">Legg inn VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY i deploy-miljøet.</div>
            )}
            <button className="admin-primary" type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="admin-spinner" size={17} /> : <LockKeyhole size={17} />}
              Logg inn
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="admin-brand" href="/">
          <img src="/assets/remaster-logo.jpg" alt="Re-Master Freddy" />
          <span><strong>Re-Master Freddy</strong><small>Admin & YouTube Studio</small></span>
        </a>
        <div className="admin-header-actions">
          <span>{ADMIN_EMAIL}</span>
          <button onClick={handleLogout}><LogOut size={16} /> Logg ut</button>
        </div>
      </header>

      <section className="admin-content">
        <div className="admin-intro">
          <p className="admin-eyebrow">Kontrollsenter</p>
          <h1>Musikkproduksjon og YouTube</h1>
          <p>Publisering, visuelle ressurser og kanalresultater samlet under merkevaren Re-Master Freddy.</p>
        </div>

        <nav className="admin-tabs" aria-label="Re-Master Freddy adminmoduler">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
                <Icon size={20} />
                <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
              </button>
            );
          })}
        </nav>

        <div className="admin-tab-content">
          {activeTab === "publishing" && <AdminStudio />}
          {activeTab === "assets" && <AdminAssets />}
          {activeTab === "analytics" && <AdminAnalytics />}
        </div>

        <section className="admin-card admin-note">
          <ShieldCheck size={22} />
          <div>
            <h3>Sikker tilgang</h3>
            <p>Adminområdet og alle Re-Master API-ruter kontrollerer Supabase-økten og godtar bare {ADMIN_EMAIL}.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
