import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, LockKeyhole, LogOut, Music2, ShieldCheck, Youtube } from "lucide-react";
import AdminStudio from "./AdminStudio";
import { ADMIN_EMAIL, getAdminSession, isSupabaseConfigured, signInAdmin, signOutAdmin } from "./lib/supabase";
import "./admin.css";

const CURRENT_STUDIO_URL = "https://realtyflow.chatgenius.pro/neural-beat";

type AdminState = "loading" | "signed-out" | "authorized" | "forbidden";

export default function AdminApp() {
  const [state, setState] = useState<AdminState>("loading");
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
          <p>Logg inn for å administrere musikk, videopipeline og YouTube-publisering.</p>
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
          <p>Dette er det nye hjemmet for Neural Beat-funksjonene under merkevaren Re-Master Freddy.</p>
        </div>

        <AdminStudio />

        <div className="admin-grid admin-support-grid">
          <article className="admin-card admin-feature-card">
            <div className="admin-icon"><Youtube size={25} /></div>
            <div>
              <span className="admin-status">Migreringsbro aktiv</span>
              <h2>Dagens komplette studio</h2>
              <p>Bruk dette som reserve mens bildebank og avansert analyse flyttes inn i Re-Master Freddy.</p>
            </div>
            <a className="admin-primary" href={CURRENT_STUDIO_URL} target="_blank" rel="noreferrer">
              Åpne RealtyFlow-studio <ExternalLink size={17} />
            </a>
          </article>

          <article className="admin-card admin-feature-card">
            <div className="admin-icon"><Music2 size={25} /></div>
            <div>
              <span className="admin-status admin-status-progress">Neste migreringsdel</span>
              <h2>Bildebank og analyse</h2>
              <p>Logo, thumbnails, egne bilder, kanalstatistikk og anbefalinger flyttes videre uten å eksponere serverhemmeligheter.</p>
            </div>
          </article>
        </div>

        <section className="admin-card admin-note">
          <ShieldCheck size={22} />
          <div>
            <h3>Sikker tilgang</h3>
            <p>Adminområdet og det nye API-laget kontrollerer Supabase-økten og godtar bare {ADMIN_EMAIL}.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
