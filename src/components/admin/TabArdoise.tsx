import { useEffect, useState, useRef } from "react";
import { supabase, fetchContent, messageUpload } from "../../lib/supabase";
import { useToast } from "./Toast";

export default function TabArdoise() {
  const toast = useToast();
  const [plat, setPlat] = useState("");
  const [prix, setPrix] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [upLoad, setUpLoad] = useState(false);
  const [upErr, setUpErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const a = await fetchContent("ardoise");
      if (a) {
        setPlat(a.plat || ""); setPrix(a.prix || "");
        setLabel(a.label || ""); setNote(a.note || "");
        setImage(a.image || "");
        setEnabled(a.enabled !== false);
      }
    })();
  }, []);

  async function save() {
    // Le texte alternatif de l'image n'est plus saisi à la main : il est dérivé
    // automatiquement du nom du plat (accessibilité + affichage si l'image ne charge
    // pas). Vide s'il n'y a pas d'image.
    const image_alt = image ? plat.trim() : "";
    await supabase.from("site_content").upsert(
      { section_key: "ardoise", content: { plat, prix, label, note, image, image_alt, enabled } },
      { onConflict: "section_key" }
    );
    toast.ok("Ardoise enregistrée");
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpErr("");
    if (!file.type.startsWith("image/")) { setUpErr("Choisissez une image (JPG ou PNG)."); return; }
    if (file.size > 10 * 1024 * 1024) { setUpErr("Image trop lourde (max 10 Mo)."); return; }
    setUpLoad(true);
    const path = `ardoise-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("gallery").upload(path, file);
    if (error) { setUpErr(messageUpload(error)); setUpLoad(false); return; }
    const { data } = supabase.storage.from("gallery").getPublicUrl(path);
    setImage(data.publicUrl);
    setUpLoad(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      {/* Refonte Vitrine : le toggle de visibilité vit dans l'en-tête de page,
          où la question « visible ou pas ? » se pose — plus de bloc dédié. */}
      <div className="topbar adm-vit"><div><span className="adm-vit-eyebrow">Vitrine</span><h1>Ardoise du jour</h1><div className="sous">Le plat du jour affiché sur le site.</div></div>
        <label className="adm-vit-visible">
          <span className="lib"><b>Visible sur le site</b><span>{enabled ? "Active — visible sur la page d'accueil" : "Inactive — le bloc est masqué"}</span></span>
          <span className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><span className="piste" /></span>
        </label>
      </div>
      <div className="contenu adm-vit">
        {/* Aperçu supprimé (le rendu est instantané sur le site) : la photo du
            plat devient elle-même le visuel de l'onglet, en vis-à-vis des
            champs — composition éditoriale plutôt que formulaire nu. */}
        <div className="bloc">
          <div className="adm-edito">
            <div>
              {/* Maquette : la zone photo (pointillés) et ses deux liens
                  Remplacer / Retirer posés dessous — plus d'actions en
                  surimpression. */}
              <div className="adm-edito-media adm-vit-media">
                {image ? (
                  <img src={image} alt="" />
                ) : (
                  <button type="button" className="adm-vit-photo-vide" onClick={() => fileRef.current?.click()} disabled={upLoad}>
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-4 4 3 4-4 5 5"/></svg>
                    <b>{upLoad ? "Envoi…" : "Photo du plat"}</b>
                    <span>cliquez pour choisir un fichier</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={upload} style={{ display: "none" }} />
              </div>
              <div className="adm-vit-media-liens">
                <button className="btn btn-mini btn-ligne" onClick={() => fileRef.current?.click()} disabled={upLoad}>{upLoad ? "Envoi…" : "Remplacer"}</button>
                <button className="adm-vit-lien danger" onClick={() => setImage("")} disabled={!image}>Retirer</button>
              </div>
            </div>
            <div>
              <h2 style={{ marginBottom: 4 }}>Contenu de l'ardoise</h2>
              <div className="desc" style={{ marginBottom: 16 }}>Ces informations s'affichent dans le bloc « Plat du jour » du site.</div>

              <div className="grid2">
                <div className="champ"><label>Plat du jour</label><input value={plat} onChange={(e) => setPlat(e.target.value)} placeholder="Galette saumon fumé, avocat & citron vert" /></div>
                <div className="champ"><label>Prix</label><input value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="13,50 €" /></div>
              </div>
              <div className="grid2">
                <div className="champ"><label>Libellé du bloc</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Le plat du jour" />
                  <span className="aide" style={{ fontSize: 11.5 }}>Par défaut : « Le plat du jour ».</span>
                </div>
                <div className="champ"><label>Note (optionnelle)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sans gluten, fait maison…" /></div>
              </div>
              {upErr && <div className="alerte" style={{ marginTop: 8 }}>{upErr}</div>}
              <div className="form-pied">
                <span className="form-pied-aide">Les changements apparaissent sur le site dès l'enregistrement.</span>
                <button className="btn btn-accent" onClick={save}>Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
