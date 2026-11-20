# Sécurité du site Pub Goudale

Ce document résume les protections en place et les gestes à garder.

## Protections intégrées

| Risque | Protection |
|---|---|
| Vol de mot de passe | Hachage scrypt (32 768 itérations, sel unique). 12 caractères minimum, mots courants refusés. |
| Devinette de mot de passe | 10 tentatives / 15 min par adresse IP, 8 par compte, verrouillage progressif après 5 erreurs. Même message et même temps de réponse pour un compte inconnu. |
| Compte compromis | Double authentification (TOTP) **obligatoire** en production. Code à usage unique (anti-rejeu). Secret 2FA chiffré en AES-256-GCM. |
| Session volée | Cookie `__Host-` HttpOnly, Secure, SameSite=Strict. Expiration après 2 h d'inactivité et 12 h maximum. Nouvelle session à chaque connexion. Changer son mot de passe déconnecte les autres appareils. |
| Accès trop large | Rôles : le **gérant** d'un pub ne voit que ses réservations, groupes, fidélité et la liste « Épuisé ». Le contenu, les comptes et les exports sont réservés au **propriétaire**. |
| Falsification de requête (CSRF) | Jeton signé HMAC sur chaque formulaire + contrôle de l'en-tête Origin. |
| Injection de code (XSS) | Toutes les saisies sont échappées. Politique CSP stricte : aucun script externe ni en ligne, aucune police ou ressource tierce. |
| Injection SQL | Requêtes paramétrées (Knex) uniquement. |
| Robots et spam | Champ piège invisible, délai minimal de saisie signé, limite de 8 envois / 10 min par IP. |
| Fichiers piégés | Photos relues et réencodées en WebP par sharp (un faux fichier est rejeté), métadonnées GPS supprimées, noms de fichiers aléatoires, 10 Mo maximum. |
| Injection d'en-têtes e-mail | Champs d'une ligne nettoyés des retours à la ligne et caractères de contrôle. |
| Injection de formules (CSV) | Les exports neutralisent les cellules commençant par = + - @. |
| Surréservation | Contrôle de capacité dans une transaction verrouillée. |
| Traçabilité | Journal de toutes les actions du gérant (connexions, échecs, statuts, exports, modifications). |
| Vie privée (nLPD) | Aucun cookie publicitaire, aucune mesure d'audience, polices auto-hébergées, newsletter en double confirmation, anonymisation automatique après 12 mois, liens privés non indexés. |
| Dépendances | `npm audit` : 0 vulnérabilité connue au 4 novembre 2026. |

En-têtes envoyés : Content-Security-Policy, Strict-Transport-Security (2 ans), X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Resource-Policy.

## Gestes à garder

1. **Activez la 2FA** sur votre téléphone dès la première connexion, et gardez la clé de secours dans un endroit sûr.
2. **Un compte par personne.** Ne partagez jamais votre identifiant. Désactivez le compte d'un employé qui part (page « Comptes »).
3. **Mettez à jour** le site une fois par mois : `npm audit` puis `npm update`, et relancez l'application.
4. **Sauvegardes** : activez les sauvegardes automatiques de la base MariaDB et du dossier `uploads/` dans le Manager Infomaniak.
5. **Le fichier `.env`** ne doit jamais être envoyé par e-mail ni publié sur GitHub.
6. Consultez le **Journal** de temps en temps : une série de « login.fail » signale une tentative d'intrusion.

## Signaler un problème

Écrivez à l'adresse de contact indiquée dans les mentions légales.
