import { useEffect, useMemo, useState } from "react";
import { BarChart3, Clapperboard, Image, Music2, Play, RefreshCcw, Sparkles, Upload, Youtube } from "lucide-react";
import "./demo.css";

const TOTAL = 15000;
const STEP = TOTAL / 4;

export default function DemoTour15s() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = Date.now() - startedAt;
      if (next >= TOTAL) {
        setElapsed(TOTAL);
        setPlaying(false);
      } else setElapsed(next);
    }, 80);
    return () => window.clearInterval(id);
  }, [playing, startedAt]);

  const step = Math.min(3, Math.floor(elapsed / STEP));
  const progress = Math.min(100, elapsed / TOTAL * 100);
  const seconds = Math.max(0, Math.ceil((TOTAL - elapsed) / 1000));
  const restart = () => { setStartedAt(Date.now()); setElapsed(0); setPlaying(true); };

  const title = useMemo(() => [
    "1. Last opp én sang",
    "2. AI analyserer og bygger pakken",
    "3. Reels Studio lager vertikale klipp",
    "4. Publisering og analyse i samme flyt",
  ][step], [step]);

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <a href="/" className="demo-brand">
          <img src="/assets/remaster-logo.jpg" alt="Re-Master Freddy" />
          <span><strong>Re-Master Freddy</strong><small>15 sec product demo</small></span>
        </a>
        <div className="demo-header-actions"><span className="demo-badge">SYNTHETIC DEMO DATA</span><a href="/">Back</a></div>
      </header>

      <section className="demo-layout">
        <div className="demo-copy">
          <p className="demo-eyebrow">AUTO DEMO · {seconds}s left</p>
          <h1>{title}</h1>
          <p>Dette er en isolert presentasjon. Ingen YouTube-data, produksjonsjobber, filer eller statistikk hentes fra den virkelige kontoen.</p>
          <div className="demo-actions">
            <button onClick={restart}><RefreshCcw size={17} /> Restart</button>
            {!playing && <button className="secondary" onClick={restart}><Play size={17} /> Play 15 sec</button>}
          </div>
          <div className="demo-progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="demo-step-labels"><span className={step===0?"active":""}>Upload</span><span className={step===1?"active":""}>AI + Video</span><span className={step===2?"active":""}>Reels</span><span className={step===3?"active":""}>Publish</span></div>
        </div>

        <div className="demo-console">
          <div className="demo-topbar">
            <div className="demo-brand-mini"><img src="/assets/remaster-logo.jpg" alt="" /><span><strong>Re-Master Admin</strong><small>Demo workspace</small></span></div>
            <span className="demo-badge">DEMO</span>
          </div>

          {step === 0 && <section className="demo-panel">
            <div className="demo-panel-title"><Upload size={20}/><div><h2>New production</h2><p>Drop MP3 and choose workflow</p></div></div>
            <div className="demo-drop"><Music2 size={38}/><strong>demo-summer-track.mp3</strong><span>03:28 · 8.4 MB · synthetic file</span></div>
            <div className="demo-grid three">
              <div><span>Output</span><strong>Full video</strong></div>
              <div><span>Short clips</span><strong>3 reels</strong></div>
              <div><span>Language</span><strong>EN + metadata</strong></div>
            </div>
          </section>}

          {step === 1 && <section className="demo-panel">
            <div className="demo-panel-title"><Sparkles size={20}/><div><h2>AI production package</h2><p>Analysis → visuals → metadata → render</p></div></div>
            <div className="demo-grid two">
              <div className="demo-card"><span>Genre</span><strong>Melodic House</strong><small>Demo analysis</small></div>
              <div className="demo-card"><span>Energy</span><strong>82 / 100</strong><small>Demo score</small></div>
              <div className="demo-card"><span>Visual direction</span><strong>Sunset · Coast · Neon</strong><small>Generated brief</small></div>
              <div className="demo-card"><span>Thumbnail set</span><strong>A / B / C</strong><small>3 synthetic variants</small></div>
            </div>
            <div className="demo-render"><Image size={20}/><div><strong>Full HD render</strong><span>Visual sequence + logo + metadata ready</span></div><b>READY</b></div>
          </section>}

          {step === 2 && <section className="demo-panel">
            <div className="demo-panel-title"><Clapperboard size={20}/><div><h2>Reels Studio</h2><p>Strong sections converted to vertical formats</p></div></div>
            <div className="demo-reels">
              {[["00:42","15 sec","Hook"],["01:31","30 sec","Chorus"],["02:17","45 sec","Peak"]].map(([time,len,label],i)=><div className="demo-phone" key={time}><div className="demo-phone-visual"><span>REEL {i+1}</span><i /></div><strong>{label}</strong><small>Start {time} · {len}</small><b>READY</b></div>)}
            </div>
            <p className="demo-note">All clips and timestamps shown here are demo values. No real channel or song data is used.</p>
          </section>}

          {step === 3 && <section className="demo-panel">
            <div className="demo-panel-title"><Youtube size={20}/><div><h2>Publish + learn</h2><p>Full track, Shorts and feedback in one workflow</p></div></div>
            <div className="demo-publish"><div><Youtube size={22}/><span><strong>Full track</strong><small>Scheduled · 20:00 demo time</small></span><b>READY</b></div><div><Clapperboard size={22}/><span><strong>3 vertical clips</strong><small>Queued after full track</small></span><b>READY</b></div></div>
            <div className="demo-grid three demo-analytics">
              <div><BarChart3 size={18}/><span>Views</span><strong>12 480</strong><small>synthetic</small></div>
              <div><span>CTR</span><strong>7.2%</strong><small>synthetic</small></div>
              <div><span>Watch time</span><strong>418 h</strong><small>synthetic</small></div>
            </div>
            <div className="demo-finish"><strong>One upload → full video → reels → publishing package</strong><span>15-second product walkthrough complete.</span></div>
          </section>}
        </div>
      </section>
    </main>
  );
}
