import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AdminApp from "./AdminApp";
import AdminEntry from "./AdminEntry";
import "./styles.css";

function PublicSite() {
  return (
    <>
      <App />
      <AdminEntry />
    </>
  );
}

const page = window.location.pathname === "/admin" ? <AdminApp /> : <PublicSite />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{page}</React.StrictMode>,
);
