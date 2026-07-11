import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  Disc3,
  ExternalLink,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  Youtube,
} from "lucide-react";
import { CyberStage } from "./CyberStage";
import {
  CHANNEL_URL,
  UPLOADS_PLAYLIST_ID,
  VideoItem,
  fallbackVideos,
  getChannelVideos,
} from "./youtube";

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: Record<string, unknown>) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  nextVideo: () => void;
  previousVideo: () => void;
  loadVideoById: (videoId: string) => void;
};

const heroImages = [
  "/assets/studio-deck.jpg",
  "/assets/synth-claw.jpg",
  "/assets/waveform-deck.jpg",
  "/assets/neon-wave-lab.jpg",
];

const visualBars = Array.from({ length: 30 }, (_, index) => index);
const SUBSCRIBE_URL = "https://www.youtube.com/channel/UCPAj3RNC2S_Nv7QV4-oYoIw?sub_confirmation=1";
const RELEASE_CADENCE = "New music every day";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Latest";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function App() {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>(fallbackVideos);
  const [activeVideo, setActiveVideo] = useState<VideoItem>(fallbackVideos[0]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [energy, setEnergy] = useState(0.28);
  const [boost, setBoost] = useState(0.48);
  const [heroIndex, setHeroIndex] = useState(0);
  const stageEnergy = Math.min(1, energy + boost * 0.34);

  useEffect(() => {
    getChannelVideos().then((items) => {
      setVideos(items);
      setActiveVideo(items[0] ?? fallbackVideos[0]);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((index) => (index + 1) % heroImages.length);
    }, 7600);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = 0;

    const tick = (time: number) => {
      if (time - last > 70) {
        const t = time / 1000;
        const pulse = Math.abs(Math.sin(t * (isPlaying ? 3.2 : 0.9)));
        const snap = Math.abs(Math.cos(t * (isPlaying ? 6.4 : 1.2)));
        const target = isPlaying ? 0.42 + pulse * 0.34 + snap * 0.16 : 0.16 + pulse * 0.12;
        setEnergy((value) => value + (target - value) * 0.3);
        last = time;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying]);

  useEffect(() => {
    const buildPlayer = () => {
      if (!window.YT || playerRef.current) return;

      playerRef.current = new window.YT.Player("youtube-player", {
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          controls: 1,
          loop: 1,
          listType: "playlist",
          list: UPLOADS_PLAYLIST_ID,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          mute: 1,
        },
        events: {
          onReady: (event: { target: YouTubePlayer }) => {
            event.target.mute();
            event.target.setVolume(84);
            event.target.playVideo();
            setIsMuted(true);
            setIsPlaying(true);
          },
          onStateChange: (event: { data: number }) => {
            const states = window.YT?.PlayerState;
            if (!states) return;
            if (event.data === states.PLAYING) setIsPlaying(true);
            if (event.data === states.PAUSED || event.data === states.ENDED) setIsPlaying(false);
          },
        },
      });
    };

    if (window.YT?.Player) {
      buildPlayer();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    window.onYouTubeIframeAPIReady = buildPlayer;

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const activeIndex = useMemo(
    () => Math.max(0, videos.findIndex((video) => video.id === activeVideo.id)),
    [activeVideo.id, videos],
  );

  const playChannel = () => {
    playerRef.current?.playVideo();
    setIsPlaying(true);
  };

  const pauseChannel = () => {
    playerRef.current?.pauseVideo();
    setIsPlaying(false);
  };

  const unlockAudio = () => {
    playerRef.current?.unMute();
    playerRef.current?.setVolume(86);
    playerRef.current?.playVideo();
    setIsMuted(false);
    setIsPlaying(true);
  };

  const muteAudio = () => {
    playerRef.current?.mute();
    setIsMuted(true);
  };

  const nextTrack = () => {
    playerRef.current?.nextVideo();
    const next = videos[(activeIndex + 1) % videos.length];
    if (next) setActiveVideo(next);
    setIsPlaying(true);
  };

  const previousTrack = () => {
    playerRef.current?.previousVideo();
    const previous = videos[(activeIndex - 1 + videos.length) % videos.length];
    if (previous) setActiveVideo(previous);
    setIsPlaying(true);
  };

  const loadTrack = (video: VideoItem) => {
    playerRef.current?.loadVideoById(video.id);
    if (!isMuted) playerRef.current?.unMute();
    setActiveVideo(video);
    setIsPlaying(true);
  };

  return (
    <main
      className={`app-shell ${isPlaying ? "is-playing" : ""}`}
      style={
        {
          "--energy": stageEnergy.toFixed(3),
          "--hero-image": `url(${heroImages[heroIndex]})`,
        } as CSSProperties
      }
    >
      <div className="backdrop-image" aria-hidden="true" />
      <CyberStage playing={isPlaying} energy={stageEnergy} />
      <div className="scanline" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <header className="site-header">
        <a className="brand-lockup" href={CHANNEL_URL} target="_blank" rel="noreferrer">
          <img src="/assets/remaster-logo.jpg" alt="Re-Master Freddy logo" />
          <span>
            <strong>Re-Master Freddy</strong>
            <small>Channel engine</small>
          </span>
        </a>
        <nav aria-label="Primary">
          <a href="#tracks">Tracks</a>
          <a href="#synth">Synth</a>
          <a href="#production">Production</a>
          <a href="#gallery">Studio</a>
        </nav>
        <a className="header-action" href={CHANNEL_URL} target="_blank" rel="noreferrer" title="Open YouTube channel">
          <Youtube size={18} />
          <span>YouTube</span>
        </a>
      </header>

      <section className="hero-section" aria-label="Re-Master Freddy player">
        <div className="hero-copy">
          <div className="status-pill">
            <Radio size={16} />
            <span>Live channel feed</span>
            <i />
          </div>
          <h1>RE-MASTER FREDDY</h1>
          <p className="hero-lede">
            Summer house, night-drive EDM and chill electronic beats — new tracks every day.
            Press play and let the channel run: Ibiza sunsets, beach clubs and late-night city drives in one stream.
          </p>

          <div className="transport-panel" id="synth">
            <div className="now-playing">
              <span>Now loaded</span>
              <strong>{activeVideo.title}</strong>
            </div>
            <div className="visualizer" aria-hidden="true">
              {visualBars.map((bar) => (
                <span key={bar} style={{ "--bar": bar } as CSSProperties} />
              ))}
            </div>
            <div className="controls-row">
              <button className="icon-button" type="button" onClick={previousTrack} title="Previous track">
                <SkipBack size={19} />
              </button>
              <button
                className="primary-play"
                type="button"
                onClick={isPlaying ? pauseChannel : playChannel}
                title={isPlaying ? "Pause channel" : "Play channel"}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </button>
              <button className="icon-button" type="button" onClick={nextTrack} title="Next track">
                <SkipForward size={19} />
              </button>
              <button
                className="glass-button"
                type="button"
                onClick={isMuted ? unlockAudio : muteAudio}
                title={isMuted ? "Unmute channel" : "Mute channel"}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                <span>{isMuted ? "Unmute" : "Mute"}</span>
              </button>
            </div>
          </div>

          <div className="production-rig" id="production">
            <a href={SUBSCRIBE_URL} target="_blank" rel="noreferrer">
              <span>Free front-row seat</span>
              <strong>Subscribe on YouTube</strong>
              <ExternalLink size={17} />
            </a>
            <div>
              <span>Release cadence</span>
              <strong>{RELEASE_CADENCE}</strong>
            </div>
          </div>
        </div>

        <aside className="player-console" aria-label="YouTube channel player">
          <div className="console-top">
            <span>Uploads playlist</span>
            <a href={activeVideo.url} target="_blank" rel="noreferrer" title="Open current track">
              <ExternalLink size={17} />
            </a>
          </div>
          <div className="youtube-frame">
            <div id="youtube-player" />
          </div>
          <div className="console-meter">
            <AudioWaveform size={18} />
            <span>{formatDate(activeVideo.published)}</span>
            <strong>{isMuted ? "Muted autoplay" : "Audio unlocked"}</strong>
          </div>
        </aside>
      </section>

      <section className="live-strip" aria-label="Realtime style stats">
        <div>
          <SlidersHorizontal size={18} />
          <span>Glass drive</span>
          <input
            aria-label="Visual intensity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={boost}
            onChange={(event) => setBoost(Number(event.target.value))}
          />
        </div>
        <div>
          <Disc3 size={18} />
          <span>Playlist</span>
          <strong>{videos.length} channel cuts</strong>
        </div>
        <div>
          <Sparkles size={18} />
          <span>Mode</span>
          <strong>{isPlaying ? "Reactive" : "Idle pulse"}</strong>
        </div>
        <div>
          <Radio size={18} />
          <span>Production</span>
          <strong>5 / week</strong>
        </div>
      </section>

      <section className="tracks-section" id="tracks">
        <div className="section-heading">
          <p>Fresh from YouTube</p>
          <h2>Channel tracks</h2>
        </div>
        <div className="track-grid">
          {videos.map((video) => (
            <button
              className={`track-card ${video.id === activeVideo.id ? "active" : ""}`}
              type="button"
              key={video.id}
              onClick={() => loadTrack(video)}
            >
              <img src={video.thumbnail} alt="" loading="lazy" />
              <span>{formatDate(video.published)}</span>
              <strong>{video.title}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="gallery-section" id="gallery">
        <div className="section-heading">
          <p>Visual identity</p>
          <h2>Studio atmosphere</h2>
        </div>
        <div className="gallery-grid">
          <img src="/assets/synth-claw.jpg" alt="Cybernetic hand on a synthesizer" loading="lazy" />
          <img src="/assets/vocal-booth.jpg" alt="Dark studio vocal booth with cyber musician" loading="lazy" />
          <img src="/assets/patch-cable.jpg" alt="Patch cable and synth detail" loading="lazy" />
          <img src="/assets/mic-lab.jpg" alt="Industrial microphone studio setup" loading="lazy" />
        </div>
      </section>
    </main>
  );
}

export default App;
