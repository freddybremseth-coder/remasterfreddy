import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminMixStudioProduction from "./AdminMixStudioProduction";
import { createMixDraft, loadMixJobs, startMixProduction, type MixJob } from "./lib/mix-api";

vi.mock("./AdminMixStudio", () => ({ default: () => <div>Music picker</div> }));
vi.mock("./lib/mix-api", () => ({
  createMixDraft: vi.fn(), loadMixJobs: vi.fn(), startMixProduction: vi.fn(),
}));

const jobs = vi.mocked(loadMixJobs);
const create = vi.mocked(createMixDraft);
const start = vi.mocked(startMixProduction);
const active:MixJob = {
  id:"2a546fdd-fb42-471e-9fee-89d4eb0ccd26", title:"Art Lounge",
  style:"morning-chill", target_minutes:30, crossfade_seconds:8,
  playlist_name:"Art & Music", zenecohomes_enabled:false, visual_region:"any",
  visual_type:"mixed", sponsor_interval_minutes:10,
  track_ids:["song-a","song-b"], status:"running",
  pipeline_step:"rendering_visuals_v4", progress:18,
  created_at:"2026-09-21T16:48:49Z", updated_at:new Date().toISOString(),
  heartbeat_at:new Date().toISOString(),
};

describe("Re-Master mix production status", () => {
  beforeEach(() => {
    jobs.mockReset(); create.mockReset(); start.mockReset();
    window.localStorage.clear();
    jobs.mockResolvedValue([active]);
  });

  it("restores existing active mix from server after reload, with live stage and progress", async () => {
    render(<AdminMixStudioProduction/>);
    expect(await screen.findByText("Art Lounge")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow","18");
    expect(screen.getByText("Lager videobildene og legger på musikken")).toBeInTheDocument();
    expect(window.localStorage.getItem("remaster-mix-active-job-v1")).toBe(active.id);
    expect(screen.getByRole("button",{name:"Miks er allerede i produksjon"})).toBeDisabled();
  });

  it("checks for existing server job before creating new job, avoiding duplicate YouTube videos", async () => {
    render(<AdminMixStudioProduction/>);
    await screen.findByText("Art Lounge");
    // Even if a previous status were a draft, the server preflight is authoritative.
    expect(start).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Oppdater status"}));
    await waitFor(()=>expect(jobs).toHaveBeenCalledTimes(2));
    expect(create).not.toHaveBeenCalled();
  });

  it("recovers published YouTube link after tab reload", async () => {
    jobs.mockResolvedValue([{...active,status:"completed",progress:100,pipeline_step:"completed",
      youtube_url:"https://www.youtube.com/watch?v=artmix2026"}]);
    render(<AdminMixStudioProduction/>);
    expect(await screen.findByRole("link",{name:/Åpne ferdig miks på YouTube/i}))
      .toHaveAttribute("href","https://www.youtube.com/watch?v=artmix2026");
  });

  it("warns about a stale heartbeat without claiming the render has stopped", async()=>{
    jobs.mockResolvedValue([{...active,heartbeat_at:new Date(Date.now()-12*60_000).toISOString(),
      updated_at:new Date(Date.now()-12*60_000).toISOString()}]);
    render(<AdminMixStudioProduction/>);
    expect(await screen.findByText(/Ingen ny status fra produksjonsmotoren på over åtte minutter/))
      .toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Miks er allerede i produksjon"})).toBeDisabled();
  });
});

it("reports a stalled Art Lounge as stopped and keeps the saved selections intact",async()=>{
  jobs.mockResolvedValue([{
    ...active,status:"failed",pipeline_step:"render_stalled_needs_review",
    error_code:"MIX_RENDER_STALLED_NEEDS_REVIEW",
    error_message:"Rendering feilet på 18%.",progress:18,
  }]);
  render(<AdminMixStudioProduction/>);
  expect(await screen.findByText("Art Lounge")).toBeInTheDocument();
  expect(screen.getByText("Renderingen stoppet. Nytt forsøk krever feilsøking.")).toBeInTheDocument();
  expect(screen.getByText(/Automatisk omstart er deaktivert/)).toBeInTheDocument();
  expect(screen.queryByText(/Ingen ny status fra produksjonsmotoren på over åtte minutter/)).not.toBeInTheDocument();
});

it("restores exact failed Art and Champagne tracks and selected art without creating or starting a duplicate video",async()=>{
  jobs.mockResolvedValue([{
    ...active,id:"b3e27aed-ce0b-4284-ab84-9b40ab9a0c7b",
    title:"Art and Champagne",status:"failed",progress:12,
    pipeline_step:"failed",error_code:"MIX_PROMOTION_SELECTION_INVALID",
    error_message:"Royal Street Art: Hope, Pain and Love has style symbolic-street-art.",
    youtube_url:null,youtube_upload_started_at:null,youtube_video_id:null,
    track_ids:["song-a","song-b"],
    input_snapshot:{visualPlan:{
      brand:"art",artStyles:["street-art","symbolic-realism"],
      artIds:["kongelig-gatekunst-hap-smerte-og-kjrlighet","quiet-figure"],
      artCollections:[],bookIds:[],thumbnailStyle:"art-lounge",
    }},
  }]);
  window.localStorage.setItem("remaster-mediterranean-mix-draft-v1",JSON.stringify({title:"My other saved mix"}));
  render(<AdminMixStudioProduction/>);
  expect(await screen.findByText("Art and Champagne")).toBeInTheDocument();
  expect(screen.getByText(/Royal Street Art: Hope, Pain and Love has style symbolic-street-art/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:/Gjenopprett dette utkastet og vis bildet som må rettes/}));
  const restored=JSON.parse(window.localStorage.getItem("remaster-mediterranean-mix-draft-v1")||"{}");
  expect(restored.title).toBe("Art and Champagne");
  expect(restored.artStyles).toEqual(["street-art","symbolic-realism"]);
  expect(restored.artIds).toEqual(["kongelig-gatekunst-hap-smerte-og-kjrlighet","quiet-figure"]);
  expect(restored.selectedSongIds).toEqual(["song-a","song-b"]);
  expect(JSON.parse(window.localStorage.getItem("remaster-mediterranean-mix-draft-v1-backup-before-recovery")||"{}").title)
    .toBe("My other saved mix");
  expect(create).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  expect(screen.getByText(/Ingenting er startet automatisk/)).toBeInTheDocument();
});
