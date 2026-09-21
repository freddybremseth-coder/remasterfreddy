import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AdminApp from "./AdminApp";
import AdminEntry from "./AdminEntry";
import MusicArtGallery from "./MusicArtGallery";
import "./styles.css";

function trackSearchDiscovery() {
  const referrer = document.referrer;
  if (!referrer) return;
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { return; }
  const known =
    host.includes("google.") ||
    host === "bing.com" || host.endsWith(".bing.com") ||
    host === "chatgpt.com" || host.endsWith(".chatgpt.com") ||
    host === "copilot.microsoft.com" ||
    host === "perplexity.ai" || host.endsWith(".perplexity.ai") ||
    host === "gemini.google.com" ||
    host === "search.brave.com" ||
    host === "duckduckgo.com" || host.endsWith(".duckduckgo.com");
  if (!known) return;

  const path = window.location.pathname || "/";
  const storageKey = `remaster:search-discovery:${path}:${referrer}`;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");
  } catch {}

  void fetch("https://realtyflow.chatgenius.pro/api/public/search-discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, referrer }),
    keepalive: true,
  }).catch(() => undefined);
}

trackSearchDiscovery();

function PublicSite() {
  return (
    <>
      <App />
      <AdminEntry />
    </>
  );
}

const songGalleryMatch = window.location.pathname.match(/^\/gallery\/([0-9a-f-]{36})\/?$/i);
const page = window.location.pathname === "/admin" ? <AdminApp /> :
  songGalleryMatch ? <MusicArtGallery songId={songGalleryMatch[1]} /> : <PublicSite />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{page}</React.StrictMode>,
);
