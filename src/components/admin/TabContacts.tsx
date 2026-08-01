import { useMemo, useState } from "react";
import { useTable } from "../../hooks/useTable";
import type { Lead, SocialLink } from "../../lib/types";
import Chargement from "./Chargement";
import QrAffiche from "./QrAffiche";

// Libellé lisible d'une source brute :
// "newsletter" → Site · "newsletter:instagram" → Instagram
function libelleSource(src: string): string {
  if (src === "newsletter" || !src) return "Site";
  const utm = src.startsWith("newsletter:") ? src.slice("newsletter:".length) : src;
  return utm.charAt(0).toUpperCase() + utm.slice(1);
}

export default function TabContacts() {
  // Seuls les contacts opt-in newsletter (consent = true) apparaissent ici.
  // Les opt-out (désinscription via lien email) sont exclus de la liste.
  const { rows: allRows, loading } = useTable<Lead>("leads", "created_at");
  const socials = useTable<SocialLink>("social_links", "position");
  const rows = allRows.filter((l) => l.consent === true);

  const [filtre, setFiltre] = useState<string>("toutes");
  const [persoSource, setPersoSource] = useState("");
  const [copie, setCopie] = useState<string | null>(null);

  // Sources distinctes présentes dans les contacts, avec compteurs,
  // triées par volume décroissant → on voit d'un coup d'œil qui collecte le plus.
  const sources = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((l) => { const s = l.source || "newsletter"; m.set(s, (m.get(s) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const visibles = filtre === "toutes" ? rows : rows.filter((l) => (l.source || "newsletter") === filtre);

  // Générateur de liens : format standard ?utm_source=…#contact (l'ancre
  // fonctionne). Le site accepte aussi #contact?utm_source=… en lecture.
  const origine = window.location.origin;
  const lien = (src: string) => `${origine}/?utm_source=${encodeURIComponent(src)}#contact`;
  const reseauxActifs = socials.rows.filter((s) => s.is_active && s.url);
  const persoPropre = persoSource.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);

  async function copier(src: string) {
    try {
      await navigator.clipboard.writeText(lien(src));
      setCopie(src); setTimeout(() => setCopie(null), 1800);
    } catch { /* clipboard indisponible : l'URL reste visible et sélectionnable */ }
  }

  function exportCsv() {
    const head = "Prénom,Nom,Email,Source,Date\n";
    const body = visibles.map((l) =>
      `${l.first_name || ""},${l.last_name || ""},${l.email},${libelleSource(l.source)},${new Date(l.created_at).toLocaleDateString("fr-FR")}`
    ).join("\n");
    const blob = new Blob([head + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "contacts.csv"; a.click();
  }

  return (
    <>
      <div className="topbar adm-vit">
        <div><span className="adm-vit-eyebrow">Paramètres</span><h1>Contacts</h1><div className="sous">Inscrits à la newsletter (opt-in actif).</div></div>
      </div>
      <div className="contenu adm-vit">
        {loading && allRows.length === 0 && <Chargement />}

        <div className="bloc">
          <div className="reglages-titre">Liens d'inscription par canal</div>
          <div className="reglages-desc">Partagez le bon lien sur chaque réseau : la source de chaque inscription sera tracée automatiquement.</div>
          {reseauxActifs.length === 0 && (
            <p className="ct-aide">Ajoutez vos réseaux sociaux dans Paramètres pour générer leurs liens.</p>
          )}
          <div className="ct-liens">
            {reseauxActifs.map((s) => (
              <div key={s.id} className="ct-lien">
                <span className="ct-lien-nom">{libelleSource(`newsletter:${s.platform}`)}</span>
                <code className="ct-lien-url">{lien(s.platform)}</code>
                <button className="adm-vit-lien accent ct-copier" onClick={() => copier(s.platform)}>
                  {copie === s.platform ? "Copié !" : "Copier"}
                </button>
              </div>
            ))}
            <div className="ct-lien ct-lien-perso">
              <span className="ct-lien-nom ct-lien-nom-perso">Autre canal</span>
              <input className="ct-perso-input" placeholder="ex. flyer, google, qr-menu…"
                value={persoSource} onChange={(e) => setPersoSource(e.target.value)} />
              {persoPropre
                ? <><code className="ct-lien-url">{lien(persoPropre)}</code>
                    <button className="adm-vit-lien accent ct-copier" onClick={() => copier(persoPropre)}>
                      {copie === persoPropre ? "Copié !" : "Copier"}
                    </button></>
                /* L'appel à l'action reste visible champ vide : sinon la ligne
                   paraissait inerte tant qu'on n'avait rien tapé. */
                : <span className="ct-creer-vide">+ Créer le lien</span>}
            </div>
          </div>
        </div>

        <QrAffiche lien={lien} />

        <div className="bloc">
          <div className="bloc-tete">
            <div><h2>{visibles.length} contact{visibles.length > 1 ? "s" : ""}</h2></div>
            <button className="adm-vit-lien accent" onClick={exportCsv}>Exporter en CSV</button>
          </div>
          {sources.length > 1 && (
            <div className="ct-filtres">
              <button className={`ct-filtre${filtre === "toutes" ? " actif" : ""}`} onClick={() => setFiltre("toutes")}>
                Toutes <span className="ct-filtre-nb">· {rows.length}</span>
              </button>
              {sources.map(([src, nb]) => (
                <button key={src} className={`ct-filtre${filtre === src ? " actif" : ""}`} onClick={() => setFiltre(src)}>
                  {libelleSource(src)} <span className="ct-filtre-nb">· {nb}</span>
                </button>
              ))}
            </div>
          )}
          <table><thead><tr><th>Nom</th><th>Email</th><th>Source</th><th>Date</th></tr></thead><tbody>
            {visibles.length ? visibles.map((l) => (
              <tr key={l.id}>
                <td>{l.first_name} {l.last_name}</td>
                <td>{l.email}</td>
                <td>{libelleSource(l.source)}</td>
                <td>{new Date(l.created_at).toLocaleDateString("fr-FR")}</td>
              </tr>
            )) : <tr><td colSpan={4} className="vide">Aucun contact pour cette source.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
