import { useEffect, useState, useRef } from "react";
import { supabase, fetchContent } from "../../lib/supabase";

export default function TabArdoise() {
  const [plat, setPlat] = useState("");
  const [prix, setPrix] = useState("");
  const [image, setImage] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [msg, setMsg] = useState("");
  const [upLoad, setUpLoad] = useState(false);
  const [upErr, setUpErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (async () => { const a = await fetchContent("ardoise"); if (a) { setPlat(a.plat || ""); setPrix(a.prix || ""); setImage(a.image || ""); setEnabled(a.enabled !== false); } })(); }, []);

  async function save() {
    await supabase.from("site_content").upsert({ section_key: "ardoise", content: { plat, prix, image, enabled } }, { onConflict: "section_key" });
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
        <div className="bloc">
          <div className="ardoise-edit">
            <div className="champ"><label>Plat du jour</label><input value={plat} onChange={(e) => setPlat(e.target.value)} /></div>
            <div className="champ"><label>Prix</label><input value={prix} onChange={(e) => setPrix(e.target.value)} /></div>
            <div className="champ">
              <label>Photo du plat (facultative)</label>
              {image ? (
                <div className="ardoise-img-actuelle">
                  <img src={image} alt="" />
                  <div className="actions-ligne">
                    <button className="btn btn-mini btn-ligne" onClick={() => fileRef.current?.click()} disabled={upLoad}>{upLoad ? "Envoi…" : "Remplacer"}</button>
                    <button className="btn btn-mini btn-danger" onClick={() => setImage("")}>Retirer</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-accent" onClick={() => fileRef.current?.click()} disabled={upLoad}>{upLoad ? "Envoi…" : "+ Ajouter une photo"}</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={upload} style={{ display: "none" }} />
              {upErr && <div className="alerte" style={{ marginTop: 8 }}>{upErr}</div>}
            </div>
            <label className="ligne-toggle" style={{ border: "none", padding: "6px 0" }}>
              <span className="lib"><b>Afficher l'ardoise sur le site</b></span>
              <span className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><span className="piste" /></span>
            </label>
            <div className="apercu-ardoise"><div className="pj">{plat || "—"}</div><div className="px">{prix}</div></div>
          </div>
          <div style={{ marginTop: 16 }}><button className="btn btn-accent" onClick={save}>Enregistrer</button> {msg && <span className="ok-msg">{msg}</span>}</div>
        </div>
      </div>
    </>
  );
}
