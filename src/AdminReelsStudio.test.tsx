import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import AdminReelsStudio from "./AdminReelsStudio";
import {loadSongs} from "./lib/admin-api";
import {loadReelCatalog,loadReelJobs,produceReel} from "./lib/reels-api";
vi.mock("./lib/admin-api",()=>({loadSongs:vi.fn()}));
vi.mock("./lib/reels-api",()=>({
  loadReelCatalog:vi.fn(),loadReelJobs:vi.fn(),produceReel:vi.fn(),
}));
const songs=vi.mocked(loadSongs),catalog=vi.mocked(loadReelCatalog),jobs=vi.mocked(loadReelJobs),produce=vi.mocked(produceReel);
const ID="f89e9787-7bbc-4d75-9c86-f696c9ba1dc1";
const SONG_ID="9405db02-c5f7-4a14-ac66-e538145213a1";
describe("Reels Studio owner-only creative controls",()=>{
  beforeEach(()=>{
    songs.mockReset();catalog.mockReset();jobs.mockReset();produce.mockReset();
    window.localStorage.clear();
    songs.mockResolvedValue([{id:SONG_ID,title:"Sunset Serenity",audioUrl:"https://example.com/music.mp3"}]);
    jobs.mockResolvedValue([]);
    catalog.mockImplementation(async(brand,area)=>{
      if(brand==="art")return {areas:[],items:[
        {id:"art-one",title:"Art One",imageUrl:"https://example.com/a.webp",detailUrl:"https://art.freddybremseth.com/verk/art-one/"},
      ]};
      if(brand==="zeneco")return {areas:["Benidorm","Altea"],
        items:area==="Benidorm"?[{id:ID,title:"Benidorm Villa",area:"Benidorm",
          imageUrl:"https://fotos15.apinmo.com/a.jpg",detailUrl:""}]:[]};
      return {areas:[],items:[]};
    });
  });
  it("does not render art until owner selects a song and artwork, and never publishes automatically",async()=>{
    render(<AdminReelsStudio/>);
    expect(await screen.findByText("Art One")).toBeInTheDocument();
    const create=screen.getByRole("button",{name:/Lag Reel og lagre MP4/i});
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Musikk fra Re-Master Freddy/),{target:{value:SONG_ID}});
    fireEvent.click(screen.getByRole("button",{name:/Art One/}));
    expect(create).toBeEnabled();
    expect(screen.getByText(/Ingenting blir automatisk lagt ut/)).toBeInTheDocument();
    expect(produce).not.toHaveBeenCalled();
  });
  it("requires specific property area and shows only selected town's property",async()=>{
    render(<AdminReelsStudio/>);
    await screen.findByText("Art One");
    fireEvent.click(screen.getByRole("button",{name:/Zen Eco Homes/}));
    expect(await screen.findByRole("option",{name:"Benidorm"})).toBeInTheDocument();
    expect(screen.queryByText("Benidorm Villa")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Boligområde/),{target:{value:"Benidorm"}});
    expect(await screen.findByText("Benidorm Villa")).toBeInTheDocument();
    expect(catalog).toHaveBeenCalledWith("zeneco","Benidorm");
    fireEvent.change(screen.getByLabelText(/Musikk fra Re-Master Freddy/),{target:{value:SONG_ID}});
    expect(screen.getByRole("button",{name:/Lag Reel og lagre MP4/})).toBeEnabled();
  });
  it("shows completed export and caption after one render without a Meta publish call",async()=>{
    vi.stubGlobal("crypto",{randomUUID:()=>ID});
    try{
      produce.mockResolvedValue({id:ID,request_key:ID,title:"Art Lounge — Selected Works",
        brand:"art",area:null,duration_seconds:20,channels:["instagram","facebook"],song_title:"Sunset Serenity",
        visual_items:[{id:"art-one",title:"Art One",detailUrl:"https://art.freddybremseth.com/verk/art-one/"}],
        state:"ready",caption:"Art One\nhttps://art.freddybremseth.com/verk/art-one/",videoUrl:"https://example.com/reel.mp4",
        error:null,created_at:"2026-09-23T12:00:00Z",updated_at:"2026-09-23T12:00:00Z"});
      render(<AdminReelsStudio/>);
      await screen.findByText("Art One");
      fireEvent.change(screen.getByLabelText(/Musikk fra Re-Master Freddy/),{target:{value:SONG_ID}});
      fireEvent.click(screen.getByRole("button",{name:/Art One/}));
      fireEvent.click(screen.getByRole("button",{name:/Lag Reel og lagre MP4/}));
      await waitFor(()=>expect(produce).toHaveBeenCalledWith(expect.objectContaining({
        brand:"art",durationSeconds:20,songId:SONG_ID,selectedIds:["art-one"],
      })));
      expect(await screen.findByRole("link",{name:/Last ned Reel som MP4/}))
        .toHaveAttribute("href","https://example.com/reel.mp4");
      expect(screen.getByDisplayValue(/Art One/)).toBeInTheDocument();
    }finally{vi.unstubAllGlobals();}
  });
});
