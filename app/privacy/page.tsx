import type { Metadata } from "next";
import { LegalPage, LegalValue } from "@/components/legal-page";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  const contact = SITE.supportEmail ? <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> : <LegalValue value={null} />;
  return (
    <LegalPage title="Politique de confidentialité" updated="19 octobre 2026">
      <section>
        <h2>Responsable du traitement</h2>
        <p>
          <LegalValue value={SITE.legal.publisher} />, <LegalValue value={SITE.legal.address} />. Contact : {contact}.
        </p>
      </section>

      <section>
        <h2>Données traitées et finalités</h2>
        <ul>
          <li><strong>Compte</strong> (e-mail, nom affiché, mot de passe chiffré) : créer et sécuriser votre compte — exécution du contrat.</li>
          <li><strong>Contenus</strong> (planches importées, vidéos générées, réglages) : fournir le Service — exécution du contrat.</li>
          <li><strong>Crédits et facturation</strong> (forfait, historique des crédits, identifiants Stripe) : gérer vos achats — exécution du contrat et obligations légales. Nous ne voyons ni ne stockons vos données de carte bancaire.</li>
          <li><strong>Sécurité</strong> (adresse IP, journaux techniques) : prévenir les abus et limiter le nombre de requêtes — intérêt légitime.</li>
        </ul>
      </section>

      <section>
        <h2>Prestataires (sous-traitants)</h2>
        <ul>
          <li>Vercel (hébergement du site)</li>
          <li>Supabase (base de données, authentification, stockage des fichiers)</li>
          <li>Stripe (paiements)</li>
          <li>fal.ai (génération vidéo, colorisation, détourage, découpage : vos planches leur sont transmises pour traitement)</li>
          <li>ElevenLabs (génération de son, si vous utilisez l&apos;option)</li>
          <li>Trigger.dev (exécution des tâches en arrière-plan)</li>
          <li>Upstash (limitation du nombre de requêtes)</li>
        </ul>
        <p>
          Certains de ces prestataires sont établis aux États-Unis ; les transferts sont encadrés par les clauses
          contractuelles types de la Commission européenne ou le Data Privacy Framework.
        </p>
      </section>

      <section>
        <h2>Durées de conservation</h2>
        <ul>
          <li>Compte, projets et vidéos : jusqu&apos;à la suppression de votre compte ou du projet.</li>
          <li>Fichiers importés inutilisés : supprimés automatiquement après 30 jours.</li>
          <li>Factures : conservées par Stripe pendant la durée légale (10 ans).</li>
        </ul>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          Le site n&apos;utilise que des cookies strictement nécessaires (maintien de votre session de connexion). Aucun
          cookie publicitaire ni de mesure d&apos;audience n&apos;est déposé : aucun consentement n&apos;est donc requis.
        </p>
      </section>

      <section>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez accéder à vos données, les rectifier, les exporter, vous opposer à un traitement ou demander leur
          effacement. La suppression de votre compte est disponible directement dans la page « Account ». Pour toute
          autre demande : {contact}. Vous pouvez aussi saisir la CNIL (<a href="https://www.cnil.fr">www.cnil.fr</a>).
        </p>
      </section>
    </LegalPage>
  );
}
