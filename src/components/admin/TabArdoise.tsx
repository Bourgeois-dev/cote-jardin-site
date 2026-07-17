import { useEffect, useState, useRef } from "react";
import { supabase, fetchContent } from "../../lib/supabase";

export default function TabArdoise() {
  const [plat, setPlat] = useState("");
  const [prix, setPrix] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [msg, setMsg] = useState("");
  const [upLoad, setUpLoad] = useState(false);
  const [upErr, setUpErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const a = await fetchContent("ardoise");
      if (a) {
        setPlat(a.plat || ""); setPrix(a.prix || "");
        setLabel(a.label || ""); setNote(a.note || "");
        setImage(a.image || ""); setImageAlt(a.image_alt || "");
        setEnabled(a.enabled !== false);
      }
    })();
  }, []);

  async function save() {
    await supabase.from("site_content").upsert(
      { section_key: "ardoise", content: { plat, prix, label, note, image, image_alt: imageAlt, enabled } },
      { onConflict: "section_key" }
    );
    setMsg("Ardoise enregistrée ✓"); setTimeout(() => setMsg(""), 2500);
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
    if (error) { setUpErr("Erreur d'upload : " + error.message); setUpLoad(false); return; }
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
                  <div className="ardoise-img-actuelle">
                    <img src={image} alt="" />
                    <div className="actions-ligne">
                      <button className="btn btn-mini btn-ligne" onClick={() => fileRef.current?.click()} disabled={upLoad}>{upLoad ? "Envoi…" : "Remplacer"}</button>
                      <button className="btn btn-mini btn-danger" onClick={() => { setImage(""); setImageAlt(""); }}>Retirer</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-ligne" onClick={() => fileRef.current?.click()} disabled={upLoad}>{upLoad ? "Envoi…" : "🖼 Choisir une image"}</button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={upload} style={{ display: "none" }} />
                {upErr && <div className="alerte" style={{ marginTop: 8 }}>{upErr}</div>}
              </div>
              {image && (
                <div className="champ">
                  <label>Texte alternatif de l'image</label>
                  <input value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} maxLength={125} placeholder="Ex. Galette au saumon fumé et avocat" />
                  <span className="aide" style={{ fontSize: 11.5 }}>Affiché si l'image ne se charge pas, et lu par les lecteurs d'écran.</span>
                </div>
              )}

              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
                <button className="btn btn-accent" onClick={save}>Enregistrer</button>
                {msg && <span className="ok-msg">{msg}</span>}
              </div>
            </div>

            <div>
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
