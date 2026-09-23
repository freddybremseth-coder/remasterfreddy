import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ExternalLink, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { loadMixPromotionCatalog, type PromotionBrand, type PromotionCatalog, type PromotionItem } from "./lib/mix-api";

export type PromotionDraft = {
  promotionBrand: PromotionBrand;
  artStyles: string[];
  artCollections: string[];
  artIds: string[];
  bookSeries: string[];
  bookLanguages: string[];
  bookIds: string[];
};
type Props = {
  draft: PromotionDraft;
  onChange: (patch: Partial<PromotionDraft>) => void;
  allowNone?: boolean;
};

const BRANDS: Array<{id:PromotionBrand;name:string;description:string}> = [
  {id:"zeneco",name:"Zen Eco Homes",description:"Boliger og Costa Blanca-livsstil"},
  {id:"art",name:"Freddy Bremseth Art",description:"Kunstverk fra art.freddybremseth.com"},
  {id:"books",name:"Freddy Bremseth Books",description:"Bøker fra books.freddybremseth.com"},
  {id:"none",name:"Bare Re-Master Freddy",description:"Musikk og nøytrale musikkbilder"},
];

function toggle(list:string[],value:string):string[] {
  return list.includes(value) ? list.filter(x=>x!==value) : [...list,value];
}

function facetPicker(
  name:string, values:string[], selected:string[], onChange:(values:string[])=>void,
) {
  return (
    <fieldset className="mix-facet">
      <legend>{name} <small>Tomt utvalg = alle</small></legend>
      <div className="mix-facet-options">
        {values.map(value=>(
          <label key={value} className="mix-facet-label">
            <input type="checkbox" checked={selected.includes(value)}
              onChange={()=>onChange(toggle(selected,value))} />
            {value.replace(/-/g," ")}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function safeItems(items:PromotionItem[],draft:PromotionDraft) {
  return items.filter(item=>
    draft.promotionBrand==="art"
      ? (!draft.artStyles.length||draft.artStyles.includes(item.style||"")) &&
        (!draft.artCollections.length||draft.artCollections.includes(item.collection||""))
      : (!draft.bookSeries.length||draft.bookSeries.includes(item.series||"")) &&
        (!draft.bookLanguages.length||draft.bookLanguages.includes(item.language||""))
  );
}

export default function MixPromotionPicker({draft,onChange,allowNone=true}:Props) {
  const [catalog,setCatalog] = useState<PromotionCatalog|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [search,setSearch] = useState("");

  async function refresh() {
    setLoading(true);setError("");
    try { setCatalog(await loadMixPromotionCatalog()); }
    catch(err){ setError(err instanceof Error?err.message:"Kunne ikke hente kunst- og bokkatalogen."); }
    finally {setLoading(false);}
  }
  useEffect(()=>{if((draft.promotionBrand==="art"||draft.promotionBrand==="books")&&!catalog&&!loading)void refresh();},[draft.promotionBrand]);

  const items = draft.promotionBrand==="art"?catalog?.art||[]:catalog?.books||[];
  const filtered=useMemo(()=>safeItems(items,draft),[items,draft]);
  const chosenIds=draft.promotionBrand==="art"?draft.artIds:draft.bookIds;
  const available=filtered.filter(item=>!chosenIds.length||chosenIds.includes(item.id));
  // A saved explicit selection can become incompatible when styles or collections
  // change. Never hide these works in the filtered grid and then fail after
  // minutes of audio encoding: show the *actual title* and a one-click repair.
  const conflicts=chosenIds.flatMap(id=>{
    const item=items.find(candidate=>candidate.id===id);
    if(!item)return [{id,title:id,reason:"Dette verket er ikke i den publiserte katalogen, eller mangler offentlig forhåndsvisning.",item:null as PromotionItem|null,facet:"missing"}];
    if(draft.promotionBrand==="art"){
      if(draft.artStyles.length&&!draft.artStyles.includes(item.style||""))
        return [{id,title:item.title,reason:"Verkets stil er «"+(item.style||"ukjent")+"», men denne stilen er ikke valgt.",item,facet:"style"}];
      if(draft.artCollections.length&&!draft.artCollections.includes(item.collection||""))
        return [{id,title:item.title,reason:"Verkets kolleksjon er «"+(item.collection||"ukjent")+"», men denne kolleksjonen er ikke valgt.",item,facet:"collection"}];
    }else{
      if(draft.bookSeries.length&&!draft.bookSeries.includes(item.series||""))
        return [{id,title:item.title,reason:"Bokens serie er «"+(item.series||"ukjent")+"», men denne serien er ikke valgt.",item,facet:"series"}];
      if(draft.bookLanguages.length&&!draft.bookLanguages.includes(item.language||""))
        return [{id,title:item.title,reason:"Bokens språk er «"+(item.language||"ukjent")+"», men dette språket er ikke valgt.",item,facet:"language"}];
    }
    return [];
  });
  const visible=filtered.filter(item=>item.title.toLowerCase().includes(search.toLowerCase())).slice(0,120);
  const unique=(field:keyof PromotionItem)=>[...new Set(items.map(item=>String(item[field]||"")).filter(Boolean))].sort();

  return (
    <div className="mix-section mix-sponsor-section">
      <div>
        <p className="admin-eyebrow">Promotering fra din portefølje</p>
        <h3>Hvilket merke skal videoen vise?</h3>
        <p>Musikken er alltid fra Re-Master Freddy. Velg ett merke for bilder, visuell profil og lenker i denne miksen.</p>
      </div>
      <div className="mix-promotion-brands">
        {BRANDS.filter(brand=>allowNone || brand.id!=="none").map(brand=>(
          <button type="button" key={brand.id}
            className={`mix-brand-card ${draft.promotionBrand===brand.id?"active":""}`}
            aria-pressed={draft.promotionBrand===brand.id}
            onClick={()=>onChange({promotionBrand:brand.id})}>
            {brand.id==="books"?<BookOpen size={20}/>:<ImageIcon size={20}/>}
            <strong>{brand.name}</strong><small>{brand.description}</small>
          </button>
        ))}
      </div>
      {(draft.promotionBrand==="art"||draft.promotionBrand==="books")&&(
        <>
          <div className="mix-section-heading">
            <div>
              <h3>{draft.promotionBrand==="art"?"Velg kunsttyper eller enkeltverk":"Velg bokserier eller enkeltbøker"}</h3>
              <p>Videoen trekker tilfeldig bare fra dette utvalget. Ingen andre verk/bøker legges til automatisk.</p>
            </div>
            <button type="button" className="admin-secondary" onClick={refresh} disabled={loading}>
              {loading?<Loader2 className="admin-spinner" size={16}/>:<RefreshCw size={16}/>} Oppdater katalog
            </button>
          </div>
          {error&&<div className="admin-error">{error}</div>}
          {loading&&!catalog&&<div className="admin-empty">Henter publiserte bilder og omslag …</div>}
          {catalog&&draft.promotionBrand==="art"&&(
            <>
              {facetPicker("Kunststil",unique("style"),draft.artStyles,artStyles=>onChange({artStyles,artIds:[]}))}
              {facetPicker("Kolleksjon",unique("collection"),draft.artCollections,artCollections=>onChange({artCollections,artIds:[]}))}
            </>
          )}
          {catalog&&draft.promotionBrand==="books"&&(
            <>
              {facetPicker("Bokserie",unique("series"),draft.bookSeries,bookSeries=>onChange({bookSeries,bookIds:[]}))}
              {facetPicker("Språk",unique("language"),draft.bookLanguages,bookLanguages=>onChange({bookLanguages,bookIds:[]}))}
            </>
          )}
          {catalog&&(
            <>
              {conflicts.length>0&&(
                <div className="admin-error mix-selection-conflicts" role="alert">
                  <strong>{conflicts.length} manuelt valgt {draft.promotionBrand==="art"?"kunstverk":"bok"} passer ikke til filtrene.</strong>
                  <p>Rett utvalget før du lagrer eller starter produksjon. Ingen verk blir fjernet automatisk.</p>
                  {conflicts.map(conflict=>(
                    <div className="mix-selection-conflict" key={conflict.id}>
                      {conflict.item?.imageUrl&&<img src={conflict.item.imageUrl} alt="" loading="lazy"/>}
                      <div>
                        <strong>{conflict.title}</strong>
                        <small>Referanse: {conflict.id}</small>
                        <p>{conflict.reason}</p>
                        <div className="mix-actions">
                          {conflict.item&&conflict.facet!=="missing"&&
                            <button type="button" className="admin-secondary"
                              onClick={()=>{
                                const item=conflict.item!;
                                if(conflict.facet==="style")onChange({artStyles:[...new Set([...draft.artStyles,item.style!])]});
                                if(conflict.facet==="collection")onChange({artCollections:[...new Set([...draft.artCollections,item.collection!])]});
                                if(conflict.facet==="series")onChange({bookSeries:[...new Set([...draft.bookSeries,item.series!])]});
                                if(conflict.facet==="language")onChange({bookLanguages:[...new Set([...draft.bookLanguages,item.language!])]});
                              }}>Legg til {conflict.facet==="style"?"kunststilen":conflict.facet==="collection"?"kolleksjonen":conflict.facet==="series"?"bokserien":"språket"} «{conflict.facet==="style"?conflict.item.style:conflict.facet==="collection"?conflict.item.collection:conflict.facet==="series"?conflict.item.series:conflict.item.language}»</button>}
                          <button type="button" className="admin-secondary"
                            onClick={()=>onChange(draft.promotionBrand==="art"
                              ?{artIds:draft.artIds.filter(value=>value!==conflict.id)}
                              :{bookIds:draft.bookIds.filter(value=>value!==conflict.id)})}>
                            Fjern dette {draft.promotionBrand==="art"?"kunstverket":"bokomslaget"} fra miksen
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mix-track-summary">
                <strong>{available.length} mulige bilder</strong>
                <span>{chosenIds.length===0?"Tilfeldig fra alle som passer valgte typer":"Tilfeldig fra "+chosenIds.length+" manuelt valgte"}</span>
                <span>Kun publisert og offentlig forhåndsvisning/omslag</span>
              </div>
              <div className="mix-promotion-search">
                <label>Søk etter {draft.promotionBrand==="art"?"kunstverk":"bok"}
                  <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tittel …" />
                </label>
                <button type="button" className="admin-secondary"
                  onClick={()=>onChange(draft.promotionBrand==="art"?{artIds:[]}:{bookIds:[]})}>
                  Bruk alle i valgte kategorier
                </button>
              </div>
              {available.length===0&&<div className="admin-error">Ingen publiserte bilder samsvarer med utvalget. Juster filtrene før du lagrer.</div>}
              <div className="mix-promotion-items">
                {visible.map(item=>(
                  <button key={item.id} type="button"
                    className={`mix-promotion-item ${chosenIds.includes(item.id)?"active":""}`}
                    title={item.title}
                    onClick={()=>onChange(draft.promotionBrand==="art"
                      ?{artIds:toggle(draft.artIds,item.id)}
                      :{bookIds:toggle(draft.bookIds,item.id)})}>
                    <img src={item.imageUrl} alt="" loading="lazy" />
                    <span><strong>{item.title}</strong><small>{draft.promotionBrand==="art"?[item.style,item.collection].filter(Boolean).join(" · "):[item.series,item.language].filter(Boolean).join(" · ")}</small></span>
                    <span className="mix-checkbox">{chosenIds.includes(item.id)&&<Check size={14}/>}</span>
                  </button>
                ))}
              </div>
              <a href={draft.promotionBrand==="art"?"https://art.freddybremseth.com/":"https://books.freddybremseth.com/"}
                target="_blank" rel="noreferrer" className="mix-catalog-link">
                Åpne {draft.promotionBrand==="art"?"kunstgalleriet":"boksiden"} <ExternalLink size={13}/>
              </a>
            </>
          )}
        </>
      )}
      {draft.promotionBrand==="none"&&<p>Re-Master Freddy-bilder brukes. Ingen annen merkevare promoteres.</p>}
    </div>
  );
}
