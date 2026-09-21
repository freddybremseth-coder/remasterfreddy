import {render,screen} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import MixArtThumbnailPreview from "./MixArtThumbnailPreview";
import {loadMixPromotionCatalog} from "./lib/mix-api";

vi.mock("./lib/mix-api",()=>({loadMixPromotionCatalog:vi.fn()}));
const load=vi.mocked(loadMixPromotionCatalog);
describe("Mix Studio Art Lounge thumbnail",()=>{
  beforeEach(()=>{
    load.mockReset();
    load.mockResolvedValue({art:[
      {id:"one",title:"Painting one",style:"symbolic-realism",collection:"human-condition",
        imageUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/one/view.webp",detailUrl:"https://art.freddybremseth.com/verk/one"},
      {id:"two",title:"Painting two",style:"surrealism",collection:"dream",
        imageUrl:"https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/two/view.webp",detailUrl:"https://art.freddybremseth.com/verk/two"},
    ],books:[]});
  });
  it("shows selected title and only approved style artwork in the gallery preview",async()=>{
    render(<MixArtThumbnailPreview title="Stillness in Gold" enabled selectedIds={[]} selectedStyles={["symbolic-realism"]} selectedCollections={[]}/>);
    expect(await screen.findByRole("img",{name:/Stillness in Gold/})).toBeInTheDocument();
    expect(screen.getByText("Stillness in Gold")).toBeInTheDocument();
    expect(document.querySelectorAll(".mix-thumb-wall img")).toHaveLength(1);
    expect(document.querySelector(".mix-thumb-wall img")?.getAttribute("src")).toContain("/one/view.webp");
  });
  it("never shows 2026 static template when owner changes video or playlist title",async()=>{
    render(<MixArtThumbnailPreview title="Blue and Gold — Music Mix" enabled selectedIds={[]} selectedStyles={[]} selectedCollections={[]}/>);
    expect(screen.getByText("Blue and Gold — Music Mix")).toBeInTheDocument();
    expect(screen.queryByText("ART LOUNGE 2026")).not.toBeInTheDocument();
  });
  it("clearly indicates YouTube default artwork when custom template is disabled",()=>{
    render(<MixArtThumbnailPreview title="Art Lounge" enabled={false} selectedIds={[]} selectedStyles={[]} selectedCollections={[]}/>);
    expect(screen.getByText(/standardminiatyrbilde/)).toBeInTheDocument();
    expect(screen.queryByRole("img",{name:/Forhåndsvisning/})).not.toBeInTheDocument();
  });
});
