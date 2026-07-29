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
      <div className="topbar"><div><h1>Ardoise du jour</h1><div className="sous">Le plat du jour affiché sur le site</div></div></div>
      <div className="contenu">
        {/* Toggle en tête, comme les autres onglets (Bannière promo, Newsletter…) */}
        <div className="bloc">
          <label className="ligne-toggle" style={{ paddingTop: 0 }}>
            <span className="lib"><b>Afficher l'ardoise sur le site</b><span>{enabled ? "Active — le plat du jour s'affiche sur le site" : "Inactive — le bloc est masqué"}</span></span>
            <span className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><span className="piste" /></span>
          </label>
        </div>

        {/* Contenu + aperçu, même grille que Bannière promo */}
        <div className="bloc">
          <div className="promo-admin-grid">
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

              <div className="champ">
                <label>Photo du plat (facultative)</label>
                {image ? (
                  <div className="media-champ">
                    <img className="media-vignette" src={image} alt="" />
                    <div className="media-actions">
                      <button className="btn btn-mini btn-ligne" onClick={() => fileRef.current?.click()} disabled={upLoad}>{upLoad ? "Envoi…" : "Remplacer"}</button>
                      <button className="btn btn-mini btn-danger" onClick={() => setImage("")}>Retirer</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="media-vide" onClick={() => fileRef.current?.click()} disabled={upLoad}>
                    <b>{upLoad ? "Envoi…" : "Choisir une image"}</b>
                    <span>Elle s'affiche en haut du bloc « Plat du jour ».</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={upload} style={{ display: "none" }} />
                {upErr && <div className="alerte" style={{ marginTop: 8 }}>{upErr}</div>}
              </div>
              <div className="form-pied">
                <span className="form-pied-aide">Les changements apparaissent sur le site dès l'enregistrement.</span>
                <button className="btn btn-accent" onClick={save}>Enregistrer</button>
              </div>
            </div>

            <div className="apercu-col">
              <div className="eyebrow" style={{ marginBottom: 12 }}>Aperçu sur le site</div>
              <div className="ardoise-apercu">
                <div className="ardoise-apercu-img" style={image ? { backgroundImage: `url(${image})` } : undefined}>
                  {!image && <span>Pas d'image</span>}
                </div>
                <div className="ardoise-apercu-txt">
                  <div className="ardoise-apercu-lab">{label || "Le plat du jour"}</div>
                  <div className="ardoise-apercu-pj">{plat || "—"}</div>
                  <div className="ardoise-apercu-meta">
                    {prix && <span className="ardoise-apercu-px">{prix}</span>}
                    {note && <span className="ardoise-apercu-note">{note}</span>}
                  </div>
                </div>
              </div>
              <div className="desc" style={{ textAlign: "center", marginTop: 10 }}>Mise à jour en direct</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
