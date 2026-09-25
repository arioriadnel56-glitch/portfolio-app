# Portfolio ARIORI Adnel

Site portfolio avec espace admin (projets avec images, avis visiteurs, paramètres du site)
sur base de données PostgreSQL. Prêt à déployer sur Render.

## Structure

```
portfolio-app/
  server.js              → point d'entrée du serveur Express
  db/
    schema.sql            → création des tables
    index.js              → connexion PostgreSQL + initialisation/seed
    default-settings.js   → contenu par défaut du site (première mise en ligne)
  routes/
    auth.js                → connexion admin + changement de mot de passe
    settings.js            → lecture/écriture des paramètres publics
    projects.js            → CRUD des projets (protégé pour écrire)
    reviews.js              → lecture/écriture des avis visiteurs
  middleware/
    auth.js                 → vérifie le jeton admin (JWT)
  public/
    index.html              → le site (public + espace admin)
    app.js                   → toute la logique front (appels API)
```

## Fonctionnement de l'espace admin

- Le bouton admin n'est **pas visible** sur le site. Trois façons de l'ouvrir :
  * **URL secrète (recommandé, surtout sur mobile)** : définis la variable
    d'environnement `ADMIN_ACCESS_PATH` sur Render (ex: `x7k2-priv-adnel`,
    une chaîne aléatoire difficile à deviner). Visiter ensuite
    `https://tonsite.onrender.com/x7k2-priv-adnel` ouvre automatiquement la
    fenêtre de connexion. Ce chemin n'apparaît dans aucun fichier envoyé au
    navigateur — seul le serveur le connaît. Ajoute cette URL à l'écran
    d'accueil de ton téléphone pour y accéder en un tap.
  * Sur ordinateur, appuie sur **Ctrl + Alt + A** n'importe où sur la page
    (fonctionne sans configuration).
  * Sur mobile/tablette, tape **7 fois rapidement** (en moins de 2 secondes)
    sur la mention de copyright tout en bas du site (fonctionne sans
    configuration, mais moins discret que l'URL secrète).
- Mot de passe par défaut : celui que tu définis dans la variable d'environnement
  `ADMIN_PASSWORD` (voir plus bas). Change-le dès la première connexion depuis
  l'onglet **Sécurité** de l'admin.
- Dans l'admin tu peux :
  - **Paramètres** : ta photo de profil, ton nom, ton rôle, ta bio, le texte
    "à propos", tes coordonnées (email, WhatsApp, localisation) et tes réseaux
    sociaux (GitHub, LinkedIn, YouTube, Instagram, TikTok).
  - **Projets** : ajouter/modifier/supprimer un projet avec image, catégorie,
    description, technologies utilisées, lien du site et lien GitHub.
  - **Avis** : supprimer un avis laissé par un visiteur.

Toutes ces données sont stockées dans PostgreSQL — elles persistent réellement
et sont visibles par tous les visiteurs, contrairement à une version purement
côté navigateur.

## Connexion par Face ID / empreinte (passkey)

En plus du mot de passe, tu peux te connecter à l'admin avec Face ID, Touch ID,
Windows Hello ou l'empreinte de ton téléphone — via le standard **WebAuthn /
passkey**. Ton visage ou ton empreinte ne quittent jamais ton appareil : le
serveur ne reçoit qu'une preuve cryptographique, jamais de donnée biométrique.

### Configuration (obligatoire pour activer cette fonctionnalité)

WebAuthn exige de connaître à l'avance le domaine exact du site. Une fois ton
service Render créé et son adresse connue (ex: `portfolio-adnel.onrender.com`),
ajoute ces deux variables d'environnement sur Render :

- `RP_ID` → le domaine seul, sans `https://` ni slash (ex: `portfolio-adnel.onrender.com`)
- `ORIGIN` → l'URL complète, avec `https://`, sans slash final (ex: `https://portfolio-adnel.onrender.com`)

Si tu utilises un nom de domaine personnalisé plus tard, mets ces deux
variables à jour avec le nouveau domaine — sinon les passkeys existantes
cesseront de fonctionner (comportement normal du standard, pas un bug).

Sans ces deux variables configurées, le site fonctionne normalement mais le
bouton passkey reste inactif (le mot de passe classique fonctionne toujours).

### Utilisation

1. Connecte-toi une première fois avec le mot de passe.
2. Va dans **Admin → Sécurité → "Connexion par Face ID / empreinte"**, clique
   **"Ajouter cet appareil"**, confirme avec Face ID/Touch ID/Windows Hello.
3. La prochaine fois, la fenêtre de connexion admin proposera directement
   "Se connecter avec Face ID / empreinte".

Le mot de passe reste toujours utilisable en secours (par exemple si tu
changes d'appareil sans avoir activé la synchronisation de tes passkeys).

### ⚠️ Note technique importante

Cette fonctionnalité utilise le package `@simplewebauthn/server`, dont
l'interface a changé plusieurs fois par le passé selon les versions — la
version est donc **volontairement figée** dans `package.json` (`9.0.3`, pas
de `^`) pour garantir que le code déployé corresponde exactement à ce qui a
été écrit. Je n'ai pas pu tester cette fonctionnalité en conditions réelles
(elle nécessite un vrai navigateur, un vrai appareil biométrique et du HTTPS,
ce qu'aucun environnement de développement ne peut simuler). Si l'ajout ou la
connexion par passkey échoue après déploiement, regarde les logs Render — le
message d'erreur exact m'aidera à corriger rapidement.

## Statistiques de visites

Un onglet **Statistiques** dans l'admin affiche :
- Le nombre total de vues et de visiteurs uniques
- Les vues du jour
- Un graphique des visites des 7 derniers jours
- Les pages les plus visitées
- D'où viennent tes visiteurs (Google, réseaux sociaux, etc. — si l'info est disponible)
- La répartition Mobile / Tablette / Ordinateur

Tout est stocké dans ta propre base PostgreSQL, sans service tiers (pas de
Google Analytics, pas de cookie publicitaire). Un visiteur est reconnu grâce
à un identifiant anonyme stocké dans un cookie technique (pas d'adresse IP
ni d'identité conservée). **Tes propres visites en tant qu'admin connecté ne
sont pas comptées**, pour ne pas fausser les chiffres.

## Envoi d'email réel pour le formulaire de contact

Le formulaire envoie maintenant un vrai email (plus de simple `mailto:`),
via le service [Resend](https://resend.com) (gratuit jusqu'à 3 000 emails/mois).

1. Crée un compte gratuit sur [resend.com](https://resend.com).
2. Dans **API Keys**, crée une clé et copie-la.
3. Sur Render, ajoute la variable d'environnement `RESEND_API_KEY` avec cette
   valeur.
4. C'est tout — par défaut, les emails partent depuis l'adresse de test
   `onboarding@resend.dev` (fonctionne sans configuration supplémentaire).
   Pour envoyer depuis ta propre adresse (ex: `contact@tonsite.com`), vérifie
   ton domaine dans Resend puis mets à jour `CONTACT_FROM_EMAIL`.
5. Les messages arrivent à l'adresse email renseignée dans **Admin → Paramètres
   → Contact** — tu peux répondre directement, la réponse partira vers
   l'email du visiteur (adresse configurée en "reply-to").

Si `RESEND_API_KEY` n'est pas configurée, ou si l'envoi échoue pour une
raison quelconque, le site bascule automatiquement sur l'ouverture du client
mail du visiteur (comportement de secours), pour ne jamais bloquer une
demande de contact.

Le formulaire est aussi limité à 10 envois par heure par visiteur, pour
éviter le spam.

## Optimisation des images

Les photos et images de projets ajoutées depuis l'espace admin sont
automatiquement redimensionnées et compressées **dans le navigateur avant
l'envoi** (aucune dépendance serveur supplémentaire) :
- Photo de profil : réduite à 1000px maximum de côté, qualité 85 %
- Images de projet : réduites à 1600px maximum de côté, qualité 82 %

Ça réduit fortement la taille des images stockées en base de données (une
photo de 5 Mo devient généralement quelques centaines de Ko), sans perte
visible à l'écran, et garde le site rapide à charger.

## Galerie multi-photos par projet

Chaque projet peut avoir **jusqu'à 8 photos** :
- Dans l'admin, sélectionne plusieurs photos d'un coup (ou ajoute-les une par
  une) — chacune est compressée automatiquement. Un clic sur la croix retire
  une photo avant l'enregistrement.
- Sur le site public, la vignette d'un projet avec plusieurs photos affiche
  des flèches pour naviguer, et un clic ouvre une visionneuse plein écran
  (navigation au clavier avec les flèches, fermeture avec Échap).
- Les projets créés avant cette mise à jour (avec une seule photo) sont
  migrés automatiquement au démarrage du serveur — rien à faire de ton côté.

## Installation comme application (PWA)

Le site peut être installé comme une application sur téléphone ou ordinateur
(icône sur l'écran d'accueil, ouverture en plein écran sans barre d'adresse) :
- L'icône utilisée est ta photo de profil, déjà générée dans
  `public/icons/` (192px, 512px, 180px pour iOS, 32px pour l'onglet du
  navigateur).
- Sur Android/Chrome : un bandeau "Ajouter à l'écran d'accueil" apparaît
  automatiquement après quelques visites, ou via le menu ⋮ → "Installer
  l'application".
- Sur iPhone/Safari : bouton Partager → "Sur l'écran d'accueil".
- Si tu changes ta photo depuis l'admin, l'icône de l'app ne se met **pas**
  à jour automatiquement (les icônes sont des fichiers statiques) — remplace
  les fichiers dans `public/icons/` si tu veux changer l'icône plus tard.

## Sécurité

- **Connexion admin** : le mot de passe n'est jamais stocké en clair (hachage
  bcrypt en base). La session est stockée dans un cookie `httpOnly`,
  `secure` et `SameSite=Strict` — donc invisible et inutilisable par du
  JavaScript malveillant, contrairement à un jeton stocké dans le navigateur.
- **Anti-force brute** : la connexion admin est limitée à 10 tentatives par
  15 minutes par adresse IP.
- **Anti-spam** : la publication d'avis publics est limitée à 20 par heure
  par adresse IP.
- **Validation stricte côté serveur** : toutes les entrées (textes, liens,
  images) sont bornées en taille et vérifiées, même si la personne contourne
  le formulaire du site.
- **En-têtes de sécurité** : mis en place via `helmet` (Content-Security-Policy,
  anti-clickjacking, etc.).
- Le site n'accepte des requêtes que depuis lui-même (pas de CORS ouvert),
  puisque le frontend et l'API sont servis par le même serveur.

⚠️ Le mot de passe par défaut (`ADMIN_PASSWORD`) doit être changé dès la
première connexion, depuis l'onglet **Sécurité** de l'admin.

## Déploiement sur Render (étape par étape)

### 1. Mets le projet sur GitHub

1. Crée un nouveau dépôt sur ton compte GitHub (`arioriadnel56-glitch`), par
   exemple nommé `portfolio-adnel`.
2. Mets-y tous les fichiers de ce projet (tu peux les glisser directement dans
   l'interface "Add file → Upload files" de GitHub, ou utiliser `git push` si
   tu es à l'aise avec Git).

### 2. Crée la base de données PostgreSQL sur Render

1. Va sur [render.com](https://render.com) et connecte-toi (ou crée un compte).
2. Clique **New +** → **PostgreSQL**.
3. Donne-lui un nom (ex: `portfolio-adnel-db`), choisis la région la plus
   proche, laisse le plan gratuit si disponible → **Create Database**.
4. Une fois créée, note l'**Internal Database URL** (tu en auras besoin à
   l'étape suivante) — Render te la génère automatiquement.

### 3. Crée le service web

1. Toujours sur Render, clique **New +** → **Web Service**.
2. Connecte ton dépôt GitHub `portfolio-adnel`.
3. Configure :
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
4. Dans la section **Environment Variables**, ajoute :
   - `DATABASE_URL` → colle l'Internal Database URL de ta base créée à l'étape 2
   - `ADMIN_PASSWORD` → le mot de passe que tu veux utiliser au premier démarrage
   - `JWT_SECRET` → une longue chaîne aléatoire (par exemple générée sur
     [1password.com/password-generator](https://1password.com/password-generator/)
     ou avec `openssl rand -hex 32` sur ton ordinateur)
5. Clique **Create Web Service**.

Render installe les dépendances, démarre le serveur, et crée automatiquement
les tables dans ta base au premier lancement (grâce à `db/index.js`). Ton
site sera disponible à une adresse du type :
`https://portfolio-adnel.onrender.com`

### 4. Connecte-toi à l'admin

Une fois le site en ligne, ouvre-le, appuie sur **Ctrl + Alt + A**, entre le
mot de passe défini dans `ADMIN_PASSWORD`, puis va dans **Sécurité** pour le
changer immédiatement.

## Développement local (optionnel)

Si tu veux tester en local avant de déployer :

```bash
npm install
cp .env.example .env
# renseigne DATABASE_URL avec une base Postgres locale ou distante dans .env
npm start
```

Le site sera disponible sur `http://localhost:3000`.
