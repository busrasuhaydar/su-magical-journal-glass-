// Ana sayfa kahramanı: günün eseri cam kemer içinde süzülür (Su'nun kendi çizimi), altında söz.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNfts } from '../lib/nft';

export function HeroArt() {
  const nfts = useNfts();
  const items = nfts.data?.items ?? [];
  const [failed, setFailed] = useState(false);
  if (!items.length) return null;
  const day = Math.floor(Date.now() / 86_400_000);
  const n = items[(day * 11) % items.length];
  const src = failed || !n.original ? n.thumb : n.original;
  const to = `/koleksiyonlar/${n.c}?eser=${n.contract.slice(0, 10).toLowerCase()}-${n.tokenId}`;
  return (
    <figure className="hero-art">
      <Link to={to} className="ha-arch" aria-label={`${n.name} eserini aç`}>
        <span className="ha-glow" />
        {n.thumb && <img className="ha-ph" src={n.thumb} alt="" />}
        {src && <img className="ha-img" src={src} alt={n.name} loading="lazy" onError={() => !failed && setFailed(true)} />}
        <i className="ha-s a">✦</i><i className="ha-s b">✦</i><i className="ha-s c">✦</i>
      </Link>
      <figcaption className="ha-quote">
        <span>“Sanat, hayatı daha güzel hayal etme cesaretidir.”</span>
        <b className="script">Su ♡</b>
      </figcaption>
    </figure>
  );
}
