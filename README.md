# Board HACC · Hyundai St-Constant

Une **page d'accueil** (menu à gauche, chiffres clés du jour) mène aux inventaires et aux ventes : **Inventaire neuf** (board HACC : stock, arrivages, commandes, ventes neuf), **Inventaire usagé** (D2C : occasions, coûtants, ventes usagés) et **Ventes wholesale** (autos vendues aux marchands et aux encans, profit vs objectif). La section CSI lit BoostCX ; Comeback et Évaluation sont prévues dans le menu.

**Accès privé, sur invitation** : l'admin invite chaque personne via « Gérer les accès ».

- **Hébergement :** GitHub Pages (fichiers statiques, aucune donnée dans ce dépôt)
- **Données :** Firebase Firestore (projet `hacc-st-constant`, région Montréal), accès protégé par `firestore.rules`
- **Connexion :** compte Google des personnes invitées (collection `membres`)
- **Google Drive / Sheets / Agenda :** bouton « Connecter Google » dans l'app (jeton valide 1 h)
- **Mise à jour HACC :** bouton « Mettre à jour depuis HACC » → installer le favori, puis le cliquer sur le portail HACC

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.html` / `accueil.js` | Page d'accueil : menu des sections, accueil personnalisé, chiffres clés (renvoie les anciens liens `#import`, `#stock`… vers `neuf.html`) |
| `csi.js` | Section CSI (onglets Ventes et Service) : scores NPS, FRFT, Effective Records Rate, questions clés, par conseiller, sondages ; favori « ⟳ CSI BoostCX » (bouton « Mettre à jour depuis BoostCX ») qui lit BoostCX et enregistre dans `config/csi*` |
| `neuf.html` | Inventaire neuf (HACC) |
| `usage.html` / `usage.js` | Inventaire usagé (D2C) ; bouton « Mettre à jour depuis D2C » (favori ⟳ Inventaire D2C) |
| `wholesale.html` / `wholesale.js` | Ventes wholesale : saisie directe, profit = vendant − coûtant, acheteurs, objectif de profit du mois (base `wholesale_suivi`, `wholesale_config`) |
| `sauvegarde/Code.gs` | Google Apps Script (compte de l'admin) : chaque jour vers 9 h, copie Excel de toutes les ventes (neuf, usagé, wholesale) dans le dossier Drive « Sauvegardes ventes (board) » |
| `app.js` | Logique du board (stock, arrivages, ventes) |
| `shim.js` | Branche le board sur Firebase et les API Google |
| `firebase-config.js` | Configuration Firebase + liste des admins |
| `firestore.rules` | Règles de sécurité (à coller dans la console Firebase) |
| `logo.png` | Logo Hyundai St-Constant (fond transparent ; affiché en blanc sur la barre bleue et en mode sombre) |

## Ajouter un admin
1. Ajouter l'adresse dans `HACC_ADMINS` (`firebase-config.js`)
2. Ajouter la même adresse dans `isAdmin()` de `firestore.rules`, puis publier les règles dans Firebase.

