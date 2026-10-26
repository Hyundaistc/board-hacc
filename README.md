# Board HACC · Hyundai St-Constant

Inventaire (en stock, arrivages, commandes) et board de ventes neuf, partagé avec l'équipe.

- **Hébergement :** GitHub Pages (fichiers statiques, aucune donnée dans ce dépôt)
- **Données :** Firebase Firestore (projet `hacc-st-constant`, région Montréal), accès protégé par `firestore.rules`
- **Connexion :** comptes Google @hyundaistconstant.com (+ adresses ajoutées dans la collection `membres`)
- **Google Drive / Sheets / Agenda :** bouton « Connecter Google » dans l'app (jeton valide 1 h)
- **Mise à jour HACC :** bouton « Mettre à jour depuis HACC » → installer le favori, puis le cliquer sur le portail HACC

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.html` | Page, styles, écran de connexion |
| `app.js` | Logique du board (stock, arrivages, ventes) |
| `shim.js` | Branche le board sur Firebase et les API Google |
| `firebase-config.js` | Configuration Firebase + liste des admins |
| `firestore.rules` | Règles de sécurité (à coller dans la console Firebase) |

## Ajouter un admin
1. Ajouter l'adresse dans `HACC_ADMINS` (`firebase-config.js`)
2. Ajouter la même adresse dans `isAdmin()` de `firestore.rules`, puis publier les règles dans Firebase.

## Donner accès à une adresse hors domaine
Firestore → collection `membres` → document dont l'ID est l'adresse courriel (en minuscules).
