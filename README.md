# Pub Goudale Genève — site officiel

Site bilingue (français / anglais) des Pub Goudale de Châtelaine, de la Tourelle et de la Concorde, avec espace gérant sécurisé.

**Technologies :** Node.js 20+ · Express · MariaDB (ou MySQL) · gabarits EJS · HTML, CSS et JavaScript sans framework.
**Hébergement prévu :** Infomaniak (Suisse), hébergement web avec Node.js et base MariaDB.

---

## Ce que fait le site

**Pour les clients (FR / EN)**
- Accueil : les 3 pubs avec statut « ouvert / fermé » en direct, horaires, plat du jour.
- Menu de la semaine, carte des bières et de la cuisine (produits épuisés barrés en direct), programme des matchs.
- **Réservation en ligne** avec contrôle de capacité (midi / soir) et des horaires, page de suivi privée, annulation par le client.
- **Groupes et privatisation** avec estimation de prix immédiate selon la formule et le budget.
- **Carte fidélité** : envoyée par e-mail, avec code et QR, la 10e bière est offerte.
- **Newsletter** avec double confirmation et désinscription en un clic.
- **Ce soir au pub** (`/fr/ce-soir`) : places libres, match et plat du jour, à partager sur Instagram ou WhatsApp.
- **Ouverture de la Concorde** (`/fr/concorde`) : compte à rebours et inscriptions.
- **Écran TV** (`/fr/ecran?pub=chatelaine`) : diaporama plein écran mis à jour automatiquement.
- Référencement : balises bilingues, données structurées « BarOrPub » pour Google, sitemap, robots.txt.
- Mentions légales et déclaration de protection des données (nLPD).

**Pour vous (`/admin`)**
- Réservations : confirmer / refuser (e-mail automatique au client), marquer venu / absent, ajouter une réservation prise par téléphone, places restantes du soir.
- Groupes, fidélité (ajout de tampons par code, 6 maximum par jour), « épuisé en un clic ».
- Contenu : menu de la semaine, carte, matchs, formules, pubs (adresse, horaires, capacité, liens Google), photos, bandeau d'annonce.
- E-mail du lundi : aperçu, envoi de test, envoi à tous, ou envoi automatique le lundi à 8 h.
- QR codes à imprimer, exports CSV, comptes (propriétaire / gérant par pub), journal des actions.

**Automatique**
- E-mail du lundi à 8 h (si activé), anonymisation des données à 3 h 30.

La sécurité est détaillée dans [SECURITY.md](SECURITY.md).

---

## Essayer sur votre ordinateur

Prérequis : [Node.js 20 ou plus](https://nodejs.org/).

```bash
npm install
npm run seed                                  # contenu d'exemple + base locale SQLite
npm run create-admin -- vous@exemple.ch "Votre Nom"
npm run dev
```

Ouvrez http://localhost:3000 (site) et http://localhost:3000/admin (gérant).
En local, rien n'est réellement envoyé : les e-mails s'affichent dans le terminal.

Tests automatiques (parcours clients, espace gérant, contrôles de sécurité) :

```bash
npm test
```

---

## Mise en ligne chez Infomaniak

Guide Infomaniak de référence : [Créer un site Node.js](https://www.infomaniak.com/fr/support/faq/2537/creer-un-site-nodejs-chez-infomaniak).

### 1. Préparer l'hébergement
1. Commandez un **hébergement web** Infomaniak (Node.js inclus) et reliez-y votre domaine, par exemple `pubgoudale.ch`.
2. Créez une **base de données MariaDB** et un utilisateur dédié. Notez l'hôte, le nom de la base, l'utilisateur et le mot de passe.
3. Créez une adresse e-mail d'envoi, par exemple `noreply@pubgoudale.ch`, et notez son mot de passe.
4. Activez le **certificat SSL** gratuit (Let's Encrypt) sur le domaine.

### 2. Créer le site Node.js
1. Manager › Hébergement › votre hébergement › **Ajouter un site** › technologies avancées › **Node.js**.
2. Choisissez votre domaine, la méthode **personnalisée**, puis l'import par **archive ZIP** : envoyez `pub-goudale-infomaniak.zip` (les fichiers sont à la racine de l'archive).
3. Réglages :
   - dossier d'exécution : `./`
   - commande de construction : `npm ci --omit=dev`
   - commande de lancement : `npm start`
   - port d'écoute : laissez celui proposé (l'application le lit automatiquement)
   - version de Node.js : la LTS la plus récente (20 ou plus)

### 3. Configurer (sans ligne de commande)
1. Ouvrez le fichier `.env` du site (gestionnaire FTP du Manager ou FileZilla) et remplissez les lignes « À REMPLIR » : base de données, e-mail d'envoi, votre e-mail et un mot de passe propriétaire. Mettez les mots de passe entre guillemets.
2. Redémarrez le site. Au premier démarrage, le contenu d'exemple et votre compte propriétaire sont créés automatiquement (voir la console d'exécution).
3. Connectez-vous sur `/admin`, activez la double authentification, puis **effacez la ligne ADMIN_PASSWORD** du fichier `.env` et redémarrez.

Avec un accès SSH, `npm run seed` et `npm run create-admin` restent disponibles.

### 4. Après la mise en ligne
1. **Réglages** : raison sociale, adresse, numéro IDE et e-mail de contact (affichés dans les mentions légales).
2. **Pubs & capacité** : adresse, téléphone, e-mail et horaires de la Tourelle, places midi et soir de chaque pub, liens Google Maps et « Laisser un avis », date d'ouverture de la Concorde.
3. **Carte, Menu semaine, Formules** : remplacez les exemples par vos vrais produits et prix.
4. **Photos** : photo d'accueil, une photo par pub, quelques photos pour la galerie.
5. **Comptes** : créez un compte « Gérant » pour chaque responsable de pub.
6. **Google Business Profile** : mettez le lien du site et le lien de réservation `https://www.pubgoudale.ch/fr#reserver` sur la fiche de chaque pub.
7. Activez les **sauvegardes automatiques** de la base et du dossier `uploads/`.

---

## Structure du projet

```
src/
  server.js          démarrage, migrations, tâches planifiées
  app.js             en-têtes de sécurité, fichiers statiques, erreurs
  config.js          lecture et contrôle du fichier .env
  routes/public.js   site public, formulaires, API sans données personnelles
  routes/admin.js    espace gérant
  lib/               sécurité, réservations, e-mails/SMS, newsletter, horaires
  i18n/fr.js, en.js  textes du site en français et en anglais
  views/             gabarits des pages (public, admin, légal)
  jobs.js            rappels, e-mail du lundi, purge nLPD
migrations/          structure de la base de données
public/              CSS, JavaScript, polices, icône
scripts/             contenu d'exemple, création du compte propriétaire
test/                tests de bout en bout
```

## Maintenance

- Mises à jour mensuelles : `npm audit`, puis `npm update`, puis `npm test`, puis redémarrage.
- Les textes du site se modifient dans `src/i18n/fr.js` et `src/i18n/en.js` ; le contenu (carte, menu, horaires…) depuis l'espace gérant.
