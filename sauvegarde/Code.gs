/**
 * Sauvegarde quotidienne des ventes — Board HACC (neuf), Inventaire usagé (D2C) et Ventes wholesale · Hyundai St-Constant
 *
 * Chaque jour vers 9 h (heure de Montréal), ce script lit TOUTES les ventes neuves, usagées et wholesale du board
 * (base Firestore du projet hacc-st-constant) et enregistre un fichier Excel daté
 * « Ventes neufs et usagés AAAA-MM-JJ.xlsx » dans le dossier Google Drive « Sauvegardes ventes (board) ».
 *
 * Installation (une seule fois) : choisir la fonction « installer » en haut, cliquer « Exécuter », puis autoriser.
 * Pour faire une copie tout de suite : choisir « sauvegarder » puis « Exécuter ».
 * Lecture seule : ce script ne modifie jamais le board ni ses données.
 */
const PROJET = 'hacc-st-constant';
const DOSSIER = 'Sauvegardes ventes (board)';
const FUSEAU = 'America/Toronto';

/** Crée le déclencheur quotidien (vers 9 h) puis fait une première sauvegarde. */
function installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sauvegarder') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sauvegarder').timeBased().everyDays(1).atHour(9).nearMinute(5).inTimezone(FUSEAU).create();
  const url = sauvegarder();
  Logger.log('Installé : sauvegarde chaque jour vers 9 h. Première copie : ' + url);
  return url;
}

/** Lit les ventes et enregistre le fichier Excel du jour dans Google Drive. Retourne le lien du fichier. */
function sauvegarder() {
  const maintenant = new Date();
  const jour = Utilities.formatDate(maintenant, FUSEAU, 'yyyy-MM-dd');
  const heure = Utilities.formatDate(maintenant, FUSEAU, 'yyyy-MM-dd HH:mm');

  const neufs = lireCollection_('suivi');
  const usages = lireCollection_('usage_suivi');
  const wholesale = lireCollection_('wholesale_suivi');
  const invN = lireDoc_('inventaire/actuel'), invU = lireDoc_('usage_inventaire/actuel'), stock = lireDoc_('config/stock');
  const LN = lignesNeufs_(neufs, json_(invN), (stock && stock.map) || {});
  const LU = lignesUsages_(usages, json_(invU));
  const LW = lignesWholesale_(wholesale);
  const brut = neufs.map(function (d) { return brut_('Neuf', d); }).concat(usages.map(function (d) { return brut_('Usagé', d); }), wholesale.map(function (d) { return brut_('Wholesale', d); }));

  const titre = 'Ventes neufs et usagés ' + jour;
  const ss = SpreadsheetApp.create(titre);
  try {
    ss.setSpreadsheetTimeZone(FUSEAU);
    const f1 = ss.getSheets()[0];
    f1.setName('Ventes neufs');
    ecrire_(f1, ENTETE_NEUFS, LN, NUM_NEUFS);
    ecrire_(ss.insertSheet('Ventes usagés'), ENTETE_USAGES, LU, NUM_USAGES);
    ecrire_(ss.insertSheet('Ventes wholesale'), ENTETE_WHOLESALE, LW, NUM_WHOLESALE);
    ecrire_(ss.insertSheet('Données complètes'), ENTETE_BRUT, brut, []);
    const info = ss.insertSheet('Info', 0);
    info.getRange(1, 1, 9, 2).setNumberFormat('@').setValues([
      ['Sauvegarde des ventes — Hyundai St-Constant', ''],
      ['Faite le', heure],
      ['Ventes neufs (onglet « Ventes neufs »)', String(LN.length)],
      ['Ventes usagés (onglet « Ventes usagés »)', String(LU.length)],
      ['Ventes wholesale (onglet « Ventes wholesale »)', String(LW.length)],
      ['Fiches complètes (onglet « Données complètes »)', String(brut.length)],
      ['Source', 'Board HACC, Inventaire usagé et Ventes wholesale (Firestore ' + PROJET + '), lecture seule'],
      ['Contenu', 'Toutes les ventes de tous les mois, y compris les annulées. « Données complètes » garde chaque fiche telle quelle pour pouvoir tout remettre.'],
      ['Prochaine copie', 'Demain vers 9 h']
    ]);
    info.getRange(1, 1).setFontWeight('bold').setFontSize(13);
    info.getRange(2, 1, 8, 1).setFontWeight('bold');
    info.setColumnWidth(1, 330); info.setColumnWidth(2, 620);
    SpreadsheetApp.flush();

    const xlsx = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    }).getBlob().setName(titre + '.xlsx');
    const fichier = dossier_().createFile(xlsx);
    Logger.log('Sauvegarde enregistrée : ' + fichier.getName() + ' — ' + fichier.getUrl() + ' (' + LN.length + ' neufs, ' + LU.length + ' usagés, ' + LW.length + ' wholesale)');
    return fichier.getUrl();
  } finally {
    DriveApp.getFileById(ss.getId()).setTrashed(true); // brouillon Google Sheets : seulement le fichier Excel est gardé
  }
}

// ---------- Colonnes ----------
const ENTETE_NEUFS = ['Mois', 'Vendu le', 'Statut', 'Représentant', 'F&I', 'Dir', 'Source', 'Nom du client', 'Modèle', 'Gamme', 'Couleur', 'Année', 'Stock', 'NIV', 'Date F&I', 'Livraison', 'Heure', 'RDR', 'Front', 'Front Marjo', 'Back', 'Front retenu', 'Total', 'Commentaire', 'Clé (board)', 'Modifié par', 'Modifié le'];
const NUM_NEUFS = [18, 19, 20, 21, 22]; // colonnes en dollars (index à partir de 0)
const ENTETE_USAGES = ['Mois', 'Vendu le', 'Statut', 'Représentant', 'F&I', 'Dir', 'Source', 'Client', 'Marque', 'Modèle', 'Année', 'Stock', 'Date F&I', 'Garantie', 'Financement', 'Livraison', 'Recon', 'Front', 'Front Marjo', 'Back', 'Front retenu', 'Total', 'Commentaire', 'Clé (board)', 'Modifié par', 'Modifié le'];
const NUM_USAGES = [16, 17, 18, 19, 20, 21];
const ENTETE_WHOLESALE = ['Mois', 'Date', 'Statut', 'Stock', 'Marque', 'Modèle', 'NIV (6 derniers)', 'Vendant', 'Coûtant', 'Profit', 'Acheteur', 'Livraison', 'Note', 'Clé (board)', 'Modifié par', 'Modifié le'];
const NUM_WHOLESALE = [7, 8, 9];
const STATUT_W = { vendu: 'Vendu', livre: 'Livré', paye: 'Payé', cancel: 'Annulé' };
const ENTETE_BRUT = ['Inventaire', 'Clé (board)', 'Vendu', 'Vendu le', 'Commentaire', 'Vente (toutes les infos)', 'Modifié par', 'Modifié le'];
const STATUT_N = { vendu: 'Vendu', commande: 'Commande', comptabilise: 'Comptabilisé', dealer: 'Dealer trade', cancel: 'Annulé' };
const STATUT_U = { vendu: 'Vendu', comptabilise: 'Comptabilisé', cancel: 'Annulé / refus' };

function lignesNeufs_(docs, inv, stockMap) {
  const parCle = {};
  (inv || []).forEach(function (r) { const vin = txt_(r[6]); parCle[vin ? vin : 'CMD' + txt_(r[7])] = { model: r[1], year: r[2], ver: r[3], ext: r[4], vin: vin }; });
  const L = docs.filter(function (d) { return d.vendu === true; }).map(function (d) {
    const x = d.vente || {}, v = parCle[d._id] || {}, st = txt_(x.statut) || 'vendu';
    const g = function (f, def) { return txt_(x[f]) !== '' ? txt_(x[f]) : txt_(def); };
    const fr = nombre_(x.front), fm = nombre_(x.frontM), bk = nombre_(x.back), retenu = fm !== '' ? fm : fr;
    const total = st === 'cancel' ? '' : (Number(retenu || 0) + Number(bk || 0));
    return [txt_(d.soldAt).slice(0, 7), txt_(d.soldAt).slice(0, 10), STATUT_N[st] || st, g('rep'), g('fi'), g('dir'), g('source'), g('client', d.comment),
      g('model', v.model), g('gamme', v.ver), g('couleur', couleur_(v.ext)), g('annee', v.year), g('stock', stockMap[v.vin] || ''), g('niv', v.vin ? v.vin.slice(-8) : ''),
      g('dateFi'), g('livraison'), g('heure'), x.rdrOk === true ? 'Oui' : '', fr, fm, bk, st === 'cancel' ? '' : retenu, total, txt_(d.comment), d._id, txt_(d.by), txt_(d.at)];
  });
  return trier_(L, 7);
}

function lignesUsages_(docs, inv) {
  const parCle = {};
  (inv || []).forEach(function (r) { parCle['S-' + norm_(r.stock)] = r; });
  const L = docs.filter(function (d) { return d.vendu === true; }).map(function (d) {
    const x = d.vente || {}, r = parCle[d._id] || {}, st = txt_(x.statut) || 'vendu';
    const g = function (f, def) { return txt_(x[f]) !== '' ? txt_(x[f]) : txt_(def); };
    const fr = nombre_(x.front), fm = nombre_(x.frontM), bk = nombre_(x.back), retenu = fm !== '' ? fm : fr;
    const total = st === 'cancel' ? '' : (Number(retenu || 0) + Number(bk || 0));
    return [txt_(d.soldAt).slice(0, 7), txt_(d.soldAt).slice(0, 10), STATUT_U[st] || st, g('rep'), g('fi'), g('dir'), g('source'), g('client', d.comment),
      g('marque', r.make), g('modele', r.model), g('annee', r.year), g('stock', r.stock), g('dateFi'), g('garantie'), g('financement'), g('livraison'),
      nombre_(x.recon), fr, fm, bk, st === 'cancel' ? '' : retenu, total, txt_(d.comment), d._id, txt_(d.by), txt_(d.at)];
  });
  return trier_(L, 7);
}

function lignesWholesale_(docs) {
  const L = docs.filter(function (d) { return d.vendu === true; }).map(function (d) {
    const x = d.vente || {}, st = txt_(x.statut) || 'vendu', vd = nombre_(x.vendant), ct = nombre_(x.coutant);
    const profit = st === 'cancel' ? '' : (Number(vd || 0) - Number(ct || 0));
    return [txt_(d.soldAt).slice(0, 7), txt_(d.soldAt).slice(0, 10), STATUT_W[st] || st, txt_(x.stock), txt_(x.marque), txt_(x.modele), txt_(x.niv), vd, ct, profit, txt_(x.acheteur), txt_(x.livraison), txt_(x.note), d._id, txt_(d.by), txt_(d.at)];
  });
  return trier_(L, 3);
}

function brut_(base, d) {
  return [base, d._id, d.vendu === true ? 'Oui' : 'Non', txt_(d.soldAt), txt_(d.comment), JSON.stringify(d.vente || {}), txt_(d.by), txt_(d.at)];
}

// Trie par date de vente, puis par client
function trier_(L, colClient) {
  return L.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])) || String(a[colClient]).localeCompare(String(b[colClient])); });
}

// ---------- Écriture d'un onglet ----------
function ecrire_(feuille, entete, lignes, colsArgent) {
  const n = lignes.length, w = entete.length;
  feuille.getRange(1, 1, 1, w).setValues([entete]).setFontWeight('bold').setBackground('#e3ecf6');
  if (n) {
    const plage = feuille.getRange(2, 1, n, w);
    plage.setNumberFormat('@'); // texte tel quel (no de stock, NIV, dates AAAA-MM-JJ)
    colsArgent.forEach(function (c) { feuille.getRange(2, c + 1, n, 1).setNumberFormat('#,##0.00 $'); });
    plage.setValues(lignes.map(function (r) { return r.map(function (v, i) { return colsArgent.indexOf(i) >= 0 ? (v === '' ? '' : Number(v)) : String(v == null ? '' : v); }); }));
  }
  feuille.setFrozenRows(1);
  feuille.getRange(1, 1, Math.max(1, n) + 1, w).createFilter();
  feuille.autoResizeColumns(1, w);
}

// ---------- Lecture Firestore (REST, lecture seule) ----------
function opts_() {
  return { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJET }, muteHttpExceptions: true };
}
function base_() { return 'https://firestore.googleapis.com/v1/projects/' + PROJET + '/databases/(default)/documents/'; }
function verif_(r, quoi) {
  const c = r.getResponseCode();
  if (c >= 300) throw new Error('Lecture du board impossible (' + c + ') pour « ' + quoi + ' » : ' + r.getContentText().slice(0, 400));
}
function lireCollection_(col) {
  const docs = []; let page = '';
  do {
    const r = UrlFetchApp.fetch(base_() + col + '?pageSize=300' + (page ? '&pageToken=' + encodeURIComponent(page) : ''), opts_());
    verif_(r, col);
    const j = JSON.parse(r.getContentText());
    (j.documents || []).forEach(function (d) { const o = champs_(d.fields); o._id = d.name.split('/').pop(); docs.push(o); });
    page = j.nextPageToken || '';
  } while (page);
  return docs;
}
function lireDoc_(chemin) {
  const r = UrlFetchApp.fetch(base_() + chemin, opts_());
  if (r.getResponseCode() === 404) return null;
  verif_(r, chemin);
  return champs_(JSON.parse(r.getContentText()).fields);
}
function valeur_(v) {
  if (!v) return '';
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return '';
  if ('mapValue' in v) return champs_(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valeur_);
  return '';
}
function champs_(f) { const o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = valeur_(f[k]); }); return o; }

// ---------- Petits outils ----------
function json_(doc) { try { return doc && doc.json ? JSON.parse(doc.json) : []; } catch (e) { return []; } }
function txt_(x) { return x == null ? '' : String(x).trim(); }
function nombre_(x) { const s = txt_(x).replace(/[\s$]/g, '').replace(',', '.'); if (!s) return ''; const n = Number(s); return isNaN(n) ? '' : n; }
function couleur_(s) { return txt_(s).replace(/^[A-Z0-9]{3}\s*[-:]\s*/, ''); }
function norm_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function dossier_() { const it = DriveApp.getFoldersByName(DOSSIER); return it.hasNext() ? it.next() : DriveApp.createFolder(DOSSIER); }
