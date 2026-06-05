import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, LockKeyhole, LogOut, Music2, ShieldCheck, Youtube } from "lucide-react";
import { ADMIN_EMAIL, isSupabaseConfigured, supabase } from "./lib/supabase";
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
    if (!supabase) {
      setState("signed-out");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const sessionEmail = data.session?.user.email?.toLowerCase();
      if (!sessionEmail) setState("signed-out");
      else if (sessionEmail === ADMIN_EMAIL) setState("authorized");
      else setState("forbidden");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = session?.user.email?.toLowerCase();
      if (!sessionEmail) setState("signed-out");
      else if (sessionEmail === ADMIN_EMAIL) setState("authorized");
      else setState("forbidden");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!supabase || !isSupabaseConfigured) {
      setError("Supabase er ikke konfigurert for denne nettsiden ennå.");
      return;
    }

    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setError("Denne e-postadressen har ikke administratortilgang.");
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setSubmitting(false);

    if (signInError) setError(signInError.message);
  }

  async function handleLogout() {
    await supabase?.auth.signOut();
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

        <div className="admin-grid">
          <article className="admin-card admin-feature-card">
            <div className="admin-icon"><Youtube size={25} /></div>
            <div>
              <span className="admin-status">Tilgjengelig</span>
              <h2>YouTube-publisering</h2>
              <p>Last opp MP3, generer metadata og bilder, render video og publiser til Re-Master Freddy-kanalen.</p>
            </div>
            <a className="admin-primary" href={CURRENT_STUDIO_URL} target="_blank" rel="noreferrer">
              Åpne publiseringsstudio <ExternalLink size={17} />
            </a>
          </article>

          <article className="admin-card admin-feature-card">
            <div className="admin-icon"><Music2 size={25} /></div>
            <div>
              <span className="admin-status admin-status-progress">Migrering pågår</span>
              <h2>Re-Master pipeline</h2>
              <p>Selve serverpipelinen flyttes hit i neste steg. Den blir ikke lagt i offentlig frontend, fordi FFmpeg- og YouTube-tokenene må beskyttes.</p>
            </div>
          </article>
        </div>

        <section className="admin-card admin-note">
          <ShieldCheck size={22} />
          <div>
            <h3>Sikker tilgang</h3>
            <p>Adminområdet krever Supabase-innlogging og godtar bare {ADMIN_EMAIL}. Server-API-et får en egen tilgangskontroll i migreringens neste del.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
