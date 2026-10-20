import type { Metadata } from "next";
import { LegalPage, LegalValue } from "@/components/legal-page";
import { SITE } from "@/lib/site-config";
import { CREDIT_PACK, FREE_PLAN, PLANS } from "@/lib/stripe/plans";

export const metadata: Metadata = { title: "Conditions générales" };

export default function TermsPage() {
  const contact = SITE.supportEmail ? <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> : <LegalValue value={null} />;
  return (
    <LegalPage title="Conditions générales d'utilisation et de vente" updated="19 octobre 2026">
      <section>
        <h2>1. Objet</h2>
        <p>
          {SITE.name} (le « Service ») transforme des planches de manga fournies par l&apos;utilisateur en vidéos grâce à
          des modèles d&apos;intelligence artificielle. Les présentes conditions régissent l&apos;utilisation du Service et
          l&apos;achat d&apos;abonnements et de crédits. Le Service est édité par <LegalValue value={SITE.legal.publisher} />{" "}
          (voir les <a href="/legal">mentions légales</a>).
        </p>
      </section>

      <section>
        <h2>2. Compte</h2>
        <p>
          La création d&apos;un compte nécessite une adresse e-mail valide. Vous êtes responsable de la confidentialité de
          votre mot de passe et de l&apos;activité de votre compte. Vous pouvez supprimer votre compte à tout moment depuis la
          page « Account » : vos projets, fichiers et crédits restants sont alors effacés définitivement.
        </p>
      </section>

      <section>
        <h2>3. Crédits</h2>
        <ul>
          <li>Chaque rendu consomme des crédits, affichés avant le lancement (une seconde de vidéo coûte 3 crédits en 1080p et 12 en 4K ; certaines options coûtent davantage).</li>
          <li>Les crédits sont débités au lancement. Si un rendu, un export, un découpage ou une option échoue, les crédits correspondants sont recrédités automatiquement.</li>
          <li>Le compte gratuit reçoit {FREE_PLAN.credits} crédits à l&apos;inscription ; ses vidéos sont limitées au 720p et portent un filigrane.</li>
          <li>Les crédits n&apos;ont pas de valeur monétaire, ne sont ni cessibles ni remboursables, sauf disposition contraire ci-dessous ou obligation légale.</li>
        </ul>
      </section>

      <section>
        <h2>4. Abonnements et packs de crédits</h2>
        <ul>
          <li>
            Abonnements mensuels : {PLANS.map((p) => `${p.name} (${p.price} $ / mois, ${p.credits.toLocaleString("fr-FR")} crédits)`).join(", ")}.
            Les crédits mensuels sont versés à chaque paiement réussi.
          </li>
          <li>Pack de crédits : {CREDIT_PACK.credits} crédits pour {CREDIT_PACK.price} $, paiement unique.</li>
          <li>Les paiements sont traités par Stripe. Les prix sont indiqués en dollars américains ; les taxes applicables peuvent s&apos;ajouter selon votre pays.</li>
          <li>L&apos;abonnement se renouvelle automatiquement chaque mois. Vous pouvez le résilier à tout moment via « Manage subscription » ; la résiliation prend effet à la fin de la période payée et le compte repasse alors au forfait gratuit. Les crédits déjà acquis restent sur le compte.</li>
          <li>En cas d&apos;échec de paiement, les fonctionnalités payantes peuvent être suspendues jusqu&apos;à régularisation.</li>
        </ul>
      </section>

      <section>
        <h2>5. Droit de rétractation</h2>
        <p>
          Si vous êtes un consommateur, vous disposez d&apos;un délai de 14 jours à compter de l&apos;achat pour vous rétracter.
          Le Service étant un contenu numérique fourni immédiatement, ce droit ne s&apos;applique plus aux crédits que vous avez
          déjà utilisés : en lançant un rendu, vous demandez l&apos;exécution immédiate du Service et reconnaissez renoncer à
          votre droit de rétractation pour la part consommée (article L221-28 du Code de la consommation). Pour exercer votre
          droit sur la part non utilisée, écrivez à {contact}.
        </p>
      </section>

      <section>
        <h2>6. Vos contenus</h2>
        <ul>
          <li>Vous restez propriétaire des images que vous importez et des vidéos générées à partir de celles-ci.</li>
          <li>
            Vous garantissez disposer des droits nécessaires sur les planches importées (œuvres dont vous êtes l&apos;auteur ou
            pour lesquelles vous avez une autorisation). Les mangas publiés sont généralement protégés par le droit d&apos;auteur.
          </li>
          <li>Vous nous autorisez à stocker et traiter ces contenus, y compris via nos prestataires d&apos;IA, uniquement pour fournir le Service.</li>
          <li>Sont interdits les contenus illicites, contrefaisants, haineux, à caractère sexuel impliquant des mineurs ou portant atteinte aux droits d&apos;autrui. Nous pouvons supprimer de tels contenus et suspendre le compte concerné.</li>
        </ul>
      </section>

      <section>
        <h2>7. Résultats générés par l&apos;IA</h2>
        <p>
          Les vidéos sont produites automatiquement par des modèles d&apos;IA tiers. Leur rendu peut varier et ne pas
          correspondre exactement à vos attentes ; il vous appartient de vérifier qu&apos;elles conviennent à l&apos;usage que vous en faites.
        </p>
      </section>

      <section>
        <h2>8. Disponibilité et responsabilité</h2>
        <p>
          Nous faisons nos meilleurs efforts pour assurer la disponibilité du Service, sans garantie d&apos;absence
          d&apos;interruption. Dans les limites permises par la loi, notre responsabilité est limitée aux sommes que vous avez
          versées au cours des 12 derniers mois. Rien dans ces conditions ne limite les droits que la loi vous accorde en tant
          que consommateur.
        </p>
      </section>

      <section>
        <h2>9. Modification des conditions</h2>
        <p>Nous pouvons modifier ces conditions ; les changements importants vous seront signalés avant leur entrée en vigueur.</p>
      </section>

      <section>
        <h2>10. Droit applicable et litiges</h2>
        <p>
          Ces conditions sont soumises au droit français. En cas de litige, contactez-nous d&apos;abord à {contact}. Si vous
          êtes un consommateur, vous pouvez recourir gratuitement au médiateur de la consommation :{" "}
          <LegalValue value={SITE.legal.mediator} />, ainsi qu&apos;à la plateforme européenne de règlement en ligne des litiges.
        </p>
      </section>
    </LegalPage>
  );
}
