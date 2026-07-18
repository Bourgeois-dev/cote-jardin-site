import { useEffect, useState } from "react";
import { supabase, fetchActive, fetchContent } from "../lib/supabase";
import type { MenuItem, GalleryImage, Partner, Review, SocialLink, OpeningHour, ReservationSettings, PromoBanner, TakeawayItem } from "../lib/types";
import Navbar from "../components/site/Navbar";
import Hero from "../components/site/Hero";
import Histoire from "../components/site/Histoire";
import Carte from "../components/site/Carte";
import Ardoise from "../components/site/Ardoise";
import Partenaires from "../components/site/Partenaires";
import Galerie from "../components/site/Galerie";
import Avis from "../components/site/Avis";
import Newsletter from "../components/site/Newsletter";
import Footer from "../components/site/Footer";
import HorairesModal from "../components/site/HorairesModal";
import ReservationWidget from "../components/site/ReservationWidget";
import PromoPopup from "../components/site/PromoPopup";
import Emporter from "../components/site/Emporter";

export default function Site() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [socials, setSocials] = useState<SocialLink[]>([]);
  const [hours, setHours] = useState<OpeningHour[]>([]);
  const [ardoise, setArdoise] = useState<any>(null);
  const [catMeta, setCatMeta] = useState<any>(null);
  const [menuFile, setMenuFile] = useState<{ url: string; name?: string } | null>(null);
  const [flags, setFlags] = useState<{ partners: boolean; reviews: boolean; newsletter: boolean }>({ partners: true, reviews: true, newsletter: true });
  const [resaEnabled, setResaEnabled] = useState(true);
  const [promo, setPromo] = useState<PromoBanner | null>(null);
  const [takeaway, setTakeaway] = useState<TakeawayItem[]>([]);
  const [takeawayEnabled, setTakeawayEnabled] = useState(false);
  const [horairesOpen, setHorairesOpen] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Promise.allSettled évite qu'une seule requête en erreur bloque tout le chargement
      const results = await Promise.allSettled([
        fetchActive<MenuItem>("menu_items"),
        fetchActive<GalleryImage>("gallery_images"),
        fetchActive<Partner>("partners"),
        fetchActive<Review>("reviews"),
        fetchActive<SocialLink>("social_links"),
        fetchActive<OpeningHour>("opening_hours", "day_of_week"),
        fetchContent("ardoise"),
        fetchContent("menu_categories"),
        fetchContent("partners_enabled"),
        fetchContent("reviews_enabled"),
        fetchContent("newsletter_enabled"),
        fetchActive<ReservationSettings>("reservation_settings", "id"),
        fetchActive<PromoBanner>("promo_banner", "id"),
        fetchContent("menu_file"),
        fetchActive<TakeawayItem>("takeaway_items"),
        fetchContent("takeaway_enabled"),
      ]);
      const get = (i: number, fallback: any = []) =>
        results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<any>).value : fallback;
      const [m, g, p, r, s, h, ard, cm, pf, rf, nf, rs, pb, mf, tw, twf] = [
        get(0), get(1), get(2), get(3), get(4), get(5),
        get(6, null), get(7, null), get(8, null), get(9, null), get(10, null),
        get(11), get(12), get(13, null), get(14), get(15, null),
      ];
      setMenu((m as MenuItem[]).filter((x) => x.is_active));
      setGallery((g as GalleryImage[]).filter((x) => x.is_active));
      setPartners((p as Partner[]).filter((x) => x.is_active));
      setReviews((r as Review[]).filter((x) => x.is_active));
      setSocials((s as SocialLink[]).filter((x) => x.is_active));
      setHours(h);
      setArdoise(ard);
      setCatMeta(cm);
      setMenuFile(mf?.url ? mf : null);
      setFlags({ partners: pf?.enabled ?? true, reviews: rf?.enabled ?? true, newsletter: nf?.enabled ?? true });
      setResaEnabled(rs[0]?.enabled ?? true);
      setPromo(pb[0] || null);
      setTakeaway((tw as TakeawayItem[]).filter((x) => x.is_active));
      setTakeawayEnabled(twf?.enabled ?? false);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="loading">Chargement…</div>;

  const phone = import.meta.env.VITE_RESTO_PHONE || "";
  const phoneHref = `tel:${phone.replace(/\s/g, "")}`;
  // Action des boutons "Réserver" : ouvre le widget si la résa en ligne est active, sinon appel téléphone
  const reserve = () => {
    if (resaEnabled) setWidgetOpen(true);
    else if (phone) window.location.href = phoneHref;
  };
  const reserveLabel = resaEnabled ? "Réserver" : "Appeler";

  return (
    <>
      <Navbar onReserve={reserve} reserveLabel={reserveLabel} flags={{
        ardoise: ardoise?.enabled !== false && !!ardoise?.plat,
        takeaway: takeawayEnabled && takeaway.length > 0,
        partners: flags.partners && partners.length > 0,
        newsletter: flags.newsletter,
      }} />
      <Hero onReserve={reserve} onHours={() => setHorairesOpen(true)} reserveLabel={resaEnabled ? "Réserver une table" : "Appeler le restaurant"} />
      <Histoire />
      {ardoise?.enabled !== false && <Ardoise ardoise={ardoise} />}
      <Carte menu={menu} catMeta={catMeta} menuFile={menuFile} />
      {takeawayEnabled && takeaway.length > 0 && <Emporter items={takeaway} />}
      {flags.partners && partners.length > 0 && <Partenaires partners={partners} />}
      {gallery.length > 0 && <Galerie images={gallery} />}
      {flags.reviews && reviews.length > 0 && <Avis reviews={reviews} />}
      {flags.newsletter && <Newsletter socials={socials} />}
      <Footer hours={hours} socials={socials} />
      <HorairesModal hours={hours} open={horairesOpen} onClose={() => setHorairesOpen(false)} />
      <PromoPopup promo={promo} />
      {resaEnabled && <ReservationWidget hours={hours} open={widgetOpen} onClose={() => setWidgetOpen(false)} />}
      {(resaEnabled || phone) && (
        <button className="btn btn-accent fab-reserv" onClick={reserve}>{reserveLabel}</button>
      )}
    </>
  );
}
