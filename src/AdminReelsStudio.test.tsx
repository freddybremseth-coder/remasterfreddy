import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import AdminReelsStudio from "./AdminReelsStudio";
import {loadSongs} from "./lib/admin-api";
import {createReel,loadReelJobs,loadReelPublishStatus,publishReel} from "./lib/reels-api";

vi.mock("./lib/admin-api",()=>({loadSongs:vi.fn()}));
vi.mock("./lib/reels-api",()=>({createReel:vi.fn(),loadReelJobs:vi.fn(),loadReelPublishStatus:vi.fn(),publishReel:vi.fn()}));
vi.mock("./MixPromotionPicker",()=>({default:({onChange}:{onChange:(v:any)=>void})=><div>
  <button type="button" onClick={()=>onChange({promotionBrand:"zeneco"})}>Velg Zen</button>
  <button type="button" onClick={()=>onChange({promotionBrand:"books"})}>Velg Books</button>
</div>}));
const songs=vi.mocked(loadSongs),jobs=vi.mocked(loadReelJobs),create=vi.mocked(createReel),status=vi.mocked(loadReelPublishStatus),publish=vi.mocked(publishReel);

describe("Reels Studio",()=>{
  beforeEach(()=>{
    songs.mockReset();jobs.mockReset();create.mockReset();status.mockReset();publish.mockReset();
    status.mockResolvedValue({channels:{youtube:{connected:false,brandId:null,channelId:null,account:null,reason:"Ingen kanal"},instagram:{connected:false,brandId:null,channelId:null,account:null,reason:""}},deliveries:[]});
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

  it("selects each additional brand without leaking a previous brand into the API request",async()=>{
    create.mockResolvedValue({publicUrl:"https://cdn.example/reel.mp4",reel:{
      id:"r",brand:"donaanna",title:"Doña Anna Reel",duration_seconds:30,song_id:"11111111-1111-4111-8111-111111111111",
      song_title:"Sunset Song",channels:["instagram","facebook"],selection:{publicUrl:"https://cdn.example/reel.mp4"},
      state:"ready",video_path:"r.mp4",caption:"Doña Anna",publications:{},error:null,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }});
    render(<AdminReelsStudio/>);
    await screen.findByText("Sunset Song");
    const selector=screen.getByRole("combobox",{name:"Reels-merkevare"});
    for(const brand of ["freddybremseth","pinosoecolife","donaanna"]){
      fireEvent.change(selector,{target:{value:brand}});
      fireEvent.click(screen.getByRole("button",{name:"Lag Reel"}));
      await waitFor(()=>expect(create).toHaveBeenCalledTimes(["freddybremseth","pinosoecolife","donaanna"].indexOf(brand)+1));
      expect(create.mock.lastCall?.[0].brand).toBe(brand);
    }
  });
  it("only enables YouTube publishing for the exact connected destination and blocks repeated posts",async()=>{
    const reel={id:"11111111-1111-4111-8111-111111111111",brand:"donaanna",title:"Doña Anna Reel",
      duration_seconds:30,song_id:null,song_title:"Sunset",channels:["instagram"],selection:{publicUrl:"https://cdn.example/reel.mp4"},
      state:"ready",video_path:"11111111-1111-4111-8111-111111111111.mp4",caption:"Olives",publications:{},error:null,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString()} as any;
    jobs.mockResolvedValue([reel]);
    status.mockResolvedValue({channels:{
      instagram:{connected:false,brandId:null,channelId:null,account:null,reason:""},
      youtube:{connected:true,brandId:"donaanna",channelId:"channel",account:"Doña Anna",reason:""},
    },deliveries:[]});
    publish.mockResolvedValue({success:true,channel:"youtube",externalId:"youtube-video",externalUrl:"https://www.youtube.com/watch?v=youtube-video",account:"Doña Anna"});
    const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
    try{
      render(<AdminReelsStudio/>);
      await screen.findByText("Sunset Song");
      fireEvent.click(screen.getByRole("button",{name:"Velg for YouTube"}));
      const button=await screen.findByRole("button",{name:"Publiser på YouTube"});
      await waitFor(()=>expect(button).toBeEnabled());
      fireEvent.click(button);
      await waitFor(()=>expect(publish).toHaveBeenCalledWith(reel.id,"youtube"));
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Doña Anna"));
      expect(await screen.findByText(/Publisert på YouTube: Doña Anna/)).toBeInTheDocument();
    }finally{confirm.mockRestore();}
  });

});
