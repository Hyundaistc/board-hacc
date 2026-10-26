/* Couche de compatibilité : remplace les services de Claude (window.claude.use) par
   Firebase (connexion Google + base Firestore partagée) et les API Google (Drive, Sheets, Agenda).
   Le code du board (app.js) reste presque identique à la version Claude. */
(function () {
  'use strict';
  const HACC_ORIGIN = 'https://salesportal-hacc.am.hyundai-corp.io';
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

  window.claude = {
    use: async name => {
      if (!currentUser) return null;
      if (name === 'db') return db;
      if (name === 'user') return USER;
      if (name === 'mcp') return MCP;
      return null;
    }
  };

  // ---------- Import de l'inventaire (favori HACC ou fichier) ----------
  async function importData(data, source) {
    const B = window.HACC_BOARD;
    if (!isAdmin()) throw new Error('Seule une administratrice peut mettre à jour l\'inventaire.');
    if (!data || data.type !== 'hacc-board-seed' || !Array.isArray(data.rows)) throw new Error('Fichier non reconnu.');
    if (data.rows.length < 20) throw new Error('Trop peu de véhicules reçus (' + data.rows.length + ').');
    const date = data.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const at = new Date().toISOString();
    await db.doc('inventaire/actuel').set({ date, at, by: currentUser.email, source, json: JSON.stringify(data.rows) });
    if (data.stock && Object.keys(data.stock).length) await db.doc('config/stock').set({ map: data.stock, at }, { merge: true });
    // Migration depuis l'ancien board Claude : ventes/suivi + réglages (n'écrase pas ce qui existe déjà)
    let migr = 0;
    const docs = [...Object.entries(data.suivi || {}).map(([id, d]) => ['suivi/' + id, d]), ...Object.entries(data.config || {}).filter(([id]) => id !== 'stock').map(([id, d]) => ['config/' + id, d])];
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      for (const [p, d] of docs.slice(i, i + 400)) { const ref = db.doc(p); const cur = await ref.get(); if (!cur.exists) { batch.set(ref, d); migr++; } }
      await batch.commit();
    }
    if (B) { B.setInvStamp(at); B.applyInventory(data.rows, date); B.setSnapAt(at); B.render(); B.incoming(); }
    const c = { D: 0, T: 0, O: 0 }; data.rows.forEach(r => { const g = r[0] === 'S' ? 'O' : r[0]; if (c[g] != null) c[g]++; });
    const msg = `Inventaire mis à jour : ${c.D} en stock, ${c.T} en transit, ${c.O} en commande.` + (migr ? ` ${migr} fiche${migr > 1 ? 's' : ''} de ventes/réglages importée${migr > 1 ? 's' : ''}.` : '');
    B && B.haccMsg(msg);
    return msg;
  }
  const seenIds = new Set();
  window.addEventListener('message', async e => {
    if (e.origin !== HACC_ORIGIN || !e.data || e.data.type !== 'hacc-board-seed') return;
    if (!currentUser || !window.HACC_BOARD) return;          // pas encore prête : le favori réessaie
    if (seenIds.has(e.data.id)) return; seenIds.add(e.data.id);
    try { const m = await importData(e.data, 'HACC'); e.source && e.source.postMessage({ type: 'hacc-board-ack', ok: true, msg: m }, e.origin); }
    catch (err) { e.source && e.source.postMessage({ type: 'hacc-board-ack', ok: false, msg: err.message }, e.origin); window.HACC_BOARD && window.HACC_BOARD.haccMsg(err.message, true); }
  });
  // Signale au favori HACC que l'app est prête à recevoir l'inventaire
  function announceReady() { if (window.opener) { try { window.opener.postMessage({ type: 'hacc-board-ready' }, HACC_ORIGIN); } catch (e) {} } }

  // ---------- Fenêtre d'aide « Mettre à jour depuis HACC » ----------
  function bookmarkletCode() {
    const app = location.origin + location.pathname;
    const src = $('bm-src').textContent.replace('__APP__', app);
    return 'javascript:' + encodeURIComponent('(function(){' + src + '})()');
  }
  function openHaccHelp() {
    const d = $('haccdlg'); $('bm-link').href = bookmarkletCode(); d.showModal();
  }
  window.HACC_APP = { openHaccHelp, connectGoogle };

  // ---------- Démarrage ----------
  function show(state) {
    $('gate').hidden = state === 'app'; $('appwrap').hidden = state !== 'app';
    $('gate-config').hidden = state !== 'config'; $('gate-login').hidden = state !== 'login'; $('gate-denied').hidden = state !== 'denied';
  }
  function loadApp() {
    if (appLoaded) return; appLoaded = true;
    const s = document.createElement('script'); s.src = 'app.js?v=' + (window.HACC_VERSION || '1'); s.onload = announceReady; document.body.appendChild(s);
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
    $('dlg-close').onclick = () => $('haccdlg').close();
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
      // Vérifie l'accès en lisant un document protégé par les règles
      try { await db.doc('config/ventes').get(); }
      catch (e) { $('denied-email').textContent = u.email; show('denied'); return; }
      $('who').textContent = u.email + (isAdmin() ? ' · admin' : '');
      $('adminbox').hidden = !isAdmin();
      show('app'); googleBanner(); loadApp();
    });
  });
})();
