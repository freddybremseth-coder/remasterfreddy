import {fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import AdminMixStudio from "./AdminMixStudio";
import {loadSongs} from "./lib/admin-api";

vi.mock("./lib/admin-api",()=>({loadSongs:vi.fn()}));
vi.mock("./MixPromotionPicker",()=>({default:({onChange}:{onChange:(v:unknown)=>void})=>
  <button type="button" onClick={()=>onChange({promotionBrand:"books"})}>Velg books</button>}));
vi.mock("./MixArtThumbnailPreview",()=>({default:()=>null}));
const songs=vi.mocked(loadSongs);
describe("Mix Studio saved brand-aware comment templates",()=>{
  beforeEach(()=>{window.localStorage.clear();songs.mockReset();songs.mockResolvedValue([]);});
  it("defaults to detailed and persists short style into the same saved draft the backend receives",()=>{
    render(<AdminMixStudio/>);
    fireEvent.change(screen.getByLabelText("Kommentarens lengde"),{target:{value:"short"}});
    fireEvent.click(screen.getByRole("button",{name:"Lagre mix-utkast"}));
    const saved=JSON.parse(window.localStorage.getItem("remaster-mediterranean-mix-draft-v1")||"{}");
    expect(saved.commentStyle).toBe("short");
    expect(saved.promotionBrand).toBe("zeneco");
    expect(screen.getByText(/Lenkene til enkeltverk settes inn etter endelig bildeutvalg/)).toBeInTheDocument();
  });
  it("defaults to 5-minute short mixes and persists chosen 3-minute length",()=>{
    render(<AdminMixStudio/>);
    const length=screen.getByLabelText("Mållengde") as HTMLSelectElement;
    expect(length.value).toBe("5");
    expect(screen.getByRole("option",{name:"3 minutter"})).toBeInTheDocument();
    fireEvent.change(length,{target:{value:"3"}});
    fireEvent.click(screen.getByRole("button",{name:"Lagre mix-utkast"}));
    const saved=JSON.parse(window.localStorage.getItem("remaster-mediterranean-mix-draft-v1")||"{}");
    expect(saved.targetMinutes).toBe(3);
  });
  it("switches between brands and previews the correct destination",()=>{
    render(<AdminMixStudio/>);
    fireEvent.click(screen.getByRole("button",{name:"Velg books"}));
    expect(screen.getByText(/https:\/\/books\.freddybremseth\.com\/|books\.freddybremseth\.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Lagre mix-utkast"}));
    const saved=JSON.parse(window.localStorage.getItem("remaster-mediterranean-mix-draft-v1")||"{}");
    expect(saved.promotionBrand).toBe("books");
    expect(saved.commentStyle).toBe("detailed");
  });
});
