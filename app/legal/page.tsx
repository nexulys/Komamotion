import type { Metadata } from "next";
import { LegalPage, LegalValue } from "@/components/legal-page";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = { title: "Mentions légales" };

export default function LegalNoticePage() {
  const { legal, host, supportEmail } = SITE;
  return (
    <LegalPage title="Mentions légales" updated="19 octobre 2026">
      <section>
        <h2>Éditeur du site</h2>
        <p>
          Le site {SITE.url} et le service {SITE.name} sont édités par <strong><LegalValue value={legal.publisher} /></strong>
          {legal.form && <>, {legal.form}</>}.
        </p>
        <ul>
          <li>Adresse : <LegalValue value={legal.address} /></li>
          {legal.siret && <li>SIRET : {legal.siret}</li>}
          {legal.vatNumber && <li>TVA intracommunautaire : {legal.vatNumber}</li>}
          <li>
            Contact : {supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : <LegalValue value={null} />}
          </li>
          <li>Directeur de la publication : <LegalValue value={legal.publicationDirector ?? legal.publisher} /></li>
        </ul>
        <p>{SITE.name} fait partie de l&apos;écosystème Nexulys.</p>
      </section>

      <section>
        <h2>Hébergement</h2>
        <p>
          Le site est hébergé par {host.name}, {host.address} (<a href={host.website}>{host.website}</a>). Les comptes,
          projets et fichiers sont stockés chez Supabase Inc. (base de données et stockage).
        </p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          La marque, le logo, les textes et l&apos;interface de {SITE.name} sont protégés. Les contenus importés par les
          utilisateurs et les vidéos générées restent la propriété de leurs auteurs, dans les conditions des{" "}
          <a href="/terms">conditions générales</a>.
        </p>
      </section>

      <section>
        <h2>Données personnelles</h2>
        <p>
          Le traitement de vos données est décrit dans la <a href="/privacy">politique de confidentialité</a>.
        </p>
      </section>
    </LegalPage>
  );
}
