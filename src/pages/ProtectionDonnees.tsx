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
          <li><b>Clics dans nos e-mails</b> : lorsqu'un lien de nos newsletters est cliqué, l'information est enregistrée par notre prestataire d'envoi. Elle nous sert uniquement à savoir quels contenus vous intéressent. Les ouvertures, elles, ne sont pas mesurées.</li>
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

        <h2>Destinataires et sous-traitants</h2>
        <p>
          Vos données ne sont jamais vendues ni cédées à des fins publicitaires. Elles sont
          hébergées et traitées par les prestataires techniques suivants, agissant pour notre
          compte :
        </p>
        <ul className="legal-liste">
          <li><b>Supabase</b> — hébergement de la base de données (réservations, contacts). Serveurs situés à Paris (région eu-west-3).</li>
          <li><b>Netlify</b> — hébergement des pages du site web. Aucune donnée personnelle n'y est stockée.</li>
          <li><b>Resend</b> — envoi de nos e-mails (confirmations de réservation, newsletters) et mesure des clics. Serveurs situés en Irlande (région eu-west-1).</li>
        </ul>
        <p>
          Vos données personnelles (réservations, contacts, e-mails) sont hébergées et traitées
          au sein de l'Union européenne — France pour la base de données, Irlande pour l'envoi
          des e-mails — et ne font l'objet d'aucun transfert hors UE.
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

        <h2>Mesure d'audience de nos e-mails</h2>
        <p>
          C'est un choix délibéré : nos newsletters <b>ne contiennent aucun pixel espion</b> et
          nous <b>ne mesurons pas les ouvertures</b>. Nous ne savons pas si vous avez lu un
          e-mail, à quel moment, ni depuis quel appareil.
        </p>
        <p>
          En revanche, les liens présents dans nos e-mails sont suivis : nous savons qu'un lien a
          été cliqué, ce qui nous permet de comprendre quels contenus vous intéressent. Ce suivi
          est assuré par notre prestataire d'envoi, Resend. Techniquement, les liens passent par
          une adresse de redirection avant de vous amener à destination.
        </p>
        <p>
          Nous n'utilisons aucun autre outil de traçage, et ces données ne sont jamais revendues
          ni transmises à des tiers à des fins publicitaires. Au-delà des clics, la seule mesure
          qui nous intéresse, c'est votre présence à table.
        </p>

        <p className="legal-maj">Dernière mise à jour : {L.lastUpdate}</p>
      </div>
    </div>
  );
}
