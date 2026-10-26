// Configuration Firebase du projet (Console Firebase → Paramètres du projet → Vos applications → Web).
// Ces valeurs ne sont pas secrètes : la sécurité vient des règles Firestore (firestore.rules).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqIWGlkXAl9urnhZgv7zahT7AFCiQW1as",
  authDomain: "hacc-st-constant.firebaseapp.com",
  projectId: "hacc-st-constant",
  storageBucket: "hacc-st-constant.firebasestorage.app",
  messagingSenderId: "290378205580",
  appId: "1:290378205580:web:8d8a4d83200420c0f3eea9"
};

// Qui peut entrer : toute adresse de ce domaine + les adresses ajoutées dans la collection « membres ».
window.HACC_DOMAIN = "hyundaistconstant.com";
// Administrateurs : mettre à jour l'inventaire HACC, importer des fichiers, gérer les membres.
// (Doit correspondre à la liste dans firestore.rules.)
window.HACC_ADMINS = ["melanie@hyundaistconstant.com"];
