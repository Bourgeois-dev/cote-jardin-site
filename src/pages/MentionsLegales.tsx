import { Link } from "react-router-dom";
import { legalInfo as L } from "../content/legal.generated";

export default function MentionsLegales() {
  return (
    <div className="legal-page">
      <div className="wrap legal-wrap">
        <Link to="/" className="legal-retour">← Retour à l'accueil</Link>
        <h1>Mentions légales</h1>

        <h2>Éditeur du site</h2>
        <p>
          Le présent site est édité par <b>{L.restaurantName}</b>
          {L.formeJuridique ? `, ${L.formeJuridique}` : ""}
          {L.capitalSocial ? ` au capital de ${L.capitalSocial}` : ""}.
        </p>
        <ul className="legal-liste">
          {L.siegeSocial && <li>Siège social : {L.siegeSocial}</li>}
          {L.siret && <li>SIRET : {L.siret}</li>}
          {L.rcs && <li>RCS : {L.rcs}</li>}
          {L.tva && <li>N° TVA intracommunautaire : {L.tva}</li>}
          {L.telephone && <li>Téléphone : {L.telephone}</li>}
          {L.directeurPublication && <li>Directeur de la publication : {L.directeurPublication}</li>}
        </ul>

        <h2>Hébergement</h2>
        <p>
          Le site est hébergé par Netlify, Inc., 512 2nd Street, Suite 200, San Francisco,
          CA 94107, États-Unis. La base de données et le stockage sont assurés par
          Supabase (Supabase, Inc.).
        </p>

        <h2>Propriété intellectuelle</h2>
        <p>
          L'ensemble des contenus de ce site (textes, photographies, logos) est protégé par
          le droit de la propriété intellectuelle. Toute reproduction sans autorisation
          préalable est interdite. {L.credits ? `Crédits : ${L.credits}.` : ""}
        </p>

        <h2>Données personnelles</h2>
        <p>
          Le traitement de vos données personnelles est détaillé dans notre{" "}
          <Link to="/protection-des-donnees">politique de protection des données</Link>.
        </p>

        <p className="legal-maj">Dernière mise à jour : {L.lastUpdate}</p>
      </div>
    </div>
  );
}
