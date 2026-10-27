// Section CSI · Hyundai St-Constant
// Source : BoostCX (hacc.boostcx.com), le programme CSI de Hyundai Canada.
// Le favori « ⟳ CSI BoostCX », cliqué sur BoostCX, lit les scores NPS (ventes, service, combiné), les questions clés,
// FRFT, Bluelink, les statistiques de sondages (Effective Records Rate) et les sondages des 12 derniers mois,
// puis les envoie à cette page (admin), qui les enregistre dans Firestore (config/csi + config/csi-s-AAAA-MM-type)
// pour toute l'équipe. Les données reçues sont toujours affichées échappées (esc).
(function () {
  'use strict';
  const H = window.HSC; if (!H) return;
  const { $, esc, nb, quand, todayTO } = H;
  const BOOSTCX = 'https://hacc.boostcx.com/bcx/dashboard/combined';
  const MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const f1 = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('fr-CA', { maximumFractionDigits: 1 });
  const pc = v => v == null || isNaN(v) ? '—' : f1(v) + ' %';
  const signe = v => (v >= 0 ? '+' : '−') + f1(Math.abs(v));
  const memo = (k, d) => { try { return localStorage.getItem('hsc-csi-' + k) || d; } catch (e) { return d; } };
  const garder = (k, v) => { try { localStorage.setItem('hsc-csi-' + k, v); } catch (e) {} };
  const U = { per: memo('per', 'MTD'), type: memo('type', 'ventes'), grp: 'conseiller', filtre: 'tous', q: '', lim: 100 };
  if (!['MTD', '3M', 'YTD', '12M'].includes(U.per)) U.per = 'MTD';
  if (!['ventes', 'service'].includes(U.type)) U.type = 'ventes';
  const S = { meta: null, sondages: [], charge: false, err: '', at: '' };

  // ---------- Lecture (toute l'équipe) ----------
  if (H.DB) H.DB.doc('config/csi').onSnapshot(async s => {
    const x = s.exists ? (s.data() || {}) : null;
    if (x && x.at !== S.at) {
      try { const docs = await Promise.all((x.docs || []).map(id => H.DB.doc('config/' + id).get())); S.sondages = docs.flatMap(d => (d.exists && (d.data() || {}).sondages) || []); S.err = ''; }
      catch (e) { S.err = 'Sondages illisibles : rechargez la page.'; }
      S.at = x.at;
    }
    if (!x) S.sondages = [];
    S.meta = x; S.charge = true;
    if (H.vue() === 'csi') peindre();
  }, () => { S.charge = true; S.err = 'Lecture du CSI impossible (accès refusé ?).'; if (H.vue() === 'csi') peindre(); });

  // ---------- Périodes : le mois courant d'abord (comme BoostCX), puis 3 et 12 mois ----------
  const refMois = () => (S.meta && /^\d{4}-\d{2}$/.test(S.meta.mois || '') ? S.meta.mois : todayTO().slice(0, 7));
  const nomMois = ym => { const [a, m] = ym.split('-'); const n = MOIS_L[+m - 1] || ''; return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + a; };
  const periodes = () => [['MTD', nomMois(refMois())], ['3M', '3 derniers mois'], ['YTD', refMois().slice(0, 4) + ' à date (YTD)'], ['12M', '12 derniers mois']];
  const nomPeriode = P => (periodes().find(p => p[0] === P) || [])[1] || '';
  const debutPeriode = P => { const [a, m] = refMois().split('-').map(Number); return new Date(Date.UTC(a, P === 'YTD' ? 0 : m - 1 - (P === '3M' ? 2 : P === '12M' ? 11 : 0), 1)).toISOString().slice(0, 10); };

  // ---------- Vue : un onglet Ventes et un onglet Service ----------
  const seg = (nom, liste, actif, etiquette) => `<div class="seg" role="group" aria-label="${etiquette || nom}">${liste.map(([v, l]) => `<button type="button" data-csi-${nom}="${v}" aria-pressed="${String(v) === String(actif)}">${esc(l)}</button>`).join('')}</div>`;
  const onglets = () => `<div class="tabs" role="tablist" aria-label="Ventes ou service">${[['ventes', 'Ventes'], ['service', 'Service']].map(([k, l]) => { const sc = S.meta && ((S.meta.scores || {})[U.per] || {})[k]; return `<button type="button" role="tab" id="csi-tab-${k}" aria-controls="csi-corps" aria-selected="${U.type === k}" data-csi-type="${k}">${l}${sc && sc.score != null ? `<span class="n">NPS ${f1(sc.score)}</span>` : ''}</button>`; }).join('')}</div>`;
  function vue() {
    return `<section class="hello"><h1>CSI</h1><p>Satisfaction de la clientèle · BoostCX (Hyundai Canada)</p></section>
    <div class="outils"><div id="csi-tabs">${onglets()}</div>
      <div class="actions"><div id="csi-per">${seg('per', periodes(), U.per, 'Période')}</div><a class="btn2" href="${BOOSTCX}" target="_blank" rel="noopener">Ouvrir BoostCX ↗</a>${H.estAdmin() ? '<button class="btn2 prim" type="button" id="csi-maj-btn">Mettre à jour depuis BoostCX</button>' : ''}</div></div>
    <p class="meta" id="csi-maj"></p>
    <div id="csi-corps" class="csi" role="tabpanel" aria-labelledby="csi-tab-${U.type}"><section class="pan"><p class="vide">Chargement du CSI…</p></section></div>`;
  }
  const alerteOuverte = a => !!a && !/^(-|closed|ferm)/i.test(a);
  const alerteTxt = a => ({ new: 'Nouvelle', 'in progress': 'En cours', overdue: 'En retard', escalated: 'Escaladée', closed: 'Fermée' })[String(a).toLowerCase()] || a;
  const noteCls = n => n == null ? '' : n >= 9 ? 'p' : n >= 7 ? 'n' : 'd';

  function carteScore(lab, sc) {
    if (!sc || sc.score == null) return `<div class="sc"><span class="k">${lab} · NPS</span><b class="big">—</b><span class="s">Pas de donnée pour cette période</span></div>`;
    const e = sc.ecart, ppd = sc.promoteurs != null ? `<div class="ppd" role="img" aria-label="Promoteurs ${f1(sc.promoteurs)} %, passifs ${f1(sc.passifs)} %, détracteurs ${f1(sc.detracteurs)} %"><i class="p" style="width:${+sc.promoteurs || 0}%"></i><i class="n" style="width:${+sc.passifs || 0}%"></i><i class="d" style="width:${+sc.detracteurs || 0}%"></i></div><div class="ppd-l"><span>${pc(sc.promoteurs)} promoteurs</span><span>${pc(sc.passifs)} passifs</span><span>${pc(sc.detracteurs)} détracteurs</span></div>` : '';
    return `<div class="sc sel"><span class="k">${lab} · NPS</span>
      <div class="sc-l"><b class="big">${f1(sc.score)}</b>${e != null ? `<span class="pill ${e >= 0 ? 'p-ok' : 'p-bad'}">${signe(e)} pts ${e >= 0 ? 'au-dessus de' : 'sous'} la cible</span>` : ''}</div>
      <div class="cmp"><span>District <b>${f1(sc.district)}</b></span><span>Zone <b>${f1(sc.zone)}</b></span><span>National <b>${f1(sc.national)}</b></span></div>
      <div class="cmp"><span>Rang district <b>${esc(sc.rangDistrict || '—')}</b></span><span>zone <b>${esc(sc.rangZone || '—')}</b></span><span>national <b>${esc(sc.rangNational || '—')}</b></span></div>
      <div class="cmp">${sc.sondages != null ? `<span><b>${nb(sc.sondages)}</b> sondages</span>` : ''}${sc.tauxReponse != null ? `<span>taux de réponse <b>${pc(sc.tauxReponse)}</b></span>` : ''}${sc.changement != null ? `<span>variation <b>${signe(sc.changement)}</b></span>` : ''}</div>${ppd}</div>`;
  }
  function carteTaux(lab, sous, x) {
    if (!x || x.dealer == null) return `<div class="sc"><span class="k">${lab}</span><b class="big">—</b><span class="s">${sous}</span></div>`;
    return `<div class="sc"><span class="k">${lab}</span><div class="sc-l"><b class="big">${pc(x.dealer)}</b>${x.ecart != null ? `<span class="pill ${x.ecart >= 0 ? 'p-ok' : 'p-bad'}">${signe(x.ecart)} pts vs cible</span>` : ''}</div>
      <div class="cmp"><span>District <b>${pc(x.district)}</b></span><span>Zone <b>${pc(x.zone)}</b></span><span>National <b>${pc(x.national)}</b></span></div><span class="s">${sous}</span></div>`;
  }
  const ligneStat = (l, mot) => (l || []).find(r => new RegExp(mot, 'i').test(r.desc));
  const tauxStat = r => r ? { dealer: r.dealer != null ? r.dealer * 100 : null, district: r.district != null ? r.district * 100 : null, zone: r.zone != null ? r.zone * 100 : null, national: r.national != null ? r.national * 100 : null } : null;

  function kpis(liste) {
    if (!liste || !liste.length) return '<p class="vide">Aucune question clé pour cette période.</p>';
    return `<div class="kpis-l">${liste.map(k => {
      const ok = k.cible == null || k.valeur == null || k.valeur >= k.cible;
      return `<div class="kr"><span class="nm">${esc(k.titre)}${k.n != null ? `<small>n = ${nb(k.n)}</small>` : ''}</span>
        <span class="kb" role="img" aria-label="${pc(k.valeur)}${k.cible != null ? ', cible ' + f1(k.cible) + ' %' : ''}"><i class="${ok ? '' : 'bas'}" style="width:${Math.max(0, Math.min(100, +k.valeur || 0))}%"></i>${k.cible != null ? `<u style="left:${Math.max(0, Math.min(100, k.cible))}%"></u>` : ''}</span>
        <span class="v ${ok ? 'ok' : 'bad'}">${pc(k.valeur)}</span><span class="c">${k.cible != null ? 'cible ' + f1(k.cible) : ''}${k.variation != null ? `<em class="${k.variation >= 0 ? 'ok' : 'bad'}">${signe(k.variation)}</em>` : ''}</span></div>`;
    }).join('')}</div><p class="hint">Part des clients satisfaits par question. Le trait marque la cible de Hyundai ; la variation compare à la période précédente.</p>`;
  }

  const GROUPES = { ventes: [['conseiller', 'Conseillers'], ['fi', 'F&I'], ['directeur', 'Directeurs']], service: [['conseiller', 'Aviseurs'], ['directeur', 'Techniciens']] };
  function personnes(liste, perNom) {
    const g = GROUPES[U.type].some(x => x[0] === U.grp) ? U.grp : 'conseiller', m = new Map();
    liste.forEach(s => { const nom = String(s[g] || '').trim(); if (!nom) return; const o = m.get(nom) || { nom, n: 0, nn: 0, p: 0, d: 0, a: 0 }; o.n++; if (s.nps != null) { o.nn++; if (s.nps >= 9) o.p++; else if (s.nps <= 6) o.d++; } if (alerteOuverte(s.alerte)) o.a++; m.set(nom, o); });
    const rows = [...m.values()].map(o => ({ ...o, nps: o.nn ? Math.round((o.p - o.d) / o.nn * 100) : null })).sort((a, b) => b.n - a.n || (b.nps ?? -999) - (a.nps ?? -999));
    const tete = `<div class="pan-h"><h2>Par ${U.type === 'service' ? 'aviseur' : 'conseiller'} <span class="meta">${esc(perNom)}</span></h2>${seg('grp', GROUPES[U.type], g, 'Regrouper par')}</div>`;
    if (!rows.length) return tete + '<p class="vide">Aucun sondage pour cette période.</p>';
    return tete + `<div class="tbl"><table class="t"><thead><tr><th>Nom</th><th class="num">Sondages</th><th class="num">NPS</th><th class="num">9-10</th><th class="num">7-8</th><th class="num">0-6</th><th class="num">Alertes</th></tr></thead><tbody>${rows.map(o => `<tr><td>${esc(o.nom)}</td><td class="num">${nb(o.n)}</td><td class="num"><b class="${o.nps == null ? '' : o.nps >= 70 ? 'ok' : o.nps >= 50 ? 'warn' : 'bad'}">${o.nps == null ? '—' : o.nps}</b></td><td class="num">${o.p}</td><td class="num">${o.nn - o.p - o.d}</td><td class="num">${o.d}</td><td class="num">${o.a ? `<span class="pill p-bad">${o.a}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">NPS = % de notes 9-10 moins % de notes 0-6, calculé sur les sondages complétés pendant la période.</p>`;
  }
  const FILTRES = [['tous', 'Tous'], ['alertes', 'Alertes ouvertes'], ['detracteurs', 'Notes 0-6'], ['commentaires', 'Avec commentaire'], ['frft', 'FRFT = Non']];
  const filtrer = (l, f) => f === 'alertes' ? l.filter(s => alerteOuverte(s.alerte)) : f === 'detracteurs' ? l.filter(s => s.nps != null && s.nps <= 6) : f === 'commentaires' ? l.filter(s => s.commentaire) : f === 'frft' ? l.filter(s => s.frftNon) : l;
  function sondages(liste, perNom) {
    const serv = U.type === 'service', fl = FILTRES.filter(f => f[0] !== 'frft' || serv);
    if (!fl.some(f => f[0] === U.filtre)) U.filtre = 'tous';
    const q = U.q.trim().toLowerCase();
    const l = filtrer(liste, U.filtre).filter(s => !q || [s.client, s.conseiller, s.fi, s.directeur, s.modele, s.annee, s.ro, s.commentaire, s.frftNon].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (alerteOuverte(b.alerte) - alerteOuverte(a.alerte)) || String(b.completeLe).localeCompare(String(a.completeLe)));
    const tete = `<div class="pan-h"><h2>Sondages <span class="meta">${nb(l.length)} sur ${nb(liste.length)} · ${esc(perNom)}</span></h2><input class="recherche" id="csi-q" type="search" placeholder="Client, conseiller, modèle, commentaire…" value="${esc(U.q)}" aria-label="Rechercher dans les sondages"></div>
      <div class="chips" role="group" aria-label="Filtres">${fl.map(([k, t]) => `<button type="button" class="chip" data-csi-filtre="${k}" aria-pressed="${U.filtre === k}">${t} · ${nb(filtrer(liste, k).length)}</button>`).join('')}</div>`;
    if (!l.length) return tete + '<p class="vide">Aucun sondage ne correspond.</p>';
    const vu = l.slice(0, U.lim);
    return tete + `<div class="tbl"><table class="t"><thead><tr><th>Complété</th><th>Client</th><th>${serv ? 'Aviseur' : 'Conseiller'}</th><th>${serv ? 'Technicien' : 'F&amp;I'}</th><th>${serv ? 'RO / véhicule' : 'Véhicule'}</th><th class="num">Note</th><th>Alerte</th><th>Commentaire</th></tr></thead><tbody>${vu.map(s => `<tr${alerteOuverte(s.alerte) ? ' class="alerte"' : ''}>
      <td class="mono">${esc(s.completeLe || '—')}</td><td>${esc(s.client || '—')}</td><td>${esc(s.conseiller || '—')}</td><td>${esc((serv ? s.directeur : s.fi) || '—')}</td>
      <td>${serv && s.ro ? `<span class="mono">RO ${esc(String(s.ro).replace(/^RO\s*/i, ''))}</span><small>${esc([s.annee, s.modele].filter(Boolean).join(' '))}</small>` : esc([s.annee, s.modele].filter(Boolean).join(' ') || '—')}</td>
      <td class="num">${s.nps == null ? '—' : `<span class="note ${noteCls(s.nps)}">${s.nps}</span>`}</td>
      <td>${s.alerte ? `<span class="pill ${alerteOuverte(s.alerte) ? 'p-bad' : 'p-z'}">${esc(alerteTxt(s.alerte))}</span>` : ''}</td>
      <td class="com">${esc(s.commentaire || '')}${s.frftNon ? `<small class="frft">FRFT = Non : ${esc(s.frftNon)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${l.length > vu.length ? `<p class="plus"><button class="btn2" type="button" id="csi-plus">Afficher ${nb(Math.min(100, l.length - vu.length))} de plus (${nb(l.length - vu.length)} restants)</button></p>` : ''}`;
  }

  function peindre() {
    const el = $('csi-corps'); if (!el) return;
    $('csi-tabs').innerHTML = onglets(); $('csi-per').innerHTML = seg('per', periodes(), U.per, 'Période');
    el.setAttribute('aria-labelledby', 'csi-tab-' + U.type);
    const maj = $('csi-maj');
    if (!S.charge) return;
    if (!S.meta) {
      if (maj) maj.textContent = '';
      el.innerHTML = `<section class="pan prep"><span class="ic">${(document.querySelector('.nav-i[data-route="csi"] svg') || {}).outerHTML || ''}</span><h2>Pas encore de données CSI</h2>
        <p>${S.err ? esc(S.err) : H.estAdmin() ? 'Installez le favori « ⟳ CSI BoostCX » (bouton « Mettre à jour depuis BoostCX »), puis cliquez-le sur BoostCX : les scores et les sondages des 12 derniers mois arriveront ici pour toute l\'équipe.' : 'L\'administratrice n\'a pas encore importé les résultats de BoostCX.'}</p>
        ${H.estAdmin() ? '<button class="btn" type="button" data-csi-dlg>Mettre à jour depuis BoostCX</button>' : ''}</section>`;
      return;
    }
    const m = S.meta, P = U.per, T = U.type, sc = (m.scores || {})[P] || {}, tx = (m.taux || {})[P] || {}, st = (m.stats || {})[P] || {}, kp = (m.kpis || {})[P] || {};
    if (maj) maj.textContent = 'Données BoostCX du ' + quand(m.at) + (m.vue ? ' · ' + m.vue : '');
    const perNom = nomPeriode(P), debut = debutPeriode(P);
    const er = tauxStat(ligneStat(st[T], '^effective records'));
    const dans = S.sondages.filter(s => s.type === T && String(s.completeLe || s.dateRdr || '') >= debut);
    const cartes = T === 'ventes'
      ? carteScore('Ventes', sc.ventes) + carteTaux('Effective Records Rate', 'Dossiers de vente valides pour le sondage', er) + carteTaux('Bluelink', 'Taux d\'inscription Bluelink', tx.bluelink)
      : carteScore('Service', sc.service) + carteTaux('FRFT · Fixed Right First Time', 'Réparé correctement du premier coup', tx.frft) + carteTaux('Effective Records Rate', 'Dossiers de service valides pour le sondage', er);
    const c = sc.combine, comb = c && c.score != null ? `<p class="hint">NPS combiné (ventes + service) : <b>${f1(c.score)}</b>${c.ecart != null ? ' · ' + signe(c.ecart) + ' pts ' + (c.ecart >= 0 ? 'au-dessus de' : 'sous') + ' la cible' : ''}</p>` : '';
    el.innerHTML = `${S.err ? `<p class="err">${esc(S.err)}</p>` : ''}
      <section class="pan"><div class="pan-h"><h2>${T === 'ventes' ? 'Ventes' : 'Service'} <span class="meta">${esc(perNom)}</span></h2></div><div class="scores">${cartes}</div>${comb}</section>
      <section class="pan"><div class="pan-h"><h2>Questions clés <span class="meta">${esc(perNom)}</span></h2></div>${kpis(kp[T])}</section>
      <section class="pan">${personnes(dans, perNom)}</section>
      <section class="pan">${sondages(dans, perNom)}</section>`;
  }

  // ---------- Commandes ----------
  document.addEventListener('click', e => {
    if (H.vue() !== 'csi') return;
    const b = e.target.closest('[data-csi-per],[data-csi-type],[data-csi-grp],[data-csi-filtre],#csi-plus,#csi-maj-btn,[data-csi-dlg]'); if (!b) return;
    if (b.id === 'csi-maj-btn' || b.hasAttribute('data-csi-dlg')) { ouvrirDialogue(); return; }
    if (b.id === 'csi-plus') { U.lim += 100; peindre(); return; }
    if (b.dataset.csiPer) { U.per = b.dataset.csiPer; garder('per', U.per); U.lim = 100; }
    if (b.dataset.csiType) { U.type = b.dataset.csiType; garder('type', U.type); U.grp = 'conseiller'; U.filtre = 'tous'; U.lim = 100; }
    if (b.dataset.csiGrp) U.grp = b.dataset.csiGrp;
    if (b.dataset.csiFiltre) { U.filtre = b.dataset.csiFiltre; U.lim = 100; }
    peindre();
    if (b.dataset.csiType) { const t = $('csi-tab-' + U.type); if (t) t.focus(); }
  });
  document.addEventListener('keydown', e => {
    if (H.vue() !== 'csi' || !e.target.matches || !e.target.matches('[role=tab][data-csi-type]') || !/^Arrow(Left|Right)$/.test(e.key)) return;
    e.preventDefault(); U.type = U.type === 'ventes' ? 'service' : 'ventes'; garder('type', U.type); U.grp = 'conseiller'; U.filtre = 'tous'; U.lim = 100; peindre(); const t = $('csi-tab-' + U.type); if (t) t.focus();
  });
  let tq = null;
  document.addEventListener('input', e => {
    if (e.target.id !== 'csi-q') return;
    U.q = e.target.value; U.lim = 100; clearTimeout(tq);
    tq = setTimeout(() => { const pos = e.target.selectionStart; peindre(); const i = $('csi-q'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} } }, 250);
  });

  // ---------- Favori BoostCX (admin) ----------
  function ouvrirDialogue() {
    const d = $('csidlg'); if (!d) return;
    const app = location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html';
    $('bm-csi').href = 'javascript:' + encodeURIComponent('(' + signetCsi.toString() + ')(' + JSON.stringify(app) + ')');
    d.showModal();
  }
  const fermer = $('csidlg-close'); if (fermer) fermer.onclick = () => $('csidlg').close();

  // Ce code est copié tel quel dans le favori : il tourne sur BoostCX, sans rien d'autre de ce fichier.
  function signetCsi(APP) {
    if (!/(^|\.)boostcx\.com$/i.test(location.hostname)) { alert('Ouvrez d\'abord BoostCX (hacc.boostcx.com), connecté(e), puis cliquez ce favori.'); return; }
    if (window.__hscCsi) { alert('La lecture du CSI est déjà en cours dans cette page.'); return; }
    window.__hscCsi = true;
    var w = window.open(APP + '#/csi', 'hacc_board'), AO = new URL(APP).origin;
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:380px;padding:12px 16px;border-radius:10px;background:#0a3a6b;color:#fff;font:600 13px/1.45 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    document.body.appendChild(box);
    function dire(t) { box.textContent = 'CSI → Hyundai St-Constant : ' + t; }
    function fin(t, ok) { dire(t); box.style.background = ok ? '#1f7a4d' : '#b3261e'; window.__hscCsi = false; setTimeout(function () { box.remove(); }, ok ? 12000 : 30000); }
    if (!w) { fin('fenêtre bloquée : autorisez les fenêtres surgissantes pour BoostCX, puis recliquez le favori.', false); return; }
    function num(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
    function txt(v) { return String(v === null || v === undefined ? '' : v).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\.text-info\s*\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim(); }
    function jour(v) { var s = txt(v), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0]; m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); return ''; }
    var choix = document.querySelector('select[name="Filter_PeriodEnd"]');
    var FIN = choix && choix.options.length ? choix.options[0].value : (function () { var d = new Date(); return ('0' + (d.getMonth() + 1)).slice(-2) + '/01/' + d.getFullYear() + ' 00:00:00'; })();
    var JETON = (document.querySelector('input[name="__RequestVerificationToken"]') || {}).value || '';
    var VUE = (((document.body.innerText || '').match(/View:\s*([^\n]+)/) || [])[1] || '').trim();
    var PER = [['MTD', '2'], ['3M', '10'], ['YTD', '4'], ['12M', '11']];
    async function lire(fn, widget, tableau, sorte, code) {
      var r = await fetch('/bcx/Dashboard/' + fn + '?widget=' + widget + '&dashboardType=' + tableau + '&globalFilters=' + code + '&globalFilters=' + encodeURIComponent(FIN) + '&globalFilters=' + sorte + '&globalFilters=-1', { credentials: 'include', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
      if (r.status === 401 || r.status === 403) throw new Error('session BoostCX expirée : reconnectez-vous, puis recliquez le favori');
      if (!r.ok) throw new Error('BoostCX a répondu ' + r.status + ' (' + widget + ')');
      var t = await r.text();
      if (/^\s*</.test(t)) throw new Error('BoostCX a renvoyé une page au lieu des données : reconnectez-vous, puis recliquez le favori');
      return ((t ? JSON.parse(t) : {}) || {}).model || {};
    }
    function ecart(v, sens) { var n = num(v); return n !== null && sens === 'negative' ? -Math.abs(n) : n; }
    function stat(l, nom) { var s = (l || []).filter(function (x) { return x && x.name === nom; })[0]; if (!s) return null; var v = s.numericValue !== null && s.numericValue !== undefined ? s.numericValue : s.value; if (typeof v === 'string' && /\//.test(v)) return txt(v); var n = num(v); if (n !== null && /P/.test(String(s.format || ''))) n = Math.round(n * 1000) / 10; return n; }
    function seuil(l, mot) { var s = (l || []).filter(function (x) { return x && new RegExp(mot, 'i').test(x.tooltip || ''); })[0]; return s ? num(s.value) : null; }
    async function score(widget, code) {
      var m = await lire('GetScoreWidget', widget, 'Combined', 1, code), sc = {};
      (m.scores || []).forEach(function (s) { sc[String(s.title || '').toLowerCase()] = num(s.value); });
      return { score: num(m.topScore), ecart: ecart(m.target, m.targetIndicator), district: sc.district === undefined ? null : sc.district, zone: sc.zone === undefined ? null : sc.zone, national: sc.national === undefined ? null : sc.national,
        rangDistrict: stat(m.stats, 'District Rank'), rangZone: stat(m.stats, 'Zone Rank'), rangNational: stat(m.stats, 'National Rank'), changement: stat(m.stats, 'Change'), sondages: stat(m.stats, 'Surveys'), tauxReponse: stat(m.stats, 'R.R.%'),
        promoteurs: seuil(m.thresholds, 'promoter'), passifs: seuil(m.thresholds, 'passive'), detracteurs: seuil(m.thresholds, 'detractor') };
    }
    async function questions(widget, tableau, sorte, code) {
      var m = await lire('GetKPIChartWidget', widget, tableau, sorte, code);
      return (m.charts || []).map(function (c) {
        var el = c.chartElement || {}, ds = el.dataset || (el.chartAttributes && el.chartAttributes.dataset) || [], cible = null, val = null, n = null;
        ds.forEach(function (d) { var p = (d && d.data && d.data[0]) || {}; if (/target|cible/i.test(d.seriesname || '')) cible = num(p.value); else { val = num(p.value); var mn = /n\s*=\s*(\d+)/i.exec(p.displayValue || ''); if (mn) n = +mn[1]; } });
        var t = txt(c.title), mc = /\((\d+(?:\.\d+)?)\)\s*$/.exec(t);
        return { titre: t.replace(/\s*\(\d+(?:\.\d+)?\)\s*$/, ''), cible: cible !== null ? cible : (mc ? +mc[1] : null), valeur: val, n: n, variation: ecart(c.target, c.targetIndicator) };
      });
    }
    async function taux(widget, tableau, sorte, code) {
      var m = await lire('GetEnrollmentRateChartWidget', widget, tableau, sorte, code), o = { dealer: num(m.topScore), ecart: ecart(m.target, m.targetIndicator), district: null, zone: null, national: null };
      ((m.chart && m.chart.dataset) || []).forEach(function (d) { var k = String((d && d.seriesname) || '').toLowerCase(); if (k === 'district' || k === 'zone' || k === 'national') o[k] = num(d.data && d.data[0] && d.data[0].value); });
      return o;
    }
    async function stats(widget, tableau, sorte, code) {
      var m = await lire('GetTableWidget', widget, tableau, sorte, code);
      return (m.data || []).map(function (r) { return { desc: txt(r.description), dealer: num(r.dealer), district: num(r.district), zone: num(r.zone), national: num(r.national) }; }).filter(function (r) { return r.desc; });
    }
    async function sondages(code, type) {
      var lignes = [], cols = null, page = 0, total = 0;
      for (;;) {
        var p = new URLSearchParams();
        ['PeriodType', 'PeriodEnd', 'SurveyType', 'OwnershipPeriod'].forEach(function (n) { p.append('filterNames', n); });
        p.append('Filter_OwnershipPeriod', '-1'); p.append('Filter_PeriodEnd', FIN); p.append('Filter_PeriodType', '11'); p.append('Filter_SurveyType', code);
        p.append('SegmentFilter_SegmentJson', ''); p.append('ViewName', 'Surveys_SurveyList'); p.append('__RequestVerificationToken', JETON);
        p.append('draw', String(page + 1)); p.append('@pageIndex', String(page)); p.append('@pageSize', '500');
        var r = await fetch('/bcx/Reports/UpdateColumnBasedDataSource', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, body: p.toString() });
        if (!r.ok) throw new Error('liste des sondages : BoostCX a répondu ' + r.status);
        var j = JSON.parse(await r.text()) || {}, g = j.complexHeaderGrid || {}, d = g.data || {}, rows = d.data || [];
        if (!cols) { cols = []; var re = /data-sort="([^"]*)"/g, mm; while ((mm = re.exec(g.header || ''))) cols.push(mm[1]); }
        total = num(d.recordsTotal) || 0; lignes = lignes.concat(rows); page++;
        dire('sondages ' + type + ' : ' + lignes.length + ' / ' + total + '…');
        if (!rows.length || lignes.length >= total || page >= 20) break;
      }
      var ix = {}; cols.forEach(function (c, i) { ix[c] = i; });
      var com = cols.filter(function (c) { return /^Customer Comments/i.test(c); });
      function col(r, noms) { for (var i = 0; i < noms.length; i++) { var k = ix[noms[i]]; if (k !== undefined) { var v = txt(r[k]); return v === '-' ? '' : v; } } return ''; }
      return lignes.map(function (r) {
        return { type: type, id: col(r, ['Survey ID']), client: (col(r, ['Customer First Name']) + ' ' + col(r, ['Customer Last Name'])).trim(), nps: num(col(r, ['NPS'])), completeLe: jour(col(r, ['Completed Date'])),
          conseiller: col(r, ['Sales Consultant Name', 'Service Advisor Name']), directeur: col(r, ['Sales Manager Name', 'Service Technician Name']), fi: col(r, ['FI Manager Name', 'F&I Manager Name']),
          modele: col(r, ['Model Name']), annee: col(r, ['Model Year']), dateRdr: jour(col(r, ['RDR Date', 'RO Date'])), ro: col(r, ['RO Number']), montant: num(col(r, ['RO Amount ($)'])), alerte: col(r, ['Alert Status']),
          commentaire: com.map(function (c) { var v = txt(r[ix[c]]); return v && v !== '-' ? v : ''; }).filter(Boolean).join(' / ').slice(0, 1500),
          frftNon: col(r, ['Dealer Comments: Primary Concern (FRFT = No)']).slice(0, 600) };
      }).filter(function (s) { return s.id; });
    }
    (async function () {
      try {
        var mFin = /^(\d{2})\/\d{2}\/(\d{4})/.exec(FIN);
        var out = { type: 'hsc-csi-seed', id: String(Date.now()), vue: VUE, mois: mFin ? mFin[2] + '-' + mFin[1] : '', scores: {}, kpis: {}, taux: {}, stats: {}, sondages: [] };
        var manque = [];
        for (var i = 0; i < PER.length; i++) {
          var P = PER[i][0], c = PER[i][1];
          dire('scores et questions clés · ' + ({ MTD: 'mois en cours', '3M': '3 mois', YTD: 'année à date', '12M': '12 mois' })[P] + '…');
          try {
            var v = await Promise.all([score('SalesNPS', c), score('ServiceNPS', c), score('CombinedNPS', c), questions('SalesKPI', 'Sales', 1, c), questions('ServiceKPI', 'Service', 2, c),
              taux('FRFTRateService', 'Service', 2, c), taux('BlueLinkEnrollmentRateSales', 'Sales', 1, c), stats('SurveyStatisticsSales', 'Sales', 1, c), stats('SurveyStatisticsService', 'Service', 2, c)]);
            out.scores[P] = { ventes: v[0], service: v[1], combine: v[2] }; out.kpis[P] = { ventes: v[3], service: v[4] };
            out.taux[P] = { frft: v[5], bluelink: v[6] }; out.stats[P] = { ventes: v[7], service: v[8] };
          } catch (e) { if (P === 'MTD') throw e; manque.push(P); }
        }
        out.sondages = (await sondages('1', 'ventes')).concat(await sondages('2', 'service'));
        dire('envoi au site (' + out.sondages.length + ' sondages)… gardez cette page ouverte.');
        var n = 0, iv = setInterval(function () {
          if (w.closed) { clearInterval(iv); fin('la fenêtre du site a été fermée : recliquez le favori.', false); return; }
          if (n++ > 180) { clearInterval(iv); fin('le site n\'a pas répondu : connectez-vous au site, puis recliquez le favori.', false); return; }
          try { w.postMessage(out, AO); } catch (e) {}
        }, 1000);
        window.addEventListener('message', function (e) {
          if (e.origin !== AO || !e.data || e.data.type !== 'hsc-csi-ack' || e.data.id !== out.id) return;
          clearInterval(iv); fin((e.data.ok ? '✓ ' : '✗ ') + e.data.msg + (manque.length ? ' (période non lue sur BoostCX : ' + manque.join(', ') + ')' : ''), !!e.data.ok);
        });
      } catch (err) { fin('arrêt : ' + (err && err.message || err), false); }
    })();
  }

  // ---------- Réception des données du favori (admin seulement) ----------
  const vus = new Set();
  const t = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const nOuNul = v => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; };
  const jourOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '';
  const propre = o => JSON.parse(JSON.stringify(o ?? null));
  window.addEventListener('message', async e => {
    if (!/^https:\/\/([a-z0-9-]+\.)*boostcx\.com$/i.test(e.origin)) return;
    const d = e.data; if (!d || d.type !== 'hsc-csi-seed' || !d.id || vus.has(d.id)) return;
    vus.add(d.id);
    const repondre = (ok, msg) => { try { e.source && e.source.postMessage({ type: 'hsc-csi-ack', id: d.id, ok, msg }, e.origin); } catch (x) {} };
    if (!H.estAdmin()) { repondre(false, 'Seule une administratrice peut mettre à jour le CSI.'); return; }
    try { repondre(true, await importer(d)); } catch (err) { repondre(false, 'Non enregistré : ' + ((err && err.message) || err)); }
  });
  async function importer(d) {
    const at = new Date().toISOString();
    const liste = (Array.isArray(d.sondages) ? d.sondages : []).map(s => ({
      type: s.type === 'service' ? 'service' : 'ventes', id: t(s.id, 64), client: t(s.client, 80), nps: nOuNul(s.nps), completeLe: jourOk(s.completeLe),
      conseiller: t(s.conseiller, 60), directeur: t(s.directeur, 60), fi: t(s.fi, 60), modele: t(s.modele, 40), annee: t(s.annee, 6), dateRdr: jourOk(s.dateRdr),
      ro: t(s.ro, 20), montant: nOuNul(s.montant), alerte: t(s.alerte, 30), commentaire: t(s.commentaire, 1500), frftNon: t(s.frftNon, 600)
    })).filter(s => s.id);
    const scores = propre(d.scores) || {};
    if (!liste.length && !Object.keys(scores).length) throw new Error('rien reçu de BoostCX : ouvrez le tableau de bord « Combined Performance », puis recliquez le favori.');
    const groupes = {};
    liste.forEach(s => { const k = 'csi-s-' + ((s.completeLe || s.dateRdr).slice(0, 7) || 'sans-date') + '-' + s.type; (groupes[k] = groupes[k] || []).push(s); });
    const docs = [];
    for (const [k, l] of Object.entries(groupes)) {
      let part = [], taille = 0, i = 1;
      const ecrire = async () => { const id = i === 1 ? k : k + '-' + i; await H.DB.doc('config/' + id).set({ at, sondages: part }); docs.push(id); i++; part = []; taille = 0; };
      for (const s of l) { const n = JSON.stringify(s).length; if (part.length && taille + n > 700000) await ecrire(); part.push(s); taille += n; }
      if (part.length) await ecrire();
    }
    const nV = liste.filter(s => s.type === 'ventes').length, nS = liste.length - nV;
    await H.DB.doc('config/csi').set({ at, by: H.courriel, source: 'BoostCX', vue: t(d.vue, 80), mois: t(d.mois, 7), scores, kpis: propre(d.kpis) || {}, taux: propre(d.taux) || {}, stats: propre(d.stats) || {}, docs: docs.sort(), nVentes: nV, nService: nS });
    const m = scores.MTD || {};
    return `CSI mis à jour : NPS ventes ${f1(m.ventes && m.ventes.score)}, service ${f1(m.service && m.service.score)} (mois en cours) · ${nb(nV)} sondages ventes et ${nb(nS)} service sur 12 mois.`;
  }

  // #/csi/ventes et #/csi/service ouvrent directement le bon onglet (tuiles de l'accueil)
  const ongletDuLien = () => { const m = /^#\/csi\/(ventes|service)\b/.exec(location.hash); if (m && m[1] !== U.type) { U.type = m[1]; garder('type', U.type); U.grp = 'conseiller'; U.filtre = 'tous'; U.lim = 100; } };
  H.section('csi', { sous: 'Satisfaction client · BoostCX', vue: () => { ongletDuLien(); return vue(); }, apres: peindre });
})();
