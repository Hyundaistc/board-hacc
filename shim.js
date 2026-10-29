/* Couche de compatibilité : remplace les services de Claude (window.claude.use) par
   Firebase (connexion Google + base Firestore partagée) et les API Google (Drive, Sheets, Agenda).
   Le code du board (app.js) reste presque identique à la version Claude. */
(function () {
  'use strict';
  const HACC_ORIGIN = 'https://salesportal-hacc.am.hyundai-corp.io';
  const D2C_ORIGIN = 'https://admin.d2cmedia.ca'; // favori « ⟳ Inventaire D2C » (inventaire usagé)
  const OE_ORIGIN = 'https://isw.dlsaccelerator.com'; // favoris « ⟳ Wholesale One-Eighty » et « ⟳ Échanges One-Eighty »
  // One-Eighty envoie deux sortes de données : ventes wholesale (wholesale.html) et échanges entre concessionnaires (echanges.html)
  const SEED_ORIGINS = { [HACC_ORIGIN]: ['hacc-board-seed'], [D2C_ORIGIN]: ['d2c-seed'], [OE_ORIGIN]: ['oe-wholesale-seed', 'oe-echanges-seed'] };
  const SEED_READY = { 'hacc-board-seed': () => !!window.HACC_BOARD, 'd2c-seed': () => !!window.D2C_BOARD, 'oe-wholesale-seed': () => !!(window.WS_BOARD && window.WS_BOARD.importOE), 'oe-echanges-seed': () => !!(window.EX_BOARD && window.EX_BOARD.importOE) };
  const SEED_NAME = { [HACC_ORIGIN]: 'HACC', [D2C_ORIGIN]: 'D2C', [OE_ORIGIN]: 'One-Eighty' };
  const SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  const $ = id => document.getElementById(id);
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = cfg.apiKey && !String(cfg.apiKey).startsWith('A_REMPLACER');

  let auth = null, db = null, currentUser = null, appLoaded = false;

  // ---------- Jeton Google (Drive / Sheets / Agenda) ----------
  const TOKEN_KEY = 'hacc-gtoken';
  function getToken() {
    try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); if (t && t.exp > Date.now() + 60000 && t.email === currentUser?.email) return t.v; } catch (e) {}
    return null;
  }
  function setToken(v) {
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ v, exp: Date.now() + 55 * 60000, email: currentUser?.email })); } catch (e) {}
    googleBanner();
  }
  function provider() { const p = new firebase.auth.GoogleAuthProvider(); SCOPES.forEach(s => p.addScope(s)); p.setCustomParameters({ prompt: 'select_account' }); return p; }
  async function connectGoogle() {
    const p = new firebase.auth.GoogleAuthProvider(); SCOPES.forEach(s => p.addScope(s));
    p.setCustomParameters({ login_hint: currentUser?.email || '' });
    const r = await currentUser.reauthenticateWithPopup(p);
    if (r.credential && r.credential.accessToken) setToken(r.credential.accessToken);
  }
  function googleBanner() {
    const b = $('gbanner'); if (!b) return;
    b.hidden = !currentUser || !!getToken();
  }
  setInterval(googleBanner, 60000);

  async function gfetch(url, opt = {}) {
    const tok = getToken();
    if (!tok) { googleBanner(); throw Object.assign(new Error('Connexion Google requise'), { code: 'not_granted' }); }
    const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    if (r.status === 401) { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} googleBanner(); throw Object.assign(new Error('Connexion Google expirée'), { code: 'not_granted' }); }
    if (r.status === 403) throw Object.assign(new Error('Accès Google refusé'), { code: 'not_granted' });
    if (!r.ok) throw new Error('Google ' + r.status + ' ' + (await r.text()).slice(0, 160));
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.text();
  }
  const b64 = s => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); };
  const enc = encodeURIComponent;
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  // Traduction des appels « connecteur » du board vers les API Google
  const TOOLS = {
    'Google Drive:download_file_content': async a => {
      const txt = await gfetch(`https://www.googleapis.com/drive/v3/files/${enc(a.fileId)}/export?mimeType=${enc(a.exportMimeType || 'text/csv')}`);
      return { payload: { content: b64(typeof txt === 'string' ? txt : JSON.stringify(txt)) } };
    },
    'Google Sheets:batch_clear_values': async a => ({ payload: await gfetch(SHEETS + enc(a.spreadsheetId) + '/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges: a.ranges }) }) }),
    'Google Sheets:update_values': async a => ({ payload: await gfetch(SHEETS + enc(a.spreadsheetId) + '/values/' + enc(a.range) + '?valueInputOption=USER_ENTERED', { method: 'PUT', body: JSON.stringify({ range: a.range, values: a.values }) }) }),
    'Google Sheets:get_spreadsheet': async a => {
      const q = (a.ranges || []).map(r => 'ranges=' + enc(r)).join('&');
      const f = 'sheets.data.rowData.values(effectiveFormat.backgroundColor,formattedValue)';
      return { payload: await gfetch(SHEETS + enc(a.spreadsheetId) + '?' + q + '&includeGridData=' + (a.includeGridData ? 'true' : 'false') + '&fields=' + enc(f)) };
    },
    'Google Calendar:create_event': async a => {
      const body = { summary: a.summary, description: a.description, start: { dateTime: a.startTime, timeZone: a.timeZone }, end: { dateTime: a.endTime, timeZone: a.timeZone }, attendees: a.attendees || [] };
      const ev = await gfetch(CAL + '?sendUpdates=' + (a.attendees && a.attendees.length ? 'all' : 'none'), { method: 'POST', body: JSON.stringify(body) });
      return { payload: { event: { id: ev.id, htmlLink: ev.htmlLink } } };
    },
    'Google Calendar:update_event': async a => {
      const cur = await gfetch(CAL + '/' + enc(a.eventId));
      let att = (cur.attendees || []).filter(x => !(a.removedAttendeeEmails || []).includes(x.email));
      (a.addedAttendees || []).forEach(x => { if (!att.some(y => y.email === x.email)) att.push({ email: x.email }); });
      const body = { summary: a.summary, description: a.description, start: { dateTime: a.startTime, timeZone: a.timeZone }, end: { dateTime: a.endTime, timeZone: a.timeZone }, attendees: att };
      const ev = await gfetch(CAL + '/' + enc(a.eventId) + '?sendUpdates=all', { method: 'PATCH', body: JSON.stringify(body) });
      return { payload: { event: { id: ev.id, htmlLink: ev.htmlLink } } };
    }
  };
  const MCP = {
    async callTool(server, tool, args) {
      const fn = TOOLS[server + ':' + tool];
      if (!fn) throw Object.assign(new Error('Non disponible hors de Claude'), { code: 'server_not_connected' });
      return fn(args || {});
    }
  };

  const isAdmin = () => !!currentUser && (window.HACC_ADMINS || []).map(s => s.toLowerCase()).includes((currentUser.email || '').toLowerCase());
  const USER = { id: async () => currentUser ? currentUser.email : '', canEdit: () => isAdmin(), name: () => currentUser ? (currentUser.displayName || currentUser.email) : '' };

  // Chaque page a son « espace » dans la base : '' = inventaire neuf, 'usage_' = inventaire usagé
  const PFX = window.HACC_DB_PREFIX || '';
  // rawDoc : lecture d'un document d'une autre page (ex. l'inventaire usagé depuis Ventes wholesale), sans le préfixe
  const wrapDb = raw => !PFX ? raw : { collection: c => raw.collection(PFX + c), doc: p => raw.doc(PFX + p), batch: () => raw.batch(), rawDoc: p => raw.doc(p) };

  window.claude = {
    use: async name => {
      if (!currentUser) return null;
      if (name === 'db') return wrapDb(db);
      if (name === 'user') return USER;
      if (name === 'mcp') return MCP;
      return null;
    }
  };

  // Copie des documents (migration) sans écraser ce qui existe déjà
  async function copyDocs(base, entries, overwrite) {
    let n = 0;
    for (let i = 0; i < entries.length; i += 400) {
      const batch = db.batch();
      for (const [p, d] of entries.slice(i, i + 400)) {
        const ref = base.doc(p);
        if (!overwrite(p)) { const cur = await ref.get(); if (cur.exists) continue; }
        batch.set(ref, d); n++;
      }
      await batch.commit();
    }
    return n;
  }

  // ---------- Import (favori HACC ou fichier) ----------
  async function importData(data, source) {
    if (data && data.type === 'oe-wholesale-seed') {           // ventes wholesale lues dans One-Eighty : fusion faite par wholesale.js (équipe ou admin)
      if (PFX !== 'wholesale_') throw new Error('Ces ventes sont pour la page « Ventes wholesale ».');
      if (!window.WS_BOARD || !window.WS_BOARD.importOE) throw new Error('Page pas encore prête, réessayez.');
      return window.WS_BOARD.importOE(data);
    }
    if (data && data.type === 'oe-echanges-seed') {            // échanges entre concessionnaires lus dans One-Eighty : fusion faite par echanges.js
      if (PFX !== 'echanges_') throw new Error('Ces échanges sont pour la page « Échanges ».');
      if (!window.EX_BOARD || !window.EX_BOARD.importOE) throw new Error('Page pas encore prête, réessayez.');
      return window.EX_BOARD.importOE(data);
    }
    if (!isAdmin()) throw new Error('Seule une administratrice peut mettre à jour l\'inventaire.');
    const at = new Date().toISOString();
    if (data && data.type === 'd2c-seed') {
      if (PFX !== 'usage_') throw new Error('Ce fichier est pour l\'inventaire usagé : importez-le depuis la page « Inventaire usagé ».');
      if (!Array.isArray(data.inv) || data.inv.length < 5) throw new Error('Fichier D2C vide ou illisible.');
      const base = wrapDb(db), invAt = data.at || at;
      await base.doc('inventaire/actuel').set({ at: invAt, date: invAt.slice(0, 10), by: currentUser.email, source, json: JSON.stringify(data.inv) });
      const migr = await copyDocs(base, Object.entries(data.docs || {}), p => p.startsWith('couts/'));
      window.D2C_BOARD && window.D2C_BOARD.setInv(data.inv, invAt);
      return `Inventaire usagé mis à jour : ${data.inv.length} véhicules.` + (migr ? ` ${migr} fiche(s) de ventes/réglages importée(s).` : '');
    }
    const B = window.HACC_BOARD;
    if (!data || data.type !== 'hacc-board-seed' || !Array.isArray(data.rows)) throw new Error('Fichier non reconnu.');
    if (PFX) throw new Error('Ce fichier est pour l\'inventaire neuf : importez-le depuis la page « Inventaire neuf ».');
    if (data.rows.length < 20) throw new Error('Trop peu de véhicules reçus (' + data.rows.length + ').');
    const date = data.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    await db.doc('inventaire/actuel').set({ date, at, by: currentUser.email, source, json: JSON.stringify(data.rows) });
    if (data.stock && Object.keys(data.stock).length) await db.doc('config/stock').set({ map: data.stock, at }, { merge: true });
    const migr = await copyDocs(db, [...Object.entries(data.suivi || {}).map(([id, d]) => ['suivi/' + id, d]), ...Object.entries(data.config || {}).filter(([id]) => id !== 'stock').map(([id, d]) => ['config/' + id, d])], () => false);
    if (B) { B.setInvStamp(at); B.applyInventory(data.rows, date); B.setSnapAt(at); B.render(); B.incoming(); }
    const c = { D: 0, T: 0, O: 0 }; data.rows.forEach(r => { const g = r[0] === 'S' ? 'O' : r[0]; if (c[g] != null) c[g]++; });
    const msg = `Inventaire mis à jour : ${c.D} en stock, ${c.T} en transit, ${c.O} en commande.` + (migr ? ` ${migr} fiche(s) de ventes/réglages importée(s).` : '');
    B && B.haccMsg(msg);
    return msg;
  }
  const seenIds = new Set();
  window.addEventListener('message', async e => {
    if (!e.data || !SEED_ORIGINS[e.origin] || !SEED_ORIGINS[e.origin].includes(e.data.type)) return;
    if (!currentUser || !SEED_READY[e.data.type]()) return;       // pas encore prête : le favori réessaie
    if (seenIds.has(e.data.id)) return; seenIds.add(e.data.id);
    try { const m = await importData(e.data, SEED_NAME[e.origin]); e.source && e.source.postMessage({ type: 'hacc-board-ack', ok: true, msg: m }, e.origin); }
    catch (err) { e.source && e.source.postMessage({ type: 'hacc-board-ack', ok: false, msg: err.message }, e.origin); window.HACC_BOARD && window.HACC_BOARD.haccMsg(err.message, true); }
  });
  function announceReady() { if (window.opener) Object.keys(SEED_ORIGINS).forEach(o => { try { window.opener.postMessage({ type: 'hacc-board-ready' }, o); } catch (e) {} }); }

  // ---------- Fenêtre « Mettre à jour » ----------
  function bookmarkletCode() {
    const app = location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html';
    const src = $('bm-src').textContent.replace('__APP__', app);
    return 'javascript:' + encodeURIComponent('(function(){' + src + '})()');
  }
  function openHaccHelp() { const d = $('haccdlg'); if ($('bm-link')) $('bm-link').href = bookmarkletCode(); d.showModal(); }

  // ---------- Gestion des accès (invitations) ----------
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let unsubMembers = null;
  function openMembers() {
    const d = $('memdlg'); d.showModal();
    if (unsubMembers) return;
    unsubMembers = db.collection('membres').onSnapshot(s => {
      const rows = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.id.localeCompare(b.id));
      $('memlist').innerHTML = (window.HACC_ADMINS || []).map(a => `<tr><td>${esc(a)}</td><td>Admin</td><td></td></tr>`).join('') +
        (rows.length ? rows.map(r => `<tr><td>${esc(r.id)}${r.nom ? `<small>${esc(r.nom)}</small>` : ''}</td><td><select data-memrole="${esc(r.id)}" class="vi"><option value="equipe" ${r.role !== 'lecture' ? 'selected' : ''}>Équipe (modifie)</option><option value="lecture" ${r.role === 'lecture' ? 'selected' : ''}>Lecture seule</option></select></td><td><button class="tb-btn danger" data-memdel="${esc(r.id)}" type="button">Retirer</button></td></tr>`).join('')
          : '<tr><td colspan="3" class="hint">Personne d\'invité pour l\'instant.</td></tr>');
    }, e => { $('memmsg').textContent = 'Lecture impossible : ' + e.message; });
  }
  async function addMember(ev) {
    ev.preventDefault();
    const em = $('memEmail').value.trim().toLowerCase(), nom = $('memNom').value.trim(), role = $('memRole').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { $('memmsg').textContent = 'Courriel invalide.'; return; }
    try { await db.doc('membres/' + em).set({ role, nom, ajoutePar: currentUser.email, at: new Date().toISOString() }); $('memmsg').textContent = em + ' a maintenant accès. Envoyez-lui le lien du board : il se connecte avec ce compte Google.'; $('memEmail').value = ''; $('memNom').value = ''; }
    catch (e) { $('memmsg').textContent = 'Non enregistré : ' + e.message; }
  }
  document.addEventListener('change', async e => { const r = e.target.dataset && e.target.dataset.memrole; if (r) { try { await db.doc('membres/' + r).set({ role: e.target.value }, { merge: true }); $('memmsg').textContent = 'Rôle mis à jour.'; } catch (x) { $('memmsg').textContent = x.message; } } });
  document.addEventListener('click', async e => { const b = e.target.closest && e.target.closest('[data-memdel]'); if (!b) return; const id = b.dataset.memdel; if (!confirm('Retirer l\'accès de ' + id + ' ?')) return; try { await db.doc('membres/' + id).delete(); $('memmsg').textContent = id + ' n\'a plus accès.'; } catch (x) { $('memmsg').textContent = x.message; } });

  window.HACC_APP = { openHaccHelp, connectGoogle, openMembers };

  // ---------- Démarrage ----------
  function show(state) {
    $('gate').hidden = state === 'app'; $('appwrap').hidden = state !== 'app';
    $('gate-config').hidden = state !== 'config'; $('gate-login').hidden = state !== 'login'; $('gate-denied').hidden = state !== 'denied';
  }
  function loadApp() {
    if (appLoaded) return; appLoaded = true;
    const s = document.createElement('script'); s.src = (window.HACC_APP_SCRIPT || 'app.js') + '?v=' + (window.HACC_VERSION || '1'); s.onload = announceReady; document.body.appendChild(s);
  }
  async function signIn() {
    $('gate-err').textContent = '';
    try { const r = await auth.signInWithPopup(provider()); if (r.credential && r.credential.accessToken) { currentUser = r.user; setToken(r.credential.accessToken); } }
    catch (e) { $('gate-err').textContent = e.code === 'auth/popup-blocked' ? 'Fenêtre bloquée : autorisez les fenêtres surgissantes pour ce site.' : (e.message || 'Connexion impossible'); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('btn-login').onclick = signIn;
    $('btn-logout').onclick = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} auth.signOut().then(() => location.reload()); };
    $('btn-denied-out').onclick = () => auth.signOut().then(() => location.reload());
    $('btn-google').onclick = () => connectGoogle().then(() => location.reload()).catch(e => alert(e.message));
    $('btn-members').onclick = openMembers;
    $('memform').onsubmit = addMember;
    $('memclose').onclick = () => $('memdlg').close();
    $('dlg-close').onclick = () => $('haccdlg').close();
    if ($('btn-import')) $('btn-import').onclick = openHaccHelp;
    if ($('d2cbtn')) $('d2cbtn').onclick = openHaccHelp;        // « Mettre à jour depuis D2C » (inventaire usagé)
    if ($('oebtn')) $('oebtn').onclick = openHaccHelp;          // « Mettre à jour depuis One-Eighty » (ventes wholesale)
    $('importfile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const out = $('importmsg'); out.textContent = 'Lecture…';
      try { out.textContent = await importData(JSON.parse(await f.text()), 'fichier ' + f.name); }
      catch (err) { out.textContent = err.message; }
      e.target.value = '';
    };
    if (!configured) { show('config'); return; }
    firebase.initializeApp(cfg);
    auth = firebase.auth(); db = firebase.firestore();
    auth.onAuthStateChanged(async u => {
      currentUser = u;
      if (!u) { show('login'); return; }
      // Accès sur invitation : admin, ou fiche dans « membres »
      let ok = isAdmin(), role = isAdmin() ? 'admin' : '';
      if (!ok) { try { const m = await db.doc('membres/' + u.email.toLowerCase()).get(); ok = m.exists; role = ok ? (m.data().role || 'equipe') : ''; } catch (e) { ok = false; } }
      if (!ok) { $('denied-email').textContent = u.email; show('denied'); return; }
      $('who').textContent = u.email + (role === 'admin' ? ' · admin' : role === 'lecture' ? ' · lecture seule' : '');
      document.querySelectorAll('.admin-only').forEach(x => x.hidden = !isAdmin());
      show('app'); googleBanner(); loadApp();
    });
  });
})();
