import { useState, useRef } from "react";
import { supabase } from "../../lib/supabase";

// Plat extrait, avec état de sélection pour la validation.
export interface PlatExtrait {
  name: string;
  category: string;
  description: string;
  price: number | null;
  garder: boolean; // coché = sera inséré
}

// En-têtes d'appel à l'edge function AVEC le token de session admin (l'edge
// function vérifie is_admin() sous cette identité).
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

// Compresse et redimensionne une image côté navigateur avant envoi : réduit le
// coût d'analyse (tokens ∝ surface) et accélère l'upload. Max 1568px de côté,
// JPEG qualité 0.82. Renvoie { base64, mediaType }.
function compresser(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1568;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const r = Math.min(MAX / width, MAX / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

export default function ScanArdoise({
  categoriesConnues,
  onValider,
  onFermer,
}: {
  categoriesConnues: string[];
  onValider: (plats: { name: string; category: string; description: string; price: number }[]) => Promise<void>;
  onFermer: () => void;
}) {
  const [etape, setEtape] = useState<"capture" | "analyse" | "validation">("capture");
  const [erreur, setErreur] = useState("");
  const [plats, setPlats] = useState<PlatExtrait[]>([]);
  const [apercu, setApercu] = useState("");   // aperçu de la photo
  const [catDefaut, setCatDefaut] = useState(""); // catégorie à appliquer aux plats sans catégorie
  const [enregistre, setEnregistre] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setErreur("");
    if (!file.type.startsWith("image/")) { setErreur("Choisissez une photo (JPEG ou PNG)."); return; }

    setEtape("analyse");
    try {
      const { base64, mediaType } = await compresser(file);
      setApercu(`data:${mediaType};base64,${base64}`);

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extraire-carte`;
      const resp = await fetch(url, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ image_base64: base64, media_type: mediaType }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setErreur(data?.message || "L'analyse a échoué. Réessayez.");
        setEtape("capture");
        return;
      }
      const extraits: PlatExtrait[] = (data.plats || []).map((p: any) => ({
        name: p.name || "",
        category: p.category || "",
        description: p.description || "",
        price: p.price ?? null,
        garder: true,
      }));
      if (!extraits.length) {
        setErreur("Aucun plat n'a pu être lu sur cette photo. Essayez une image plus nette et bien cadrée.");
        setEtape("capture");
        return;
      }
      setPlats(extraits);
      setEtape("validation");
    } catch {
      setErreur("Impossible de traiter la photo. Réessayez.");
      setEtape("capture");
    }
  }

  function maj(i: number, champ: keyof PlatExtrait, val: any) {
    setPlats((ps) => ps.map((p, k) => (k === i ? { ...p, [champ]: val } : p)));
  }

  const nbGardes = plats.filter((p) => p.garder).length;

  async function valider() {
    const aInserer = plats
      .filter((p) => p.garder && p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        category: (p.category.trim() || catDefaut.trim() || "Plats"),
        description: p.description.trim(),
        price: p.price ?? 0,
      }));
    if (!aInserer.length) return;
    setEnregistre(true);
    try {
      await onValider(aInserer);
      onFermer();
    } catch {
      setErreur("L'enregistrement a échoué. Réessayez.");
      setEnregistre(false);
    }
  }

  // Liste des catégories proposées dans les menus déroulants.
  const catsProposees = Array.from(new Set([
    ...categoriesConnues,
    ...plats.map((p) => p.category).filter(Boolean),
    "Entrées", "Plats", "Desserts", "Menus", "Boissons",
  ]));

  return (
    <div className="scan-modal-fond" onClick={onFermer}>
      <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scan-tete">
          <h2>📷 Scanner une ardoise</h2>
          <button className="scan-fermer" aria-label="Fermer" onClick={onFermer}>✕</button>
        </div>

        {etape === "capture" && (
          <div className="scan-capture">
            <p className="desc">
              Photographiez votre ardoise ou votre carte : l'IA lit les plats, les prix et
              les descriptions, puis vous les vérifiez avant de les ajouter.
            </p>
            {erreur && <div className="alerte" style={{ marginBottom: 14 }}>{erreur}</div>}
            <label className="btn btn-accent" style={{ cursor: "pointer" }}>
              📷 Prendre ou choisir une photo
              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                     onChange={onFichier} style={{ display: "none" }} />
            </label>
            <p className="sub-desc" style={{ marginTop: 12 }}>
              Astuce : cadrez bien l'ardoise, à plat, avec un bon éclairage et sans reflet.
            </p>
          </div>
        )}

        {etape === "analyse" && (
          <div className="scan-analyse">
            {apercu && <img src={apercu} alt="" className="scan-apercu-img" />}
            <div className="scan-spinner" />
            <p className="desc">Lecture de l'ardoise en cours…</p>
          </div>
        )}

        {etape === "validation" && (
          <div className="scan-validation">
            <p className="desc">
              <b>{plats.length} plat(s) lus.</b> Vérifiez et corrigez si besoin, décochez ceux
              à ne pas ajouter, puis validez. Rien n'est enregistré tant que vous n'avez pas validé.
            </p>
            {erreur && <div className="alerte" style={{ marginBottom: 12 }}>{erreur}</div>}

            <div className="scan-catdefaut">
              <label>Catégorie par défaut (plats sans catégorie détectée)</label>
              <select value={catDefaut} onChange={(e) => setCatDefaut(e.target.value)}>
                <option value="">— Choisir —</option>
                {catsProposees.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="scan-liste">
              {plats.map((p, i) => (
                <div key={i} className={`scan-plat${p.garder ? "" : " off"}`}>
                  <label className="scan-plat-check">
                    <input type="checkbox" checked={p.garder} onChange={(e) => maj(i, "garder", e.target.checked)} />
                  </label>
                  <div className="scan-plat-champs">
                    <div className="scan-plat-ligne1">
                      <input className="scan-in-nom" value={p.name} placeholder="Nom du plat"
                             onChange={(e) => maj(i, "name", e.target.value)} />
                      <input className="scan-in-prix" value={p.price ?? ""} placeholder="Prix"
                             inputMode="decimal"
                             onChange={(e) => { const v = e.target.value.replace(",", "."); maj(i, "price", v === "" ? null : parseFloat(v)); }} />
                      <span className="scan-euro">€</span>
                    </div>
                    <div className="scan-plat-ligne2">
                      <select className="scan-in-cat" value={p.category} onChange={(e) => maj(i, "category", e.target.value)}>
                        <option value="">(catégorie par défaut)</option>
                        {catsProposees.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input className="scan-in-desc" value={p.description} placeholder="Description (optionnelle)"
                             onChange={(e) => maj(i, "description", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="scan-actions">
              <button className="btn btn-accent" disabled={!nbGardes || enregistre} onClick={valider}>
                {enregistre ? "Ajout en cours…" : `Ajouter ${nbGardes} plat(s) à la carte`}
              </button>
              <button className="btn btn-ligne" disabled={enregistre} onClick={() => { setEtape("capture"); setPlats([]); setErreur(""); }}>
                ↻ Reprendre une photo
              </button>
              <button className="btn btn-ligne" disabled={enregistre} onClick={onFermer}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
