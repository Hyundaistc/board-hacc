# Board HACC · Hyundai St-Constant

Deux sections : **Inventaire neuf** (board HACC : stock, arrivages, commandes, ventes neuf) et **Inventaire usagé** (D2C : occasions, coûtants, ventes usagés).

**Accès privé, sur invitation** : l'admin invite chaque personne via « Gérer les accès ».

- **Hébergement :** GitHub Pages (fichiers statiques, aucune donnée dans ce dépôt)
- **Données :** Firebase Firestore (projet `hacc-st-constant`, région Montréal), accès protégé par `firestore.rules`
- **Connexion :** compte Google des personnes invitées (collection `membres`)
- **Google Drive / Sheets / Agenda :** bouton « Connecter Google » dans l'app (jeton valide 1 h)
- **Mise à jour HACC :** bouton « Mettre à jour depuis HACC » → installer le favori, puis le cliquer sur le portail HACC

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.html` | Inventaire neuf (HACC) |
| `usage.html` / `usage.js` | Inventaire usagé (D2C) |
| `app.js` | Logique du board (stock, arrivages, ventes) |
| `shim.js` | Branche le board sur Firebase et les API Google |
| `firebase-config.js` | Configuration Firebase + liste des admins |
| `firestore.rules` | Règles de sécurité (à coller dans la console Firebase) |

## Ajouter un admin
1. Ajouter l'adresse dans `HACC_ADMINS` (`firebase-config.js`)
2. Ajouter la même adresse dans `isAdmin()` de `firestore.rules`, puis publier les règles dans Firebase.

