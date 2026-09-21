import {useEffect,useMemo,useState} from "react";
import {loadMixPromotionCatalog,type PromotionItem} from "./lib/mix-api";

type Props={title:string;enabled:boolean;selectedIds:string[];selectedStyles:string[];selectedCollections:string[]};

export default function MixArtThumbnailPreview({title,enabled,selectedIds,selectedStyles,selectedCollections}:Props){
  const [art,setArt]=useState<PromotionItem[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    loadMixPromotionCatalog().then(catalog=>{if(alive)setArt(catalog.art);})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:"Kunne ikke hente kunst.");});
    return ()=>{alive=false;};
  },[]);
  const selection=useMemo(()=>art.filter(item=>
    (!selectedIds.length||selectedIds.includes(item.id)) &&
    (!selectedStyles.length||selectedStyles.includes(item.style||"")) &&
    (!selectedCollections.length||selectedCollections.includes(item.collection||""))
  ),[art,selectedIds,selectedStyles,selectedCollections]);
  const safeTitle=(title.trim()||"ART LOUNGE").slice(0,110);
  if(!enabled)return <p className="mix-live-note">YouTubes standardminiatyrbilde brukes når Art Lounge-stilen er slått av.</p>;
  return <div className="mix-thumbnail-preview-wrap">
    <div className="mix-art-thumbnail-preview" role="img" aria-label={`Forhåndsvisning av Art Lounge-thumbnail: ${safeTitle}`}>
      <div className="mix-thumb-lights" aria-hidden="true"/>
      <div className="mix-thumb-wall mix-thumb-wall-left">
        {selection[0]&&<img src={selection[0].imageUrl} alt="" loading="lazy"/>}
      </div>
      <div className="mix-thumb-wall mix-thumb-wall-right">
        {selection[1]&&<img src={selection[1].imageUrl} alt="" loading="lazy"/>}
      </div>
      <div className="mix-thumb-center">
        <span className="mix-thumb-kicker">RE-MASTER FREDDY</span>
        <strong className="mix-thumb-title">{safeTitle}</strong>
      </div>
      <div className="mix-thumb-record" aria-hidden="true"/>
      <div className="mix-thumb-footer">ART.FREDDYBREMSETH.COM · MUSIC BY RE-MASTER FREDDY</div>
    </div>
    <small>Forhåndsvisning av farger og tittel. Den faktiske YouTube-thumbnailen får 1280 × 720 JPEG fra godkjente kunstbilder og videoens lagrede tittel. Motivet kan variere når bilder trekkes tilfeldig.</small>
    {error&&<small className="admin-error">{error}</small>}
  </div>;
}
