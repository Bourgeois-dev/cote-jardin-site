import { useMemo, useState } from "react";
import { qrMatrix } from "../../lib/qr";

// Affiche imprimable avec QR code, à poser sur les tables du restaurant.
// Le QR pointe vers le formulaire d'inscription avec un utm_source dédié,
// ce qui rend les inscriptions issues des tables mesurables dans Contacts.
//
// Le QR est généré localement (lib/qr.ts, sans dépendance ni service tiers) :
// aucune donnée ne sort du navigateur, et l'affiche reste imprimable hors ligne.

const TAILLE_QR = 220;

function QrSvg({ texte, taille = TAILLE_QR }: { texte: string; taille?: number }) {
  const m = useMemo(() => {
    try { return qrMatrix(texte); } catch { return null; }
  }, [texte]);

  if (!m) return <div className="qr-erreur">Adresse trop longue pour un QR code.</div>;

  const n = m.length;
  const marge = 4;               // zone de silence obligatoire (4 modules)
  const total = n + marge * 2;
  const rects: string[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (m[r][c]) rects.push(`M${c + marge},${r + marge}h1v1h-1z`);

  return (
    <svg className="qr-svg" width={taille} height={taille}
      viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges"
      role="img" aria-label="QR code d'inscription à la newsletter">
      <rect width={total} height={total} fill="#fff" />
      <path d={rects.join("")} fill="#000" />
    </svg>
  );
}

export default function QrAffiche({ lien }: { lien: (src: string) => string }) {
  const [source, setSource] = useState("qr-table");
  const [titre, setTitre] = useState("Restez informé");
  const [message, setMessage] = useState(
    "Nouvelle carte, soirées à thème, fermetures : recevez les nouvelles de la maison."
  );
  const restoName = import.meta.env.VITE_RESTO_NAME || "";

  const src = source.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "qr-table";
  const url = lien(src);

  function imprimer() {
    window.print();
  }

  return (
    <div className="bloc">
      <div className="bloc-tete">
        <div>
          <div className="reglages-titre">Affiche QR pour les tables</div>
          <div className="reglages-desc">Imprimez et posez sur les tables : les inscriptions apparaissent sous la source choisie.</div>
        </div>
        <button className="adm-vit-lien accent qr-no-print" onClick={imprimer}>Imprimer</button>
      </div>

      {/* Réglages à gauche, aperçu de l'affiche à droite (maquette). L'aperçu
          reste le seul élément imprimé — la règle @media print ne change pas. */}
      <div className="qr-duo">
        <div className="qr-col qr-no-print">
          <div className="qr-editeur">
            <label className="qr-champ qr-champ-large">
              <span>Source · pour le suivi</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="qr-table" />
            </label>
            <label className="qr-champ qr-champ-large">
              <span>Titre de l'affiche</span>
              <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={40} />
            </label>
            <label className="qr-champ qr-champ-large">
              <span>Message</span>
              <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={130} />
            </label>
          </div>
          <p className="qr-url">Ce QR ouvre : <code>{url}</code></p>
        </div>

        {/* Zone imprimée : seule cette partie apparaît sur le papier */}
        <div className="qr-zone-impression">
          <div className="qr-affiche">
            {restoName && <div className="qr-affiche-resto">{restoName}</div>}
            <div className="qr-affiche-titre">{titre}</div>
            <p className="qr-affiche-message">{message}</p>
            <div className="qr-affiche-code"><QrSvg texte={url} /></div>
            <div className="qr-affiche-pied">Scannez avec l'appareil photo de votre téléphone</div>
          </div>
        </div>
      </div>
    </div>
  );
}
