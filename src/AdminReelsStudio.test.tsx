import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import AdminReelsStudio from "./AdminReelsStudio";
import {loadSongs} from "./lib/admin-api";
import {loadMixPromotionCatalog} from "./lib/mix-api";
import {loadReels,renderReel} from "./lib/reel-api";

vi.mock("./lib/admin-api",()=>({loadSongs:vi.fn()}));
vi.mock("./lib/mix-api",()=>({loadMixPromotionCatalog:vi.fn()}));
vi.mock("./lib/reel-api",()=>({loadReels:vi.fn(),renderReel:vi.fn()}));

const songs=vi.mocked(loadSongs);
const catalog=vi.mocked(loadMixPromotionCatalog);
const reels=vi.mocked(loadReels);
const renderApi=vi.mocked(renderReel);

describe("Re-Master Reels Studio",()=>{
  beforeEach(()=>{
    songs.mockReset();catalog.mockReset();reels.mockReset();renderApi.mockReset();
    songs.mockResolvedValue([{id:"song-1",title:"Blue Hour",audioUrl:"https://example.com/song.mp3",genre:"deep house"}]);
    catalog.mockResolvedValue({
      art:[{id:"art-1",title:"Stillness in Gold",style:"symbolic-realism",collection:"human-condition",imageUrl:"https://example.com/a.webp",detailUrl:"https://art.freddybremseth.com/verk/art-1/"}],
      books:[{id:"book-1",title:"The Facade of Justice",series:"michael-thorne",language:"en",imageUrl:"https://example.com/b.jpg",detailUrl:"https://books.freddybremseth.com/book/the-facade-of-justice"}],
    });
    reels.mockResolvedValue([]);
    renderApi.mockResolvedValue({
      id:"reel-1",brand:"zeneco",title:"Finestrat Homes Reel",duration_seconds:30,song_id:"song-1",song_title:"Blue Hour",
      region:"north",town:"Finestrat",visual_type:"villas",selection:{},assets:[],channels:["instagram","facebook"],
      state:"ready",video_path:"reel-1.mp4",video_url:"https://example.com/reel.mp4",caption:"Homes in Finestrat",created_at:"2026-09-23T00:00:00Z",updated_at:"2026-09-23T00:00:00Z",
    });
  });

  it("renders a brand/area-specific 9:16 Reel request with selected song and both social targets",async()=>{
    render(<AdminReelsStudio/>);
    await screen.findByText("Stillness in Gold");
    fireEvent.click(screen.getByRole("button",{name:/Zen Eco Homes/i}));
    fireEvent.change(screen.getByPlaceholderText(/Benidorm, Finestrat, Villajoyosa/),{target:{value:"Finestrat"}});
    fireEvent.change(screen.getByLabelText("Boligbilder"),{target:{value:"villas"}});
    fireEvent.change(screen.getByLabelText("Reel-tittel"),{target:{value:"Finestrat Homes Reel"}});
    fireEvent.click(screen.getByRole("button",{name:"Lag Reel"}));
    await waitFor(()=>expect(renderApi).toHaveBeenCalledTimes(1));
    expect(renderApi).toHaveBeenCalledWith(expect.objectContaining({
      title:"Finestrat Homes Reel",brand:"zeneco",durationSeconds:30,songId:"song-1",
      channels:["instagram","facebook"],region:"north",town:"Finestrat",visualType:"villas",
    }));
    expect(await screen.findByText(/ferdig rendret i 1080 × 1920/)).toBeInTheDocument();
    expect(screen.getByRole("link",{name:/Åpne MP4/})).toHaveAttribute("href","https://example.com/reel.mp4");
  });

  it("supports a manually selected artwork without mixing in the book catalog",async()=>{
    render(<AdminReelsStudio/>);
    const art=await screen.findByText("Stillness in Gold");
    fireEvent.click(art.closest("button")!);
    fireEvent.change(screen.getByLabelText("Lengde"),{target:{value:"15"}});
    fireEvent.click(screen.getByRole("button",{name:"Lag Reel"}));
    await waitFor(()=>expect(renderApi).toHaveBeenCalled());
    expect(renderApi).toHaveBeenCalledWith(expect.objectContaining({
      brand:"art",durationSeconds:15,artIds:["art-1"],bookIds:[],
    }));
  });
});
