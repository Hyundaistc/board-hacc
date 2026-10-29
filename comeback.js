// Section Comeback · Hyundai St-Constant
// Source : les 3 Google Sheets de log comeback (Neuf, Usagé, Service). Le script Google comeback/Code.gs
// (compte de l'admin) les lit chaque matin vers 7 h, additionne les montants par département et par mois,
// et enregistre le résultat dans Firestore (config/comeback, champ json) pour toute l'équipe.
// Les données reçues sont toujours affichées échappées (esc).
(function () {
  'use strict';
  const H = window.HSC; if (!H) return;
  const { $, esc, quand, todayTO, MOIS } = H;
  const DEPTS = [['neuf', 'Neuf'], ['usage', 'Usagé'], ['service', 'Service']];
  const NOM = { neuf: 'Neuf', usage: 'Usagé', service: 'Service' };
  const argent = (v, dec) => Number(v || 0).toLocaleString('fr-CA', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }) + ' $';
  const S = { charge: false, err: '', d: null, at: '' };
  const U = { mois: '', dept: 'tous' };

  if (H.DB) H.DB.doc('config/comeback').onSnapshot(s => {
    const x = s.exists ? (s.data() || {}) : {};
    let d = null; try { d = JSON.parse(x.json || 'null'); } catch (e) {}
    S.d = d && typeof d === 'object' ? d : null; S.at = x.at || ''; S.charge = true; S.err = '';
    if (H.vue() === 'comeback') peindre();
  }, () => { S.charge = true; S.err = 'Lecture des comebacks impossible (accès refusé ?).'; if (H.vue() === 'comeback') peindre(); });

  const moisNom = m => /^\d{4}-\d{2}$/.test(m) ? MOIS[+m.slice(5) - 1] + ' ' + m.slice(0, 4) : m;
  const listeMois = () => { const l = new Set(Object.keys((S.d && S.d.mois) || {}).filter(m => /^\d{4}-\d{2}$/.test(m))); l.add(todayTO().slice(0, 7)); return [...l].sort().reverse(); };
  const deptDuLien = () => { const k = (location.hash.match(/^#\/comeback\/(\w+)/) || [])[1]; U.dept = NOM[k] ? k : 'tous'; };
  const lienSur = u => /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+$/.test(String(u || ''));

  function vue() {
    deptDuLien();
    return `<section class="hello"><h1>Comeback</h1><p>Montants accordés en comeback · Neuf, Usagé et Service</p></section>
    <div class="outils"><div id="cb-mois"></div><div class="actions" id="cb-liens"></div></div>
    <p class="meta" id="cb-maj"></p>
    <div id="cb-corps" class="csi"><section class="pan"><p class="vide">Chargement des comebacks…</p></section></div>`;
  }

  function peindre() {
    const corps = $('cb-corps'); if (!corps) return;
    const mois = listeMois(); if (!U.mois || !mois.includes(U.mois)) U.mois = mois[0];
    $('cb-mois').innerHTML = `<div class="seg" role="group" aria-label="Mois">${mois.slice(0, 6).map(m => `<button type="button" data-cb-mois="${esc(m)}" aria-pressed="${m === U.mois}">${esc(moisNom(m))}</button>`).join('')}</div>`;
    const f = (S.d && S.d.fichiers) || {};
    $('cb-liens').innerHTML = DEPTS.filter(([k]) => f[k] && lienSur(f[k].url)).map(([k, l]) => `<a class="btn2" href="${esc(f[k].url)}" target="_blank" rel="noopener">Log ${esc(l.toLowerCase())} ↗</a>`).join('');
    $('cb-maj').textContent = S.at ? 'Mis à jour le ' + quand(S.at) + ' depuis les Google Sheets · chaque matin vers 7 h' : '';
    if (!S.charge) return;
    if (S.err || !S.d) {
      corps.innerHTML = `<section class="pan"><p class="vide">${S.err ? esc(S.err) : 'Les comebacks n\'ont pas encore été importés. ' + (H.estAdmin() ? 'Exécutez une première fois le script Google « Comeback » (fonction installer).' : 'Ils arriveront ici chaque matin.')}</p></section>`;
      return;
    }
    const r = (S.d.mois || {})[U.mois] || {};
    const val = (k, c) => +((r[k] || {})[c] || 0);
    const tot = DEPTS.reduce((a, [k]) => a + val(k, 'total'), 0), n = DEPTS.reduce((a, [k]) => a + val(k, 'n'), 0);
    const tuile = (k, l, t, c) => `<a class="stat" href="#/comeback${k === 'tous' ? '' : '/' + k}"${U.dept === k ? ' aria-current="true" style="outline:2px solid currentColor;outline-offset:-2px"' : ''}><span class="k">${esc(l)}</span><b>${argent(t, true)}</b><span class="s">${c ? c + ' comeback' + (c > 1 ? 's' : '') : 'aucun comeback'}</span></a>`;
    const lignes = (S.d.lignes || []).filter(x => x && x.mois === U.mois && (U.dept === 'tous' || x.d === U.dept))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (+b.montant || 0) - (+a.montant || 0));
    const montantTd = x => { const brut = String(x.montantTxt || ''); const note = brut && !/^[\d\s.,$  ]+$/.test(brut) ? ` title="Inscrit : ${esc(brut)}"` : ''; return `<td class="num"${note}>${brut ? argent(x.montant, true) : '—'}${note ? ' *' : ''}</td>`; };
    corps.innerHTML = `<section class="pan"><div class="pan-h"><h2>Par département <span class="meta">${esc(moisNom(U.mois))}</span></h2></div>
      <div class="stats">${DEPTS.map(([k, l]) => tuile(k, l, val(k, 'total'), val(k, 'n'))).join('')}${tuile('tous', 'Total', tot, n)}</div></section>
      <section class="pan"><div class="pan-h"><h2>Détail · ${esc(U.dept === 'tous' ? 'tous les départements' : NOM[U.dept])} <span class="meta">${esc(moisNom(U.mois))}</span></h2></div>
      ${lignes.length ? `<div class="tbl"><table class="t"><thead><tr><th>Date</th><th>Dépt</th><th>Client</th><th>Stock / WO</th><th>Aviseur</th><th class="num">Montant</th><th>Raison</th></tr></thead><tbody>${lignes.map(x => `<tr><td class="mono">${esc(x.date || x.dateTxt)}</td><td>${esc(NOM[x.d] || x.d)}</td><td>${esc(x.client)}</td><td class="mono">${esc([x.stock, x.wo].filter(Boolean).join(' · '))}</td><td>${esc(x.aviseur)}</td>${montantTd(x)}<td class="com">${esc(x.raison)}</td></tr>`).join('')}</tbody></table></div>
      <p class="meta">* Montant écrit en texte dans le log (ex. deux montants) : survolez pour voir l'inscription d'origine.</p>` : '<p class="vide">Aucun comeback pour cette période.</p>'}</section>`;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cb-mois]');
    if (!b || H.vue() !== 'comeback') return;
    U.mois = b.dataset.cbMois; peindre();
  });

  H.section('comeback', { sous: 'Montants par département · Neuf, Usagé, Service', vue, apres: peindre });
})();
