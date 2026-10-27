# Mise en production de KomaMotion AI

Tout ce qu'il reste à configurer **hors du code** pour que le site fonctionne
de bout en bout. Les étapes sont dans l'ordre : chacune débloque la suivante.
Tout se fait depuis un navigateur (téléphone compris).

> **Règle Vercel** : les variables qui commencent par `NEXT_PUBLIC_` doivent
> être de type **Config** (Vercel refuse le type Secret pour elles). Toutes les
> autres : type **Secret**. Après chaque ajout de variables, **redéployer**
> (Deployments → ⋯ → Redeploy), sinon elles ne sont pas prises en compte.

---

## 0. Hébergement payant (obligatoire pour vendre)

- **Vercel** : l'offre gratuite (Hobby) interdit l'usage commercial. Passer en **Pro** (environ 20 $/mois)
  avant d'encaisser le premier paiement (Vercel → Settings → Billing).
- **Supabase** : l'offre gratuite est vite trop petite pour stocker des vidéos et met en pause les projets
  inactifs. Prévoir **Pro** (environ 25 $/mois) dès les premiers clients.

## 1. Fusionner le code

1. GitHub → Pull requests → la PR « KomaMotion production readiness » (#3).
2. Attendre que la vérification **CI** soit verte, puis **Merge pull request**.
3. Vercel redéploie automatiquement `main`.

## 2. Supabase

### 2.1 Migrations
SQL Editor → New query → coller le contenu de chaque fichier, l'un après l'autre → **Run** :
1. `supabase/migrations/0005_enhancement_job_status.sql`
2. `supabase/migrations/0006_episodes.sql` (les épisodes : chapitre → vidéo finie)

(0001 à 0004 sont déjà appliquées. 0005 et 0006 peuvent être relancées sans risque.)

### 2.2 Adresses autorisées (sinon les e-mails pointent vers `localhost`)
Authentication → URL Configuration :
- **Site URL** : `https://komamotion.vercel.app`
- **Redirect URLs** : ajouter `https://komamotion.vercel.app/**`

### 2.3 Envoi des e-mails (confirmation d'inscription, mot de passe oublié)
Le service d'e-mail intégré de Supabase n'envoie qu'aux membres de ton équipe
Supabase et est très limité en nombre : **tes clients ne recevraient rien**.
1. Acheter un nom de domaine (ex. `komamotion.com`) — nécessaire pour envoyer
   des e-mails qui n'arrivent pas en spam, et plus pro qu'une adresse `vercel.app`.
2. Créer un compte **Resend** (resend.com), ajouter le domaine, copier les
   enregistrements DNS qu'il donne chez ton registrar, attendre « Verified ».
3. Supabase → Authentication → Emails → **SMTP Settings** → activer, puis :
   hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = clé API Resend,
   expéditeur `noreply@ton-domaine`.
4. (Optionnel) Brancher le domaine sur Vercel (Settings → Domains) et mettre à jour
   `NEXT_PUBLIC_APP_URL` + la Site URL Supabase avec la nouvelle adresse.

### 2.4 Te donner les droits admin
SQL Editor : `update public.users set is_admin = true where email = 'TON_EMAIL';`

### 2.5 Captcha anti-robots (recommandé avant toute publicité)
Chaque inscription donne des crédits gratuits : sans captcha, un robot peut en créer des milliers.
1. Cloudflare (compte gratuit) → **Turnstile** → Add widget → domaine `komamotion.vercel.app`
   (et ton futur domaine) → copier la **Site Key** et la **Secret Key**.
2. Supabase → Authentication → **Attack Protection** → activer *Captcha protection*, fournisseur
   **Turnstile**, coller la **Secret Key**.
3. Vercel → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = la **Site Key** (type Config) → redéployer.
Les deux doivent être faits ensemble : si Supabase exige un captcha sans que le site l'affiche, plus
personne ne peut se connecter.

### 2.6 (Optionnel) Connexion Google
Authentication → Providers → Google (nécessite un identifiant OAuth Google Cloud),
puis Vercel : `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` = `true` (Config). Sans ça, le bouton reste masqué.

## 3. fal.ai (génération vidéo, colorisation, détourage, upscale)

1. fal.ai → créer un compte → **Billing** : ajouter du crédit.
2. **Keys** → créer une clé.
3. La mettre dans Vercel **et** dans Trigger.dev (étape 4) sous le nom `FAL_KEY` (Secret).
   Ne jamais la coller dans une conversation.

## 4. Trigger.dev (toutes les tâches de fond)

Sans Trigger.dev, aucun rendu, export, découpage, filigrane, 4K ni son ne s'exécute.

1. trigger.dev → créer un compte et un projet. Noter le **Project ref** (`proj_…`).
2. **Vercel** → variables :
   - `TRIGGER_PROJECT_REF` = `proj_…`
   - `TRIGGER_SECRET_KEY` = la clé **Production** (`tr_prod_…`, page API keys du projet)
3. **Trigger.dev** → Environment variables → environnement **Production** → ajouter
   (les tâches tournent chez Trigger.dev, pas chez Vercel) :

   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | identique à Vercel |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | identique à Vercel |
   | `SUPABASE_SERVICE_ROLE_KEY` | identique à Vercel |
   | `NEXT_PUBLIC_APP_URL` | `https://komamotion.vercel.app` (ou ton domaine) |
   | `AI_WEBHOOK_SECRET` | identique à Vercel |
   | `FAL_KEY` | ta clé fal.ai |
   | `ELEVENLABS_API_KEY` | seulement si tu actives le son (étape 7) |

4. **Déploiement automatique depuis GitHub** (rien à installer) :
   - Trigger.dev → Account → **Personal Access Tokens** → créer un jeton.
   - GitHub → dépôt → Settings → Secrets and variables → Actions :
     - onglet **Secrets** → `TRIGGER_ACCESS_TOKEN` = le jeton ;
     - onglet **Variables** → `TRIGGER_PROJECT_REF` = `proj_…`.
   - GitHub → Actions → « Deploy Trigger.dev tasks » → **Run workflow**.
   Ensuite chaque mise à jour de `main` redéploie les tâches toute seule.

## 5. Stripe (paiements)

Commencer en **mode test** (clés `sk_test_…`), tout vérifier, puis refaire en mode live.

1. **Produits** (Product catalog → Add product), prix en **USD** :
   - Starter — 19 $ / mois (récurrent)
   - Studio — 49 $ / mois (récurrent)
   - Pro Studio — 149 $ / mois (récurrent)
   - Pack de crédits — 15 $ (paiement unique)
   Copier l'identifiant de prix de chacun (`price_…`).
2. **Vercel** : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_STUDIO`,
   `STRIPE_PRICE_PRO`, `STRIPE_PRICE_CREDIT_PACK`.
3. **Webhook** (Developers → Webhooks → Add endpoint) :
   - URL : `https://komamotion.vercel.app/api/webhooks/stripe`
   - Événements : `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`
   - Copier le **Signing secret** (`whsec_…`) → Vercel `STRIPE_WEBHOOK_SECRET`.
4. **Portail client** (Settings → Billing → Customer portal) : activer ; autoriser la mise
   à jour du moyen de paiement, l'annulation **à la fin de la période**, et le changement
   de forfait entre les 3 prix. (Les CGU annoncent une résiliation en fin de période.)
5. **Infos publiques** (Settings → Public details) : URL des CGV `…/terms` et de la
   politique de confidentialité `…/privacy`.
6. (Recommandé) **Stripe Tax** : l'activer, puis Vercel `STRIPE_AUTOMATIC_TAX` = `true`.

## 6. Upstash (protection contre les abus)

upstash.com → Create database (Redis) → copier **REST URL** et **REST TOKEN** →
Vercel `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.
Sans eux, n'importe qui peut envoyer un nombre illimité de requêtes.

## 7. (Optionnel) ElevenLabs — option « Add AI sound »

elevenlabs.io → API keys → `ELEVENLABS_API_KEY` dans Vercel et Trigger.dev.

## 8. Informations légales (obligatoires pour vendre en France)

Vercel → variables (type **Config**) — elles remplissent automatiquement le pied de page,
`/legal`, `/terms` et `/privacy` :

| Variable | Exemple |
|---|---|
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `support@ton-domaine` |
| `NEXT_PUBLIC_LEGAL_NAME` | `Prénom Nom (EI)` ou nom de la société |
| `NEXT_PUBLIC_LEGAL_FORM` | `Entrepreneur individuel` / `SAS au capital de 1 000 €` |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | adresse postale |
| `NEXT_PUBLIC_LEGAL_SIRET` | n° SIRET |
| `NEXT_PUBLIC_LEGAL_VAT` | n° TVA (si assujetti) |
| `NEXT_PUBLIC_LEGAL_DIRECTOR` | directeur de la publication (souvent toi) |
| `NEXT_PUBLIC_LEGAL_MEDIATOR` | médiateur de la consommation (nom + site) |

- Il faut **adhérer à un médiateur de la consommation** (obligatoire en B2C, payant).
- Les textes ont été rédigés d'après le fonctionnement réel du site, mais ce ne sont
  pas des conseils juridiques : **les faire relire** par un professionnel.

## 9. Choisir le modèle vidéo (tests de qualité)

Avant de lancer, vérifier que les vidéos sont belles sur **tes** pages de manga.
1. Te mettre admin (étape 2.4) et t'ajouter des crédits (Admin → Users → sur ta ligne, saisir un nombre de crédits puis **Apply**).
2. Ouvrir un projet : un sélecteur **Video model · admin test** apparaît dans les réglages
   (visible seulement par les admins). Les clients ont toujours le modèle par défaut (LTX-2.3).
3. Prendre 10 à 20 cases variées (noir et blanc, couleur, visages, action, décor) et rendre chacune avec
   les 4 modèles. L'historique indique quel modèle a fait quel rendu.
4. Noter pour chaque modèle : visages stables ? traits respectés ? texte qui fond ? mouvement naturel ?
   Puis regarder le coût réel de chaque modèle dans la facturation fal.ai.
5. Si un autre modèle est nettement meilleur, demande-moi de le passer par défaut : je réajusterai les prix
   en fonction de son coût.

## 10. Vérifier la rentabilité

Grille actuelle (`lib/stripe/credits.ts`) : une seconde de vidéo coûte **3 crédits en
1080p** et **12 crédits en 4K**, pour un coût fal.ai d'environ 0,04 $/s en 1080p et
0,16 $/s en 4K (LTX-2.3 fast, prix catalogue d'octobre 2026). Marge brute par seconde
rendue, avant frais Stripe : Starter ≈ 58 %, Studio ≈ 46 %, Pro ≈ 37 % (les crédits
non utilisés l'augmentent). Le compte gratuit coûte environ 0,24 $ par inscription
(une vidéo de 6 s).

À faire une fois fal.ai branché : comparer ces chiffres avec ta facture réelle
(Billing sur fal.ai) et le tableau Admin → Overview, et vérifier le prix de
`fal-ai/video-upscaler` (l'upscale 4K est facturé 1,5 crédit par seconde). Si un
prix change, ajuster `CREDITS_PER_SECOND` (et les estimations de `lib/ai/costs.ts`).

## 11. Test final (dans cet ordre)

1. Créer un compte avec une vraie adresse → l'e-mail de confirmation arrive.
2. « Forgot password? » → l'e-mail arrive → nouveau mot de passe accepté.
3. Créer un projet → importer une planche → lancer un rendu (compte gratuit) :
   la vidéo arrive en 720p avec le filigrane, les crédits baissent.
4. Couper Trigger.dev (ou mettre une mauvaise clé fal) → lancer un rendu :
   il échoue et les crédits reviennent.
5. Billing → s'abonner à Starter avec la carte de test `4242 4242 4242 4242` →
   le forfait et les crédits se mettent à jour, plus de filigrane.
6. Manage subscription → résilier → à la fin de la période (ou via
   « Cancel immediately » en test) le compte repasse en Free.
7. Account → supprimer un compte de test → il disparaît de Supabase et l'abonnement est annulé.
8. Rendre 3 cases, puis carte **4. Build an episode** : les choisir dans l'ordre, ajouter un titre et un
   sous-titre, format vertical → l'épisode arrive en une à deux minutes, lisible et téléchargeable.
9. Importer une image explicite de test → le rendu est refusé avec un message, et les crédits reviennent.
