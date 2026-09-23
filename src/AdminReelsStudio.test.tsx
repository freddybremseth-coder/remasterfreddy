import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import AdminReelsStudio from "./AdminReelsStudio";
import {loadSongs} from "./lib/admin-api";
import {createReel,loadReelJobs} from "./lib/reels-api";

vi.mock("./lib/admin-api",()=>({loadSongs:vi.fn()}));
vi.mock("./lib/reels-api",()=>({createReel:vi.fn(),loadReelJobs:vi.fn()}));
vi.mock("./MixPromotionPicker",()=>({default:({onChange}:{onChange:(v:any)=>void})=><div>
  <button type="button" onClick={()=>onChange({promotionBrand:"zeneco"})}>Velg Zen</button>
  <button type="button" onClick={()=>onChange({promotionBrand:"books"})}>Velg Books</button>
</div>}));
const songs=vi.mocked(loadSongs),jobs=vi.mocked(loadReelJobs),create=vi.mocked(createReel);

describe("Reels Studio",()=>{
  beforeEach(()=>{
    songs.mockReset();jobs.mockReset();create.mockReset();
    songs.mockResolvedValue([{id:"11111111-1111-4111-8111-111111111111",title:"Sunset Song",artist:"Re-Master Freddy",audioUrl:"https://example.com/song.mp3"} as any]);
    jobs.mockResolvedValue([]);
  });
  it("offers the requested short Reel lengths and both social destinations",async()=>{
    render(<AdminReelsStudio/>);
    expect(await screen.findByText("Sunset Song")).toBeInTheDocument();
    const length=screen.getByLabelText("Lengde");
    for(const value of ["15","20","30","45","60"])expect(length.querySelector(`option[value="${value}"]`)).toBeTruthy();
    expect(screen.getByRole("checkbox",{name:"Instagram Reels"})).toBeChecked();
    expect(screen.getByRole("checkbox",{name:"Facebook Reels"})).toBeChecked();
  });
  it("lets property reels target a specific area and passes area/type to renderer",async()=>{
    create.mockResolvedValue({publicUrl:"https://cdn.example/reel.mp4",reel:{
      id:"r",brand:"zeneco",title:"Costa Blanca Homes Reel",duration_seconds:30,song_id:"11111111-1111-4111-8111-111111111111",
      song_title:"Sunset Song",channels:["instagram","facebook"],selection:{publicUrl:"https://cdn.example/reel.mp4"},
      state:"ready",video_path:"r.mp4",caption:"Homes",publications:{},error:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }});
    render(<AdminReelsStudio/>);
    await screen.findByText("Sunset Song");
    fireEvent.click(screen.getByRole("button",{name:"Velg Zen"}));
    fireEvent.change(screen.getByLabelText("Spesifikt område / by"),{target:{value:"Benidorm"}});
    fireEvent.change(screen.getByLabelText("Region"),{target:{value:"north"}});
    fireEvent.click(screen.getByRole("button",{name:"Lag Reel"}));
    await waitFor(()=>expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({brand:"zeneco",areaQuery:"Benidorm",region:"north",durationSeconds:30,
      channels:["instagram","facebook"]});
    expect(await screen.findByText(/Reel ferdig: 30 sekunder/)).toBeInTheDocument();
  });
  it("can switch to Books without sharing Zen property area",async()=>{
    create.mockResolvedValue({publicUrl:"https://cdn.example/book.mp4",reel:{
      id:"b",brand:"books",title:"Books & Music Reel",duration_seconds:20,song_id:"11111111-1111-4111-8111-111111111111",
      song_title:"Sunset Song",channels:["instagram"],selection:{publicUrl:"https://cdn.example/book.mp4"},
      state:"ready",video_path:"b.mp4",caption:"Books",publications:{},error:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }});
    render(<AdminReelsStudio/>);await screen.findByText("Sunset Song");
    fireEvent.click(screen.getByRole("button",{name:"Velg Books"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"Facebook Reels"}));
    fireEvent.change(screen.getByLabelText("Lengde"),{target:{value:"20"}});
    fireEvent.click(screen.getByRole("button",{name:"Lag Reel"}));
    await waitFor(()=>expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({brand:"books",areaQuery:"",durationSeconds:20,channels:["instagram"]});
  });
});
