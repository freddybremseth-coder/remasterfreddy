import { inspectRenderReadiness, type RenderReadinessInput } from "./lib/render-readiness";

export default function RenderReadinessPanel(props: RenderReadinessInput) {
  const checks = inspectRenderReadiness(props);
  const passed = checks.filter(item => item.ok).length;
  const ready = passed === checks.length;

  return (
    <section className="storyboard-readiness" aria-label="Gratis kontroll før videoproduksjon">
      <div className="storyboard-readiness-heading">
        <strong>Gratis kontroll før videoproduksjon</strong>
        <span role="status">{ready ? "Alle lokale kontroller bestått" : `${passed} av ${checks.length} kontroller bestått`}</span>
      </div>
      <p>Dette er en kostnadsfri sjekkliste basert på opplysningene i redigeringsvinduet. Den starter ikke AI-bilder, videorendering eller YouTube. Backend kontrollerer blant annet faktisk lydlengde på nytt før betalt produksjon.</p>
      <ul className="storyboard-readiness-list">
        {checks.map(check => (
          <li key={check.key} className={check.ok ? "is-passed" : "is-action-needed"}>
            <span aria-hidden="true">{check.ok ? "✓" : "!"}</span>
            <div>
              <strong>{check.title}</strong>
              <p>{check.message}</p>
            </div>
          </li>
        ))}
      </ul>
      {ready && <p className="storyboard-readiness-caution">Klar til å åpne produksjonsbekreftelsen. Dette garanterer ikke at AI-bilder, rendering eller YouTube-opplasting lykkes.</p>}
    </section>
  );
}
