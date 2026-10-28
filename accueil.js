// Page d'entrée · Hyundai St-Constant
// Accueil personnalisé, chiffres clés du jour (lus dans la même base que les inventaires) et accès aux sections.
// Ajouter une section : un lien dans le menu de gauche (index.html, data-route="…") + une entrée dans SECTIONS ci-dessous.
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TZ = 'America/Toronto';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const todayTO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const num = x => { const n = parseFloat(String(x ?? '').replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const nb = n => Number(n).toLocaleString('fr-CA');
  const pluriel = (n, un, plusieurs) => nb(n) + ' ' + (n > 1 ? plusieurs : un);
  const quand = at => { const d = new Date(at); if (!at || isNaN(d)) return ''; return d.toLocaleDateString('fr-CA', { timeZone: TZ, day: 'numeric', month: 'short' }) + ' à ' + d.toLocaleTimeString('fr-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }); };

  const DB = await window.claude?.use?.('db');
  const USER = await window.claude?.use?.('user');

  // ---------- Personne connectée ----------
  const courriel = USER ? String(await USER.id().catch(() => '') || '') : '';
  const nomComplet = USER && USER.name ? String(USER.name() || '') : '';
  const aUnNom = !!nomComplet && !nomComplet.includes('@');
  const prenom = (() => { const b = aUnNom ? nomComplet.trim().split(/\s+/)[0] : (courriel.split('@')[0] || '').split(/[._-]/)[0]; return b ? b.charAt(0).toUpperCase() + b.slice(1) : ''; })();
  const initiales = (aUnNom ? nomComplet.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') : prenom.slice(0, 2)).toUpperCase();
  let role = USER && USER.canEdit() ? 'Admin' : '';
  if (!role && DB && courriel) { try { const m = await DB.doc('membres/' + courriel.toLowerCase()).get(); role = m.exists ? ((m.data() || {}).role === 'lecture' ? 'Lecture seule' : 'Équipe') : ''; } catch (e) {} }
  $('me-av').textContent = initiales || 'HS';
  $('me-name').textContent = aUnNom ? nomComplet : (prenom || courriel);

  // ---------- Sections (menu de gauche et accès rapide) ----------
  const icone = sel => { const s = document.querySelector(sel); return s ? s.outerHTML : ''; };
  const SECTIONS = [
    { id: 'csi', titre: 'CSI', svg: icone('.nav-i[data-route="csi"] svg'), aVenir: true },
    { id: 'comeback', titre: 'Comeback', svg: icone('.nav-i[data-route="comeback"] svg'), aVenir: true },
    { href: 'neuf.html#stock', titre: 'Inventaire neuf', sous: 'Stock, arrivages et ventes', svg: icone('#tog-inv svg') },
    { href: 'usage.html', titre: 'Inventaire usagé', sous: 'Occasions D2C et ventes', svg: icone('#tog-inv svg') },
    { href: 'wholesale.html', titre: 'Ventes wholesale', sous: 'Autos vendues aux marchands · profit du mois', svg: icone('#tog-inv svg') },
    { id: 'evaluation', titre: 'Évaluation', svg: icone('.nav-i[data-route="evaluation"] svg'), aVenir: true }
  ];

  // ---------- Données : mêmes sources et mêmes règles que les inventaires ----------
  const D = { inv: null, invDate: '', invAt: '', suivi: null, cfgN: null, uinv: null, uinvAt: '', usuivi: null, cfgU: null, wsuivi: null, cfgW: null, csi: undefined, err: false };
  const lireInv = s => { const x = s && s.exists ? (s.data() || {}) : {}; let rows = null; try { rows = JSON.parse(x.json || 'null'); } catch (e) {} return { rows: Array.isArray(rows) ? rows : [], date: x.date || '', at: x.at || '' }; };
  const lireCol = s => { const m = {}; s.docs.forEach(d => { m[d.id] = d.data() || {}; }); return m; };
  const surErreur = () => { D.err = true; peindre(); };
  if (DB) {
    DB.doc('inventaire/actuel').onSnapshot(s => { const r = lireInv(s); D.inv = r.rows; D.invDate = r.date; D.invAt = r.at; peindre(); }, surErreur);
    DB.collection('suivi').onSnapshot(s => { D.suivi = lireCol(s); peindre(); }, surErreur);
    DB.doc('config/ventes').onSnapshot(s => { D.cfgN = s.exists ? (s.data() || {}) : {}; peindre(); }, surErreur);
    DB.doc('usage_inventaire/actuel').onSnapshot(s => { const r = lireInv(s); D.uinv = r.rows; D.uinvAt = r.at; peindre(); }, surErreur);
    DB.collection('usage_suivi').onSnapshot(s => { D.usuivi = lireCol(s); peindre(); }, surErreur);
    DB.doc('usage_config/ventes').onSnapshot(s => { D.cfgU = s.exists ? (s.data() || {}) : {}; peindre(); }, surErreur);
    // Ventes wholesale (wholesale.js) : profit du mois = vendant − coûtant, annulées exclues
    DB.collection('wholesale_suivi').onSnapshot(s => { D.wsuivi = lireCol(s); peindre(); }, () => { D.wsuivi = {}; peindre(); });
    DB.doc('wholesale_config/ventes').onSnapshot(s => { D.cfgW = s.exists ? (s.data() || {}) : {}; peindre(); }, () => { D.cfgW = {}; peindre(); });
    DB.doc('config/csi').onSnapshot(s => { D.csi = s.exists ? (s.data() || {}) : null; peindre(); }, () => { D.csi = null; peindre(); });
  }

  function chiffres() {
    const c = {}, mois = todayTO().slice(0, 7);
    const active = n => ((n.vente && n.vente.statut) || 'vendu') !== 'cancel';
    if (D.inv && D.suivi) {
      // Inventaire neuf (app.js) : en stock = groupe D ; vendu = case Vendu cochée
      const cle = r => r[6] ? r[6] : 'CMD' + r[7];
      const vendu = r => !!(D.suivi[cle(r)] && D.suivi[cle(r)].vendu);
      const stock = D.inv.filter(r => r[0] === 'D');
      c.nDispo = stock.filter(r => !vendu(r)).length; c.nRetires = stock.length - c.nDispo;
      const snap = D.invDate || todayTO();
      c.nVentes = Object.values(D.suivi).filter(n => n && n.vendu && (n.soldAt || snap).slice(0, 7) === mois && active(n)).length;
    }
    if (D.uinv && D.usuivi) {
      // Inventaire usagé (usage.js)
      const cle = r => 'S-' + normName(r.stock);
      const dispo = D.uinv.filter(r => !(D.usuivi[cle(r)] && D.usuivi[cle(r)].vendu));
      c.uDispo = dispo.length; c.uLigne = dispo.filter(r => r.live).length; c.u60 = dispo.filter(r => +r.days > 60).length;
      c.uVentes = Object.values(D.usuivi).filter(n => n && n.vendu && (n.soldAt || '').slice(0, 7) === mois && active(n)).length;
    }
    if (D.wsuivi) {
      const w = Object.values(D.wsuivi).filter(n => n && n.vendu && (n.soldAt || '').slice(0, 7) === mois && active(n));
      c.wVentes = w.length; c.wProfit = Math.round(w.reduce((a, n) => a + (num((n.vente || {}).vendant) - num((n.vente || {}).coutant)), 0));
    }
    if (D.cfgN) c.objN = num(D.cfgN.objectif ?? 66);
    if (D.cfgU) c.objU = num(D.cfgU.objectif ?? 50);
    if (D.cfgW) c.objW = num(D.cfgW.objectif ?? 40000);
    return c;
  }

  // ---------- Vues ----------
  const tuile = (href, k, val, sous, barre = '') => `<a class="stat" href="${href}"><span class="k">${k}</span><b>${val}</b><span class="s">${sous}</span>${barre}</a>`;
  // CSI (BoostCX) : NPS du mois à date, ventes et service
  const f1 = v => Number(v).toLocaleString('fr-CA', { maximumFractionDigits: 1 });
  function tuileCsi(t, moisNom) {
    const m = D.csi, sc = m && m.scores && m.scores.MTD && m.scores.MTD[t], mo = m && /^\d{4}-\d{2}$/.test(m.mois || '') ? MOIS[+m.mois.slice(5) - 1] : moisNom;
    const k = 'CSI ' + (t === 'ventes' ? 'ventes' : 'service') + ' · ' + mo;
    if (!sc || sc.score == null) return tuile('#/csi/' + t, k, D.csi === undefined ? '…' : '—', D.csi === undefined ? 'NPS du mois' : 'NPS · à importer depuis BoostCX');
    const e = sc.ecart, ec = e == null ? '' : `<em class="${e >= 0 ? 'ok' : 'bad'}">${e >= 0 ? '+' : '−'}${f1(Math.abs(e))} pts vs cible</em>`;
    return tuile('#/csi/' + t, k, f1(sc.score), ['NPS', ec, sc.sondages != null ? pluriel(sc.sondages, 'sondage', 'sondages') : ''].filter(Boolean).join(' · '));
  }
  function peindre() {
    const el = $('stats'); if (!el) return;
    const c = chiffres(), moisNom = MOIS[+todayTO().slice(5, 7) - 1];
    const v = x => x == null ? (D.err ? '—' : '…') : nb(x);
    const obj = (n, o) => n != null && o ? `<small> / ${nb(o)}</small>` : '';
    const pct = (n, o) => n != null && o ? Math.round(n / o * 100) : null;
    const barre = p => p == null ? '' : `<div class="bar" role="img" aria-label="${p} % de l'objectif"><i style="width:${Math.min(100, p)}%"></i></div>`;
    const pN = pct(c.nVentes, c.objN), pU = pct(c.uVentes, c.objU), pW = c.wProfit != null && c.objW ? Math.max(0, Math.round(c.wProfit / c.objW * 100)) : null;
    el.innerHTML = [
      tuile('neuf.html#stock', 'Neuf en stock', v(c.nDispo), c.nRetires ? 'disponibles · ' + pluriel(c.nRetires, 'vendu retiré', 'vendus retirés') : 'disponibles'),
      tuile('neuf.html#ventes', 'Ventes neuf · ' + moisNom, v(c.nVentes) + obj(c.nVentes, c.objN), pN == null ? 'ce mois-ci' : pN + ' % de l\'objectif', barre(pN)),
      tuileCsi('ventes', moisNom),
      tuile('usage.html', 'Usagé en stock', v(c.uDispo), c.uLigne != null ? 'disponibles · ' + nb(c.uLigne) + ' en ligne · ' + nb(c.u60) + ' de plus de 60 j' : 'disponibles'),
      tuile('usage.html#ventes', 'Ventes usagé · ' + moisNom, v(c.uVentes) + obj(c.uVentes, c.objU), pU == null ? 'ce mois-ci' : pU + ' % de l\'objectif', barre(pU)),
      tuileCsi('service', moisNom),
      tuile('wholesale.html', 'Wholesale · ' + moisNom, c.wProfit == null ? v(c.wProfit) : (c.wProfit < 0 ? '−' : '') + nb(Math.abs(c.wProfit)) + ' $' + (c.objW ? `<small> / ${nb(c.objW)} $</small>` : ''), c.wVentes == null ? 'profit du mois' : pluriel(c.wVentes, 'auto vendue', 'autos vendues') + (pW == null ? '' : ' · ' + pW + ' % de l\'objectif'), barre(pW))
    ].join('');
    const maj = $('maj');
    if (maj) maj.textContent = [D.invAt && 'Neuf : HACC du ' + quand(D.invAt), D.uinvAt && 'Usagé : D2C du ' + quand(D.uinvAt)].filter(Boolean).join(' · ');
  }
  function vueAccueil() {
    const h = +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date());
    const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    const date = new Date().toLocaleDateString('fr-CA', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lien = s => `<li${s.aVenir ? ' class="later"' : ''}><a href="${s.href || '#/' + s.id}"><span class="ic">${s.svg}</span><span class="t">${esc(s.titre)}<small>${s.aVenir ? 'À venir' : esc(s.sous)}</small></span></a></li>`;
    return `<section class="hello"><h1>${salut}${prenom ? ', ' + esc(prenom) : ''}</h1><p>Hyundai St-Constant · ${esc(date)}${role ? ' · ' + esc(role) : ''}</p></section>
    <div class="cols">
      <section class="pan" aria-labelledby="t-bref"><div class="pan-h"><h2 id="t-bref">En bref aujourd'hui</h2><span class="meta" id="maj"></span></div><div class="stats" id="stats"></div></section>
      <section class="pan" aria-labelledby="t-sec"><div class="pan-h"><h2 id="t-sec">Sections</h2></div><ul class="links">${SECTIONS.map(lien).join('')}</ul></section>
    </div>`;
  }
  const vueAVenir = s => () => `<section class="hello"><h1>${esc(s.titre)}</h1><p>Hyundai St-Constant · section en préparation</p></section>
    <section class="pan prep"><span class="ic">${s.svg}</span><h2>Cette section arrive bientôt</h2><p>Elle apparaîtra ici dès qu'elle sera prête. En attendant, les inventaires et les ventes sont dans le menu de gauche.</p><a class="btn" href="#/accueil">Retour à l'accueil</a></section>`;
  const VUES = { accueil: vueAccueil }, APRES = {};
  SECTIONS.filter(s => s.id).forEach(s => { VUES[s.id] = vueAVenir(s); });
  let vueActive = 'accueil';

  // ---------- Modules de section (un fichier par section : csi.js, …) ----------
  // Un module appelle HSC.section('id', { sous, vue, apres }) : sa vue remplace « à venir » dans le menu et l'accueil.
  window.HSC = {
    DB, USER, courriel, prenom, esc, nb, quand, todayTO, TZ, MOIS, $,
    estAdmin: () => !!(USER && USER.canEdit()),
    vue: () => vueActive,
    section(id, def) {
      const s = SECTIONS.find(x => x.id === id); if (!s) return;
      s.aVenir = false; if (def.sous) s.sous = def.sous;
      VUES[id] = def.vue; if (def.apres) APRES[id] = def.apres;
      const pastille = document.querySelector(`.nav-i[data-route="${id}"] .soon`); if (pastille) pastille.remove();
    },
    rafraichir: () => route(false)
  };
  const MODULES = ['csi.js'];
  await Promise.all(MODULES.map(f => new Promise(ok => { const s = document.createElement('script'); s.src = f + '?v=' + (window.HACC_VERSION || '1'); s.onload = s.onerror = ok; document.head.appendChild(s); })));

  // ---------- Navigation ----------
  const shell = $('appwrap'), menuBtn = $('menu-btn');
  const menu = ouvert => { shell.classList.toggle('menu-open', ouvert); menuBtn.setAttribute('aria-expanded', String(ouvert)); };
  menuBtn.onclick = () => menu(!shell.classList.contains('menu-open'));
  $('scrim').onclick = () => menu(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });
  const groupe = $('g-inv'), bascule = $('tog-inv');
  const ouvrirGroupe = o => { groupe.classList.toggle('open', o); bascule.setAttribute('aria-expanded', String(o)); };
  try { if (localStorage.getItem('hsc-menu-inventaires') === '0') ouvrirGroupe(false); } catch (e) {}
  bascule.onclick = () => { const o = !groupe.classList.contains('open'); ouvrirGroupe(o); try { localStorage.setItem('hsc-menu-inventaires', o ? '1' : '0'); } catch (e) {} };
  document.querySelectorAll('.nav-sub a').forEach(a => a.addEventListener('click', () => menu(false)));

  function route(focus) {
    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
    const vue = VUES[id] ? id : 'accueil';
    vueActive = vue;
    document.querySelectorAll('.nav-i[data-route]').forEach(a => { if (a.dataset.route === vue) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('vue').innerHTML = VUES[vue]();
    const s = SECTIONS.find(x => x.id === vue);
    document.title = (s ? s.titre : 'Accueil') + ' · Hyundai St-Constant';
    peindre(); if (APRES[vue]) APRES[vue](); menu(false);
    if (focus) { window.scrollTo(0, 0); $('vue').focus({ preventScroll: true }); }
  }
  window.addEventListener('hashchange', () => route(true));
  route(false);
})();
