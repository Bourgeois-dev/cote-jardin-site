import { Link } from "react-router-dom";
import { legalInfo as L } from "../content/legal.generated";

export default function ProtectionDonnees() {
  return (
    <div className="legal-page">
      <div className="wrap legal-wrap">
        <Link to="/" className="legal-retour">← Retour à l'accueil</Link>
        <h1>Protection des données personnelles</h1>

        <p>
          {L.restaurantName} accorde une grande importance à la protection de vos données
          personnelles, conformément au Règlement général sur la protection des données (RGPD)
          et à la loi Informatique et Libertés.
        </p>

        <h2>Responsable du traitement</h2>
        <p>
          Le responsable du traitement est {L.restaurantName}, {L.siegeSocial}.
          Pour toute question relative à vos données : {L.emailRgpd}.
        </p>

        <h2>Données collectées et finalités</h2>
        <ul className="legal-liste">
          <li><b>Réservation</b> : nom, e-mail, téléphone et nombre de couverts, utilisés uniquement pour gérer votre réservation.</li>
          <li><b>Newsletter</b> : prénom, nom et e-mail, utilisés pour vous envoyer nos actualités, avec votre consentement explicite.</li>
        </ul>

        <h2>Base légale</h2>
        <p>
          Les données de réservation sont traitées sur la base de l'exécution de votre demande.
          Les données de newsletter reposent sur votre consentement, que vous pouvez retirer à
          tout moment.
        </p>

        <h2>Durée de conservation</h2>
        <p>
          Les données de réservation sont conservées le temps nécessaire à la gestion de la
          relation, puis archivées ou supprimées. Les données de newsletter sont conservées
          jusqu'à votre désinscription.
        </p>

        <h2>Vos droits</h2>
        <p>
          Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de
          portabilité de vos données. Pour les exercer, écrivez à {L.emailRgpd}. Vous pouvez
          également introduire une réclamation auprès de la CNIL (www.cnil.fr).
        </p>

        <h2>Désinscription de la newsletter</h2>
        <p>
          Chaque e-mail contient un lien de désinscription. Vous pouvez aussi nous contacter
          directement pour être retiré de notre liste.
        </p>

        <p className="legal-maj">Dernière mise à jour : {L.lastUpdate}</p>
      </div>
    </div>
  );
}
