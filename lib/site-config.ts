/**
 * Public identity of the site, read from environment variables so it can be
 * filled in from Vercel without a code change. The legal pages (/legal,
 * /terms, /privacy) and the footer read everything from here.
 */
function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export const SITE = {
  name: "KomaMotion AI",
  url: env("NEXT_PUBLIC_APP_URL") ?? "https://komamotion.vercel.app",
  supportEmail: env("NEXT_PUBLIC_SUPPORT_EMAIL"),
  legal: {
    /** Publisher: "Prénom Nom (EI)" or the company name. */
    publisher: env("NEXT_PUBLIC_LEGAL_NAME"),
    /** Legal form, e.g. "Entrepreneur individuel" or "SAS au capital de 1 000 €". */
    form: env("NEXT_PUBLIC_LEGAL_FORM"),
    address: env("NEXT_PUBLIC_LEGAL_ADDRESS"),
    siret: env("NEXT_PUBLIC_LEGAL_SIRET"),
    vatNumber: env("NEXT_PUBLIC_LEGAL_VAT"),
    /** Directeur de la publication (usually the publisher or the company's legal representative). */
    publicationDirector: env("NEXT_PUBLIC_LEGAL_DIRECTOR"),
    /** Consumer mediator (médiateur de la consommation) name + website — mandatory for B2C sales in France. */
    mediator: env("NEXT_PUBLIC_LEGAL_MEDIATOR"),
  },
  host: {
    name: "Vercel Inc.",
    address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
    website: "https://vercel.com",
  },
} as const;

/** True once the mandatory publisher details are configured. */
export const LEGAL_IDENTITY_COMPLETE = Boolean(SITE.legal.publisher && SITE.legal.address && SITE.supportEmail);
