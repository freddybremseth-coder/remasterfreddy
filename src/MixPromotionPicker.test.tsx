import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MixPromotionPicker, { type PromotionDraft } from "./MixPromotionPicker";
import { loadMixPromotionCatalog } from "./lib/mix-api";

vi.mock("./lib/mix-api", () => ({ loadMixPromotionCatalog: vi.fn() }));
const catalogMock = vi.mocked(loadMixPromotionCatalog);

const ART = {
  id: "portrait", title: "Human Condition Portrait", style: "symbolic-realism",
  collection: "human-condition", imageUrl: "https://example.com/view.webp",
  detailUrl: "https://art.freddybremseth.com/verk/portrait/",
};
const BOOK = {
  id: "f644781f-b547-4e9b-92ac-01742dd3fd8a", title: "The Facade of Justice",
  series: "michael-thorne", language: "en",
  imageUrl: "https://books.freddybremseth.com/assets/covers/facade.jpg",
  detailUrl: "https://books.freddybremseth.com/book/the-facade-of-justice",
};

function draft(brand: PromotionDraft["promotionBrand"]): PromotionDraft {
  return {promotionBrand:brand,artStyles:[],artCollections:[],artIds:[],
    bookSeries:[],bookLanguages:[],bookIds:[]};
}

describe("cross-brand mix visual picker",()=>{
  beforeEach(()=>{
    catalogMock.mockReset();
    catalogMock.mockResolvedValue({art:[ART],books:[BOOK]});
  });

  it("selects an individual published art preview, never the master",async()=>{
    const onChange=vi.fn();
    render(<MixPromotionPicker draft={draft("art")} onChange={onChange}/>);
    const button=await screen.findByRole("button",{name:/Human Condition Portrait/i});
    expect(button).toBeInTheDocument();
    expect(screen.queryByText("The Facade of Justice")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith({artIds:["portrait"]});
  });

  it("filters published book covers by series and does not offer art previews",async()=>{
    const onChange=vi.fn();
    render(<MixPromotionPicker draft={draft("books")} onChange={onChange}/>);
    expect(await screen.findByRole("button",{name:/The Facade of Justice/i})).toBeInTheDocument();
    expect(screen.queryByText("Human Condition Portrait")).not.toBeInTheDocument();
    const series=screen.getByRole("checkbox",{name:/michael thorne/i});
    fireEvent.click(series);
    expect(onChange).toHaveBeenCalledWith({bookSeries:["michael-thorne"],bookIds:[]});
    await waitFor(()=>expect(catalogMock).toHaveBeenCalledTimes(1));
  });

  it("identifies the exact hidden artwork and offers add-actual-style or remove-work repairs without silently clearing the other IDs",async()=>{
    const onChange=vi.fn();
    const incompatible={
      id:"kongelig-gatekunst-hap-smerte-og-kjrlighet",
      title:"Royal Street Art: Hope, Pain and Love",
      style:"symbolic-street-art",collection:"symbolic-street-art",
      imageUrl:"https://example.com/royal.webp",
      detailUrl:"https://art.freddybremseth.com/verk/kongelig-gatekunst-hap-smerte-og-kjrlighet/",
    };
    catalogMock.mockResolvedValue({art:[ART,incompatible],books:[BOOK]});
    const saved={...draft("art"),artStyles:["street-art","symbolic-realism"],
      artIds:[ART.id,incompatible.id]};
    render(<MixPromotionPicker draft={saved} onChange={onChange}/>);
    expect(await screen.findByText("Royal Street Art: Hope, Pain and Love")).toBeInTheDocument();
    expect(screen.getByText(/Verkets stil er «symbolic-street-art»/)).toBeInTheDocument();
    expect(screen.getByText(/kongelig-gatekunst-hap-smerte-og-kjrlighet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Legg til kunststilen «symbolic-street-art»/}));
    expect(onChange).toHaveBeenCalledWith({artStyles:["street-art","symbolic-realism","symbolic-street-art"]});
    fireEvent.click(screen.getByRole("button",{name:/Fjern dette kunstverket fra miksen/}));
    expect(onChange).toHaveBeenCalledWith({artIds:[ART.id]});
  });

  it("does not query another brand when Zen Eco Homes alone is selected",()=>{
    render(<MixPromotionPicker draft={draft("zeneco")} onChange={vi.fn()}/>);
    expect(catalogMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button",{name:/Zen Eco Homes/i})).toHaveAttribute("aria-pressed","true");
  });
});
