let SNAP = "2000-01-01";
const RAW = [];
// [grp, model, year, version, ext, int, vin, order, loc, place, eta, aging, sold, demo, pmon, recall, holdback]
const mkV=r=>({g:r[0],model:r[1],year:r[2],ver:r[3],ext:r[4],int:r[5],vin:r[6],order:r[7],loc:r[8],place:r[9],eta:r[10],age:parseInt(r[11]||'0',10),sold:r[12],pmon:r[14],recall:parseInt(r[15]||'0',10)});
let V = RAW.map(mkV);
let TODAY = new Date(SNAP+'T00:00:00');
const EV = new Set(['IONIQ 5','IONIQ 6','IONIQ 9','KONA ÉLECTRIQUE']);
const isStock=v=>v.g==='D', isTr=v=>v.g==='T', isOrd=v=>v.g==='O'||v.g==='S';
const isSold=v=>!!(typeof NOTES!=='undefined'&&NOTES[keyOf(v)]?.vendu), isAvail=v=>isStock(v)&&!isSold(v);

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const iso=d=>d.toISOString().slice(0,10);
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const fmtD=d=>{if(!d)return'—';return new Date(d+'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'short'})};
const fmtDY=d=>{if(!d)return'—';return new Date(d+'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'short',year:'numeric'})};
const daysTo=d=>Math.round((new Date(d+'T00:00:00')-TODAY)/864e5);
const MOIS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const fmtM=m=>m?MOIS[+m.slice(4)-1]+' '+m.slice(0,4):'—';
const ageCls=a=>a>=365?'p-bad':a>=180?'p-hot':a>=90?'p-warn':'p-ok';
const etaCls=n=>n<0?'p-bad':n<=7?'p-ok':n<=21?'p-n':'p-warn';
const colorName=s=>s.replace(/^[A-Z0-9]{3}\s*[-:]\s*/,'').replace(/^[A-Z0-9]{3}\s*-\s*/,'');

// Semaines (lundi→dimanche) à partir de la semaine courante
let mon=addD(TODAY,-((TODAY.getDay()+6)%7));
let WEEKS=[0,1,2,3].map(i=>{const a=addD(mon,7*i),b=addD(a,6);return{a:iso(a),b:iso(b),label:i===0?'Cette sem.':(a.getDate()+'–'+b.getDate()+' '+MOIS[b.getMonth()])}});
let lastWeekEnd=WEEKS[3].b;
const weekOf=eta=>{if(!eta)return 4;for(let i=0;i<4;i++)if(eta<=WEEKS[i].b)return i;return 4};
let PMONS=[...new Set(V.filter(isOrd).map(v=>v.pmon).filter(Boolean))].sort();
let PCOLS=PMONS.filter(m=>V.filter(v=>isOrd(v)&&v.pmon===m).length>=4).slice(-3);
const pcol=m=>PCOLS.includes(m)?m:'autre';

const count=m=>V.filter(v=>v.model===m).length;
const ORDER=['ELANTRA','SONATA','SONATA HYBRID','VENUE','KONA','TUCSON','SANTA FE','PALISADE','IONIQ 5','IONIQ 6','IONIQ 9','KONA ÉLECTRIQUE'];
let models=[...new Set(V.map(v=>v.model))].sort((a,b)=>(ORDER.indexOf(a)+99*(ORDER.indexOf(a)<0))-(ORDER.indexOf(b)+99*(ORDER.indexOf(b)<0)));
let GROUPS=[['Véhicules essence et hybrides',models.filter(m=>!EV.has(m))],['Véhicules électriques',models.filter(m=>EV.has(m))]];
function applyInventory(rows,date){
  SNAP=date; V=rows.map(mkV); TODAY=new Date(SNAP+'T00:00:00');
  mon=addD(TODAY,-((TODAY.getDay()+6)%7));
  WEEKS=[0,1,2,3].map(i=>{const a=addD(mon,7*i),b=addD(a,6);return{a:iso(a),b:iso(b),label:i===0?'Cette sem.':(a.getDate()+'–'+b.getDate()+' '+MOIS[b.getMonth()])}});
  lastWeekEnd=WEEKS[3].b;
  PMONS=[...new Set(V.filter(isOrd).map(v=>v.pmon).filter(Boolean))].sort();
  PCOLS=PMONS.filter(m=>V.filter(v=>isOrd(v)&&v.pmon===m).length>=4).slice(-3);
  models=[...new Set(V.map(v=>v.model))].sort((a,b)=>(ORDER.indexOf(a)+99*(ORDER.indexOf(a)<0))-(ORDER.indexOf(b)+99*(ORDER.indexOf(b)<0)));
  GROUPS=[['Véhicules essence et hybrides',models.filter(m=>!EV.has(m))],['Véhicules électriques',models.filter(m=>EV.has(m))]];
  if(typeof VKEYS!=='undefined') VKEYS.clear();
  document.getElementById('snap').textContent='Données au '+fmtDY(SNAP);
}

let tab='arrivages', model=null, q='';
try{const s=JSON.parse(localStorage.getItem('hacc-board2')||'{}');if(s.tab)tab=s.tab}catch(e){}
if(['arrivages','stock','ventes'].includes(location.hash.slice(1))) tab=location.hash.slice(1);
const save=()=>{try{localStorage.setItem('hacc-board2',JSON.stringify({tab}))}catch(e){}};

document.getElementById('snap').textContent='Données au '+fmtDY(SNAP);

// ---- No. de stock (2026 LISTE DE STOCK NEUFS, Google Drive) ----
const STOCK_FILE='1GTTzmt8yHUc_9ndA_B9kPcjYErAXSD-H7oMSCWoeuMg', STOCK_FILE27='12ihOoat4guGjpXUawesuUW-jIrBfVKW9QV0c_fw2OD8';
let STOCK={}, STOCK_SRC='en attente';
let STKSEQ=0;
const stockCell=v=>{const k=keyOf(v),ov=NOTES[k]?.vente?.stock;const n=(ov&&String(ov).trim())?ov:(STOCK[v.vin]||'');return `<td class="stkc"><input class="vi stkedit" id="sk${++STKSEQ}-${k}" data-vk="${k}" data-f="stock" value="${esc(n)}" placeholder="—" aria-label="No. de stock" ${DB?'':'disabled'}></td>`};
function parseCSV(t){const out=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(f);out.push(row);row=[];f=''}else f+=c}if(f||row.length){row.push(f);out.push(row)}return out}
function b64utf8(b){const bin=atob(b);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new TextDecoder('utf-8').decode(u)}
function stockStatus(){const el=document.getElementById('stocksrc');if(el)el.textContent='No. de stock : listes 2026 et 2027 de la réception ('+STOCK_SRC+')'}
async function loadStock(){
  try{
    const mcp=await window.claude?.use?.('mcp'); if(!mcp){stockStatus();return}
    const readList=async id=>{const res=await mcp.callTool('Google Drive','download_file_content',{fileId:id,exportMimeType:'text/csv'},{cache:{staleTime:60000}});
      let p=res.payload; if(typeof p==='string'){try{p=JSON.parse(p)}catch(e){}} const raw=p&&p.content; if(!raw) return [];
      let txt; try{txt=b64utf8(raw)}catch(e){txt=raw}
      return parseCSV(txt).map(r=>[(r[0]||'').trim(),(r[1]||'').trim().toUpperCase().replace(/\s/g,'')]).filter(r=>/^\d{6}$/.test(r[0])&&r[1]);};
    const map={}, rows=[...(await readList(STOCK_FILE)),...(await readList(STOCK_FILE27).catch(()=>[]))];
    const bySer={}; rows.forEach(([st,vin])=>{if(/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))map[vin]=st; const m=vin.match(/(\d{6})$/); if(m)(bySer[m[1]]=bySer[m[1]]||[]).push([st,vin]);});
    V.forEach(v=>{if(!v.vin||map[v.vin])return; const c=(bySer[v.vin.slice(-6)]||[]).filter(([,x])=>x.slice(0,3)===v.vin.slice(0,3)); if(c.length===1)map[v.vin]=c[0][0];});
    if(Object.keys(map).length<10) throw new Error('liste illisible');
    const changed=V.some(v=>v.vin&&map[v.vin]&&map[v.vin]!==STOCK[v.vin]);
    STOCK={...STOCK,...map}; STOCK_SRC='en direct, '+new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
    stockStatus();
    if(changed){ if(document.activeElement&&document.activeElement.matches('input[type=text][data-k]')) setTimeout(()=>{render();incoming()},3000); else {render();incoming()} }
  }catch(e){ STOCK_SRC=(STOCK_SRC.startsWith('en direct')?STOCK_SRC:'copie partagée')+(e&&e.code==='not_granted'?' · connecteur Google Drive non autorisé':''); stockStatus(); }
}
setTimeout(()=>{stockStatus();loadStock()},0);
(async()=>{try{const db=await window.claude?.use?.('db');if(!db)return;db.doc('config/stock').onSnapshot(s=>{if(!s.exists)return;const m=(s.data()||{}).map||{};STOCK={...m,...STOCK};if(STOCK_SRC==='en attente')STOCK_SRC='copie partagée';stockStatus();render();incoming();})}catch(e){}})(); setInterval(loadStock,5*60*1000);

// ---- Suivi partagé (vendu + commentaire) ----
const NOTES={}; let DB=null, USER=null;
const keyOf=v=>v._k?v._k:(v.vin?v.vin:'CMD'+v.order);
const VKEYS=new Set();
function extraVehicles(){if(!VKEYS.size)V.forEach(v=>VKEYS.add(keyOf(v)));return Object.entries(NOTES).filter(([k,n])=>n&&n.vendu&&!VKEYS.has(k)).map(([k,n])=>{const x=n.vente||{};return {_k:k,g:'X',vin:'',niv:x.niv||'',model:x.model||'—',ver:x.gamme||'',ext:x.couleur||'',int:'',year:x.annee||'',order:'',loc:'',place:'',sold:'',eta:'',age:0,pmon:'',recall:0}})}
const vehOf=k=>V.find(z=>keyOf(z)===k)||extraVehicles().find(z=>z._k===k);
const trackHead='<th class="c-sold">Vendu</th><th class="c-com">Commentaire</th>';
const trackHeadD='<th class="c-sold">Vendu</th><th class="c-date">Date</th><th class="c-com">Commentaire</th>'; // En stock : date de vente après Vendu
const dateCell=(v,p)=>{const k=keyOf(v),n=NOTES[k]||{};return `<td class="c-date"><input type="date" id="${p}d-${k}" data-dk="${k}" value="${esc(n.vendu?(n.soldAt||''):'')}" aria-label="Date de vente" ${DB&&n.vendu?'':'disabled'}></td>`};
const trackCells=(v,p,withDate)=>{const k=keyOf(v),n=NOTES[k]||{};return `<td class="c-sold"><input type="checkbox" id="${p}s-${k}" data-k="${k}" aria-label="Vendu" ${n.vendu?'checked':''} ${DB?'':'disabled'}></td>${withDate?dateCell(v,p):''}<td class="c-com"><input type="text" id="${p}c-${k}" data-k="${k}" value="${esc(n.comment||'')}" placeholder="" aria-label="Commentaire" ${DB?'':'disabled'}></td>`};
const rowAttr=v=>{const k=keyOf(v);return ` data-row="${k}" class="${NOTES[k]?.vendu?'sold':''}"`};
function paint(k){
  const n=NOTES[k]||{};
  document.querySelectorAll(`tr[data-row="${k}"]`).forEach(tr=>tr.classList.toggle('sold',!!n.vendu));
  document.querySelectorAll(`input[type=checkbox][data-k="${k}"]`).forEach(i=>{i.checked=!!n.vendu});
  document.querySelectorAll(`input[type=text][data-k="${k}"]`).forEach(i=>{if(document.activeElement!==i)i.value=n.comment||''});
  document.querySelectorAll(`input[type=date][data-dk="${k}"]`).forEach(i=>{i.disabled=!DB||!n.vendu;if(document.activeElement!==i)i.value=n.vendu?(n.soldAt||''):''});
}
const timers={};
async function saveNote(k){
  if(!DB) return;
  const n=NOTES[k]||{};
  try{ await DB.collection('suivi').doc(k).set({vendu:!!n.vendu,comment:n.comment||'',soldAt:n.soldAt||'',vente:n.vente||{},by:USER?await USER.id().catch(()=>''):'',at:new Date().toISOString()}); setStatus('Enregistré'); scheduleSheet(); }
  catch(e){ setStatus(e&&e.code==='not_granted'||e&&(e.code==='permission_denied'||e.code==='permission-denied')?'Lecture seule : demandez un accès à l\'administratrice pour modifier':'Non enregistré, réessayez'); }
}
function setStatus(t){const el=document.getElementById('savestate'); if(el){el.textContent=t;clearTimeout(el._t);el._t=setTimeout(()=>el.textContent=DB?'Vendu et commentaires partagés avec l\'équipe':'',3000)}}
document.addEventListener('change',e=>{const i=e.target;if(i.matches('input[type=checkbox][data-k]')){const k=i.dataset.k;const o=NOTES[k]||{};NOTES[k]={...o,vendu:i.checked,soldAt:i.checked?(o.soldAt||new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'})):o.soldAt};paint(k);saveNote(k);if(tab==='ventes')list();kpis();matrix();tabsUI()}
  // Date de vente (à côté de Vendu) : enregistrée seulement si l'auto est vendue et la date complète
  if(i.matches('input[type=date][data-dk]')){const k=i.dataset.dk,o=NOTES[k]||{};if(!o.vendu||!/^20\d\d-\d\d-\d\d$/.test(i.value))return;NOTES[k]={...o,soldAt:i.value};paint(k);saveNote(k)}});
document.addEventListener('focusout',e=>{const i=e.target;if(i.matches&&i.matches('input[type=date][data-dk]')){const n=NOTES[i.dataset.dk]||{};i.value=n.vendu?(n.soldAt||''):''}});
document.addEventListener('input',e=>{const i=e.target;if(i.matches('input[type=text][data-k]')){const k=i.dataset.k;NOTES[k]={...(NOTES[k]||{}),comment:i.value};document.querySelectorAll(`input[type=text][data-k="${k}"]`).forEach(x=>{if(x!==i)x.value=i.value});clearTimeout(timers[k]);timers[k]=setTimeout(()=>saveNote(k),800)}});
(async()=>{
  try{ DB=await window.claude?.use?.('db'); USER=await window.claude?.use?.('user'); }catch(e){DB=null}
  if(!DB){document.getElementById('savestate').textContent='Connectez-vous pour cocher Vendu et écrire des commentaires';return}
  setStatus('Vendu et commentaires partagés avec l\'équipe');
  let first=true;
  DB.collection('suivi').onSnapshot(snap=>{
    const seen=new Set();
    snap.docs.forEach(d=>{if(!d.exists)return;seen.add(d.id);const x=d.data()||{};const focused=document.activeElement?.dataset?.k===d.id&&document.activeElement.type==='text';const editing=document.activeElement?.dataset?.vk===d.id;NOTES[d.id]={vendu:!!x.vendu,comment:focused?(NOTES[d.id]?.comment??x.comment):(x.comment||''),soldAt:x.soldAt||'',vente:editing?(NOTES[d.id]?.vente||{}):(x.vente||{})}});
    if(first){first=false;render();incoming();} else {Object.keys(NOTES).forEach(paint); kpis(); matrix(); if(tab==='ventes'&&!document.activeElement?.dataset?.vk) list(); else if(tab==='ventes') ventesSummary(); tabsUI();}
  },err=>setStatus('Synchronisation interrompue, rechargez la page'));
})();

function kpis(){
  const tr=V.filter(isTr);
  const w0=tr.filter(v=>weekOf(v.eta)===0).length, w01=tr.filter(v=>weekOf(v.eta)<=1).length;
  const mo=tr.filter(v=>v.eta&&v.eta.slice(0,7)===SNAP.slice(0,7)).length;
  document.getElementById('kpis').innerHTML=[
    [V.filter(isAvail).length,'En stock disponible · '+V.filter(v=>isStock(v)&&isSold(v)).length+' vendus retirés'],[w0,'Arrivent cette semaine'],[w01,'D\'ici 2 semaines'],[tr.length,'En transit · '+mo+' en '+MOIS[TODAY.getMonth()]],[V.filter(isOrd).length,'En commande (sans ETA)']
  ].map(([n,l])=>`<div class="kpi"><b>${n}</b><span>${l}</span></div>`).join('');
}

function matrix(){
  const z=n=>n?n:'<span class="z">·</span>';
  const tot={st:0,w:[0,0,0,0,0],p:{},tr:0,co:0};
  const line=m=>{
    const vs=V.filter(v=>v.model===m);
    const st=vs.filter(isAvail).length;
    const w=[0,0,0,0,0]; vs.filter(isTr).forEach(v=>w[weekOf(v.eta)]++);
    const p={}; vs.filter(isOrd).forEach(v=>{const k=pcol(v.pmon);p[k]=(p[k]||0)+1});
    const tr=w.reduce((a,b)=>a+b,0), co=vs.filter(isOrd).length;
    tot.st+=st; w.forEach((n,i)=>tot.w[i]+=n); Object.entries(p).forEach(([k,n])=>tot.p[k]=(tot.p[k]||0)+n); tot.tr+=tr; tot.co+=co;
    return `<tr tabindex="0" data-m="${esc(m)}" class="${model===m?'sel':''}"><td><b>${esc(m)}</b></td><td>${z(st)}</td>${w.map((n,i)=>`<td class="${i===0?'sep ':''}${n&&i<2?'hot':''}">${z(n)}</td>`).join('')}<td><b>${z(tr)}</b></td>${[...PCOLS,'autre'].map((k,i)=>`<td class="${i===0?'sep':''}">${z(p[k]||0)}</td>`).join('')}<td class="sep"><b>${tr+co}</b></td></tr>`;
  };
  const ncol=2+5+1+PCOLS.length+1+1;
  let body='';
  for(const [label,ms] of GROUPS){ if(!ms.length)continue; body+=`<tr class="grp-row"><td colspan="${ncol}">${label}</td></tr>`+ms.map(line).join(''); }
  document.getElementById('matrix').innerHTML=`<thead>
   <tr class="top"><th></th><th></th><th class="sep" colspan="6">En transit · ETA concessionnaire</th><th class="sep" colspan="${PCOLS.length+1}">En commande · mois de production</th><th class="sep"></th></tr>
   <tr><th>Modèle</th><th>En stock</th>${WEEKS.map((w,i)=>`<th class="${i===0?'sep':''}">${w.label}</th>`).join('')}<th>Plus tard</th><th>Total</th>${PCOLS.map((m,i)=>`<th class="${i===0?'sep':''}">${fmtM(m)}</th>`).join('')}<th>Autres</th><th class="sep">À venir</th></tr></thead>
  <tbody>${body}</tbody>
  <tfoot><tr><td>Total</td><td>${tot.st}</td>${tot.w.map((n,i)=>`<td class="${i===0?'sep':''}">${n}</td>`).join('')}<td>${tot.tr}</td>${[...PCOLS,'autre'].map((k,i)=>`<td class="${i===0?'sep':''}">${tot.p[k]||0}</td>`).join('')}<td class="sep">${tot.tr+tot.co}</td></tr></tfoot>`;
  document.querySelectorAll('#matrix tbody tr[data-m]').forEach(tr=>{
    const go=()=>{model=model===tr.dataset.m?null:tr.dataset.m;render();document.getElementById('tabs').scrollIntoView({behavior:'smooth',block:'start'})};
    tr.onclick=go; tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}};
  });
}

const TABS=[{id:'arrivages',label:'Arrivages',test:v=>isTr(v)||isOrd(v)},{id:'stock',label:'En stock',test:isStock,count:isAvail},{id:'ventes',label:'Ventes',test:v=>!!NOTES[keyOf(v)]?.vendu}];
function tabsUI(){
  document.getElementById('tabs').innerHTML=TABS.map(t=>`<button role="tab" id="tab-${t.id}" aria-selected="${t.id===tab}" data-t="${t.id}">${t.label}<span class="n">${t.id==='ventes'?allSales().filter(r=>!model||r.v.model===model).length:V.filter(v=>(t.count||t.test)(v)&&(!model||v.model===model)).length}</span></button>`).join('');
  document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;save();history.replaceState(null,'','#'+tab);render()});
  const L={
    arrivages:'Par modèle : autos en transit triées par ETA, puis commandes triées par mois de production. <span class="pill p-ok">≤ 7 j</span><span class="pill p-n">8–21 j</span><span class="pill p-warn">22 j +</span><span class="pill p-bad">ETA dépassé</span>',
    ventes:'Chaque auto cochée Vendu arrive ici automatiquement. Complétez représentant, F&amp;I, client, front et back : tout est partagé avec l\'équipe.',
    stock:'Par modèle, du plus vieux au plus récent. <span class="pill p-ok">0–89 j</span><span class="pill p-warn">90–179 j</span><span class="pill p-hot">180–364 j</span><span class="pill p-bad">365 j +</span>'
  };
  document.getElementById('legend').innerHTML=L[tab]+(model?` <button class="chip" id="clr">${esc(model)} ✕</button>`:'');
  const clr=document.getElementById('clr'); if(clr) clr.onclick=()=>{model=null;render()};
}

const stage=v=>{
  const m={'En mer':['p-n','En mer'],'Port':['p-warn','Au port'],'En transit':['p-ok','Rail / camion'],'Parc de stockage':['p-ok','Parc de stockage']};
  const [c,l]=m[v.loc]||['p-n',v.loc]; return `<span class="pill ${c}">${esc(l)}</span>`;
};
const statut=v=>{
  if(v.sold.startsWith('DEMO')||v.sold.includes('DÉMONSTR')) return '<span class="pill p-n">Démo</span>';
  if(v.sold.includes('COURTOIS')) return '<span class="pill p-n">Courtoisie</span>';
  if(v.loc.includes('occ')) return '<span class="pill p-warn">Occasion</span>';
  if(v.loc.includes('client final')) return '<span class="pill p-warn">Vendu / livré</span>';
  return '<span class="pill p-ok">Disponible</span>';
};
const verCell=v=>`<td class="ver"><input class="vi veredit" id="vr${++STKSEQ}-${keyOf(v)}" data-vk="${keyOf(v)}" data-f="gamme" value="${esc((NOTES[keyOf(v)]?.vente?.gamme&&String(NOTES[keyOf(v)].vente.gamme).trim())?NOTES[keyOf(v)].vente.gamme:v.ver)}" placeholder="Version à entrer" aria-label="Version" ${DB?'':'disabled'}><small>${esc(v.year)}</small></td><td>${esc(colorName(v.ext))}<small style="display:block;color:var(--muted);font-size:.74rem">${esc(colorName(v.int))}</small></td>`;

function list(){
  if(tab==='ventes'){ventesView();return}
  const t=TABS.find(x=>x.id===tab), ql=q.trim().toLowerCase();
  const rows=V.filter(v=>t.test(v)&&(!model||v.model===model)&&(!ql||[v.vin,v.ver,v.ext,v.int,v.order,v.model,STOCK[v.vin]||'',NOTES[keyOf(v)]?.vente?.gamme||'',NOTES[keyOf(v)]?.vente?.stock||''].join(' ').toLowerCase().includes(ql)));
  let html='';
  for(const [label,ms] of GROUPS){
    let sec='';
    for(const m of ms){
      const g=rows.filter(v=>v.model===m); if(!g.length) continue;
      let meta='',head='',body='';
      if(tab==='arrivages'){
        const tr=g.filter(isTr).sort((a,b)=>(a.eta||'9').localeCompare(b.eta||'9')), co=g.filter(isOrd).sort((a,b)=>(a.pmon||'9').localeCompare(b.pmon||'9'));
        const stN=V.filter(v=>isAvail(v)&&v.model===m).length;
        meta=[`${stN} en stock`, tr.length?`${tr.length} en transit · prochain ${fmtD(tr[0].eta)}`:'aucun en transit', co.length?`${co.length} en commande`:''].filter(Boolean).join(' · ');
        head='<th>#</th><th>Version</th><th>Couleur ext. / int.</th><th>NIV / no. commande</th><th>Stock</th><th class="num">ETA</th><th class="num">Dans</th><th>Arrivage</th>'+trackHead;
        let i=0;
        if(tr.length) body+=`<tr class="divider"><td colspan="10">En transit (${tr.length})</td></tr>`+tr.map(v=>{const n=v.eta?daysTo(v.eta):null;return `<tr${rowAttr(v)}><td class="idx">${++i}</td>${verCell(v)}<td class="mono">${esc(v.vin)}</td>${stockCell(v)}<td class="num mono">${fmtD(v.eta)}</td><td class="num">${n==null?'—':`<span class="pill ${etaCls(n)}">${n<0?'dépassé '+(-n)+' j':n===0?'aujourd\'hui':n+' j'}</span>`}</td><td>${stage(v)}<small style="display:block;color:var(--muted);font-size:.74rem;margin-top:2px">${esc(v.place)}</small></td>${trackCells(v,'a')}</tr>`}).join('');
        if(co.length) body+=`<tr class="divider"><td colspan="10">En commande (${co.length}) · pas encore d'ETA</td></tr>`+co.map(v=>`<tr${rowAttr(v)}><td class="idx">${++i}</td>${verCell(v)}<td class="mono">${esc(v.order)}</td><td class="mono z">—</td><td class="num mono">—</td><td class="num"><span class="pill p-n">prod. ${fmtM(v.pmon)}</span></td><td><span class="pill ${v.g==='S'?'p-warn':'p-n'}">${v.g==='S'?'Commande vendue':'DVOS'}</span></td>${trackCells(v,'a')}</tr>`).join('');
      } else {
        g.sort((a,b)=>b.age-a.age);
        const avg=Math.round(g.reduce((s,v)=>s+v.age,0)/g.length);
        const sv=g.filter(isSold).length;meta=`${g.length-sv} en stock${sv?` (+ ${sv} vendu${sv>1?'s':''})`:''} · âge moyen ${avg} j · plus vieux ${g[0].age} j`;
        head='<th>#</th><th>Version</th><th>Couleur ext. / int.</th><th>NIV</th><th>Stock</th><th class="num">Âge</th><th>Arrivé (facturé)</th><th>Statut</th>'+trackHeadD;
        body=g.map((v,i)=>`<tr${rowAttr(v)}><td class="idx">${i+1}</td>${verCell(v)}<td class="mono">${esc(v.vin)}</td>${stockCell(v)}<td class="num"><span class="pill ${ageCls(v.age)}">${v.age} j</span></td><td class="mono">${fmtDY(iso(addD(TODAY,-v.age)))}</td><td>${statut(v)}${v.recall?' <span class="pill p-bad" title="Rappel ouvert">Rappel</span>':''}</td>${trackCells(v,'s',true)}</tr>`).join('');
      }
      sec+=`<section class="model"><div class="model-h"><h2>${esc(m)}</h2><span class="meta">${meta}</span></div><div class="tbl"><table class="veh"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`;
    }
    if(sec) html+=`<div class="sec-title">${label}</div>`+sec;
  }
  document.getElementById('list').innerHTML=html||'<div class="empty">Aucun véhicule ne correspond à ce filtre.</div>';
}

function incoming(){
  const tr=V.filter(isTr).sort((a,b)=>(a.eta||'9').localeCompare(b.eta||'9')||a.model.localeCompare(b.model));
  let lastW=-1, i=0;
  const body=tr.map(v=>{
    const w=weekOf(v.eta), n=v.eta?daysTo(v.eta):null;
    let sep='';
    if(w!==lastW){lastW=w;const c=tr.filter(x=>weekOf(x.eta)===w).length;sep=`<tr class="divider"><td colspan="12">${w<4?(w===0?'Cette semaine':'Semaine du '+fmtD(WEEKS[w].a)):'Après le '+fmtD(lastWeekEnd)} · ${c} auto${c>1?'s':''}</td></tr>`}
    return sep+`<tr${rowAttr(v)}><td class="idx">${++i}</td><td class="num mono">${fmtD(v.eta)}</td><td class="num">${n==null?'—':`<span class="pill ${etaCls(n)}">${n<0?'dépassé '+(-n)+' j':n+' j'}</span>`}</td><td><b>${esc(v.model)}</b></td>${verCell(v)}<td class="mono">${esc(v.vin)}</td>${stockCell(v)}<td>${stage(v)}</td><td>${esc(v.place||'—')}</td>${trackCells(v,'i')}</tr>`;
  }).join('');
  document.getElementById('incoming').innerHTML=`<div class="model-h"><h2>Toutes les autos qui s'en viennent</h2><span class="meta">${tr.length} autos en transit, triées par ETA</span></div><div class="tbl"><table class="veh"><thead><tr><th>#</th><th class="num">ETA</th><th class="num">Dans</th><th>Modèle</th><th>Version</th><th>Couleur ext. / int.</th><th>NIV</th><th>Stock</th><th>Arrivage</th><th>Lieu actuel</th>${trackHead}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---- Board de ventes ----
const MOIS_L=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
let VMONTH=new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'}).slice(0,7), CFG={objectif:66,objMoy:1500,fiEmails:{}};
const REPS=['MICK','ALEX M','ALEX D','NINA','SEB','PAT','SAM','WILL','CHARBEL','HOUSE'], FIS=['MEL','KEV','ISA'], DIRS=['OMAR','BLACK','MICK','ALEX'], SRCS=['UP','CLIENT MAISON','WEB','TÉLÉPHONE','RÉFÉRENCE','DEALER TRADE'];
const STATUTS=[['vendu','Vendu'],['commande','Commande'],['comptabilise','Comptabilisé'],['dealer','Dealer trade'],['cancel','Annulé']];
const num=x=>{const n=parseFloat(String(x??'').replace(/\s/g,'').replace(',','.'));return isNaN(n)?0:n};
const effF=x=>{x=x||{};return String(x.frontM??'').trim()?num(x.frontM):num(x.front)};
const money=n=>n.toLocaleString('fr-CA',{maximumFractionDigits:0})+' $';
const saleMonth=n=>((n&&n.soldAt)||SNAP).slice(0,7);
function allSales(){return [...V,...extraVehicles()].filter(v=>NOTES[keyOf(v)]?.vendu).map(v=>({v,k:keyOf(v),n:NOTES[keyOf(v)]})).sort((a,b)=>(a.n.soldAt||'').localeCompare(b.n.soldAt||'')||a.v.model.localeCompare(b.v.model))}
function salesRows(){
  return [...V,...extraVehicles()].filter(v=>NOTES[keyOf(v)]?.vendu).map(v=>({v,k:keyOf(v),n:NOTES[keyOf(v)]})).filter(r=>!VMONTH||saleMonth(r.n)===VMONTH)
   .sort((a,b)=>(a.n.soldAt||'').localeCompare(b.n.soldAt||'')||a.v.model.localeCompare(b.v.model));
}
function prevMonth(m){if(!m)return null;const y=+m.slice(0,4),mo=+m.slice(5);return mo===1?`${y-1}-12`:`${y}-${String(mo-1).padStart(2,'0')}`}
function carryRows(){const p=prevMonth(VMONTH);return p?allSales().filter(r=>saleMonth(r.n)===p&&(r.n.vente?.livraison||'').slice(0,7)===VMONTH):[]}
const hasFM=x=>!!String((x||{}).frontM??'').trim();
function ventesSummary(){
  const el=document.getElementById('vsum'); if(!el) return;
  const alive=r=>(r.n.vente?.statut||'vendu')!=='cancel';
  const mrows=salesRows().filter(alive), crows=carryRows().filter(alive), live=[...mrows,...crows];
  const comp=live.filter(r=>hasFM(r.n.vente)), fmTot=comp.reduce((a,r)=>a+num(r.n.vente.frontM),0);
  const tf=live.reduce((a,r)=>a+effF(r.n.vente),0), bk=live.map(r=>num(r.n.vente?.back)), tb=bk.reduce((a,b)=>a+b,0), nb=bk.filter(x=>x).length;
  const livre=live.filter(r=>(r.n.vente?.livraison||'').slice(0,7)===VMONTH||(!VMONTH&&r.n.vente?.livraison)).length, rdr=[...salesRows(),...carryRows()].filter(r=>r.n.vente?.rdrOk&&(!VMONTH||(r.n.vente.rdrAt||'').slice(0,7)===VMONTH)).length;
  const obj=num(CFG.objectif)||0, pct=obj?Math.round(mrows.length/obj*100):0;
  const group=(f)=>{const m={};live.forEach(r=>{const x=r.n.vente||{};const names=String(x[f]||'').toUpperCase().split(/[-\/]/).map(z=>z.trim()).filter(Boolean);const w=names.length?1/names.length:0;names.forEach(nm=>{m[nm]=m[nm]||{d:0,fm:0,fc:0,b:0,bc:0};m[nm].d+=w;if(hasFM(x)){m[nm].fm+=num(x.frontM)*w;m[nm].fc+=w}if(num(x.back)){m[nm].b+=num(x.back)*w;m[nm].bc+=w}})});return Object.entries(m).sort((a,b)=>b[1].d-a[1].d)};
  const fmtD=d=>Number.isInteger(d)?d:d.toFixed(1);
  const avg=(x,col)=>col==='f'?(x.fc?money(x.fm/x.fc):'—'):(x.bc?money(x.b/x.bc):'—');
  const board=(title,list,col,lab)=>`<div class="vbox"><h3>${title}</h3>${list.length?`<table class="mini"><tr><th></th><th class="num">Deals</th><th class="num">${lab}</th></tr>${list.map(([nm,x],i)=>`<tr><td>${i===0?'<span class="top">TOP 1</span> ':''}${esc(nm)}</td><td class="num">${fmtD(x.d)}</td><td class="num">${avg(x,col)}</td></tr>`).join('')}</table>`:'<p class="hint">Rien encore ce mois-ci.</p>'}</div>`;
  el.innerHTML=`<div class="kpis vk">
    <div class="kpi"><b>${mrows.length}<small> / ${obj||'—'}</small></b><span>Vendus ce mois · objectif ${pct}% · + ${crows.length} carry over (total ${live.length})</span><div class="bar"><i style="width:${Math.min(100,pct)}%"></i></div></div>
    <div class="kpi"><b>${livre}</b><span>Livrés ce mois</span></div>
    <div class="kpi"><b>${rdr}</b><span>RDR faits ce mois</span></div>
    <div class="kpi"><b>${comp.length?money(fmTot/comp.length):'—'}</b><span>Moyenne front comptabilisé (Front Marjo) · ${comp.length} deal${comp.length>1?'s':''} · obj. ${money(num(CFG.objMoy))}</span></div>
    <div class="kpi"><b>${nb?money(tb/nb):'—'}</b><span>Moyenne back</span></div>
    <div class="kpi"><b>${money(tf+tb)}</b><span>Total profit · front ${money(tf)} · back ${money(tb)}</span></div>
  </div>
  <div class="vboards">${board('Représentants',group('rep'),'f','Moy. front compt.')}${board('F&amp;I',group('fi'),'b','Moy. back')}${board('Directeurs',group('dir'),'f','Moy. front compt.')}</div>`;
}
function calLink(r){const v=r.v,n=r.n,x=n.vente||{};if(!x.livraison)return null;
  const d=x.livraison.replace(/-/g,''),[hh,mm]=(x.heure||'10:00').split(':').map(Number),end=hh*60+mm+60;
  const t=(h,m)=>String(h).padStart(2,'0')+String(m).padStart(2,'0')+'00';
  const client=(x.client&&x.client.trim())?x.client:(n.comment||'');const model=(x.model||v.model),stock=(x.stock||STOCK[v.vin]||'');
  const title=`Livraison ${client||'client'} – ${model}${stock?' #'+stock:''}`;
  const det=[`Client : ${client||'—'}`,`Représentant : ${x.rep||'—'}`,`F&I : ${x.fi||'—'}`,`Véhicule : ${x.annee||v.year} ${model} ${x.gamme||v.ver}`,`Couleur : ${x.couleur||colorName(v.ext)}`,`Stock : ${stock||'—'}`,`NIV : ${v.vin||x.niv||'—'}`].join('\n');
  const fiMail=(CFG.fiEmails||{})[(x.fi||'').toUpperCase().trim()];
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE'+(fiMail?'&add='+encodeURIComponent(fiMail):'')+'&text='+encodeURIComponent(title)+'&dates='+d+'T'+t(hh,mm)+'/'+d+'T'+t(Math.floor(end/60),end%60)+'&ctz=America/Toronto&details='+encodeURIComponent(det);}
function calCell(r){const x=r.n.vente||{},k=r.k;
  if(CALBUSY[k]) return '<span class="calbtn">… Agenda</span>';
  if(x.calId) return x.calLink?`<a class="calbtn done" href="${esc(x.calLink)}" target="_blank" rel="noopener" title="Dans l'agenda${x.calFi?' · invité '+esc(x.calFi):''}">✓ Agenda</a>`:`<span class="calbtn done" title="Dans l'agenda${x.calFi?' · invité '+esc(x.calFi):''}">✓ Agenda</span>`;
  if(CALERR[k]) return `<button class="calbtn err" data-calretry="${k}" title="${esc(CALERR[k])}">Réessayer</button>`;
  const u=calLink(r);if(!u)return '<span class="z">—</span>';
  if(MCP&&!x.heure) return '<span class="z" title="Entrez l\'heure pour créer l\'événement">heure ?</span>';
  const done=x.cal;const fm=(CFG.fiEmails||{})[(x.fi||'').toUpperCase().trim()];return `<a class="calbtn${done?' done':''}" title="${fm?'Invite '+esc(fm):'Aucun courriel F&amp;I : ajoutez-le dans « Courriels F&amp;I »'}" href="${u}" target="_blank" rel="noopener" data-cal="${k}">${done?'✓ Ajouté':'+ Agenda'}</a>`}
// ---- Création automatique dans Google Agenda (connecteur) ----
let MCP=null; const CALBUSY={}, CALERR={}, calTimers={};
(async()=>{try{MCP=await window.claude?.use?.('mcp')}catch(e){MCP=null} if(MCP&&tab==='ventes') ventesView()})();
function refreshCal(k){const c=document.getElementById('cal-'+k);const v=vehOf(k);if(c&&v)c.innerHTML=calCell({v,k,n:NOTES[k]})}
function calBody(k){const v=vehOf(k),n=NOTES[k],x=n.vente||{};
  const [hh,mm]=(x.heure||'10:00').split(':').map(Number),e=hh*60+mm+60,p=z=>String(z).padStart(2,'0');
  const client=(x.client&&x.client.trim())?x.client:(n.comment||''),model=x.model||v.model,stock=x.stock||STOCK[v.vin]||'';
  return {summary:`Livraison ${client||'client'} – ${model}${stock?' #'+stock:''}`,
    startTime:`${x.livraison}T${p(hh)}:${p(mm)}:00`,endTime:`${x.livraison}T${p(Math.floor(e/60))}:${p(e%60)}:00`,timeZone:'America/Toronto',
    description:[`Client : ${client||'—'}`,`Représentant : ${x.rep||'—'}`,`F&I : ${x.fi||'—'}`,`Véhicule : ${x.annee||v.year} ${model} ${x.gamme||v.ver}`,`Couleur : ${x.couleur||colorName(v.ext)}`,`Stock : ${stock||'—'}`,`NIV : ${v.vin||x.niv||'—'}`].join('\n')};}
async function syncCal(k){
  const x=NOTES[k]?.vente||{}; if(!MCP||!x.livraison||!x.heure||CALBUSY[k]) return;
  const fiMail=(CFG.fiEmails||{})[(x.fi||'').toUpperCase().trim()]||'';
  const b=calBody(k); CALBUSY[k]=1; delete CALERR[k]; refreshCal(k);
  try{
    let id=x.calId, link=x.calLink||'';
    if(id&&id!=='cree'){ const upd={eventId:id,...b};
      if(fiMail!==(x.calFi||'')){ if(fiMail) upd.addedAttendees=[{email:fiMail}]; if(x.calFi) upd.removedAttendeeEmails=[x.calFi]; }
      await MCP.callTool('Google Calendar','update_event',upd,{cache:false});
    } else if(!id){
      const res=await MCP.callTool('Google Calendar','create_event',{...b,...(fiMail?{attendees:[{email:fiMail}],notificationLevel:'ALL'}:{})},{cache:false});
      let p=res&&res.payload; if(typeof p==='string'){try{p=JSON.parse(p)}catch(e){}}
      const ev=(p&&(p.event||p))||{}; id=ev.id||ev.eventId||(p&&p.id)||''; link=ev.htmlLink||ev.link||'';
      if(!id) id='cree';
    }
    NOTES[k]={...NOTES[k],vente:{...(NOTES[k].vente||{}),calId:id,calLink:link,calFi:fiMail,cal:1}};
    delete CALBUSY[k]; refreshCal(k); saveNote(k); setStatus('Livraison ajoutée à Google Agenda');
  }catch(e){ delete CALBUSY[k]; CALERR[k]=(e&&e.code==='not_granted')?'Accès à Google Agenda refusé':((e&&e.message)||'Erreur Google Agenda'); refreshCal(k); }
}
document.addEventListener('focusin',e=>{const i=e.target;if(i.dataset&&i.dataset.f==='statut')i.dataset.prev=i.value});
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-calretry]');if(b){delete CALERR[b.dataset.calretry];syncCal(b.dataset.calretry)}});
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[data-cal]');if(!a)return;const k=a.dataset.cal;NOTES[k]={...(NOTES[k]||{}),vente:{...(NOTES[k]?.vente||{}),cal:1}};a.classList.add('done');a.textContent='✓ Ajouté';saveNote(k)});
const rowCls=x=>'st-'+(x.statut||'vendu')+(x.livraison?' livre':'')+(String(x.frontM||'').trim()?' marjo':'');
function vIn(k,f,val,attrs=''){return `<input ${attrs.includes('class=')?'':'class="vi"'} id="v-${f}-${k}" data-vk="${k}" data-f="${f}" value="${esc(val??'')}" ${attrs} ${DB?'':'disabled'} aria-label="${f}">`}
function ventesView(){
  let rows=salesRows();
  const months=[...new Set([SNAP.slice(0,7),...Object.values(NOTES).filter(n=>n.vendu).map(saleMonth)])].sort().reverse();
  const head=`<div class="vhead"><h2>Ventes neuf ${VMONTH?MOIS_L[+VMONTH.slice(5)-1]+' '+VMONTH.slice(0,4):'— tous les mois'}</h2>
    <label>Mois <select id="vmonth">${months.map(m=>`<option value="${m}" ${m===VMONTH?'selected':''}>${MOIS_L[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('')}<option value="" ${!VMONTH?'selected':''}>Tous</option></select></label>
    <label>Objectif <input id="vobj" class="vi s" value="${esc(CFG.objectif)}" inputmode="numeric" ${DB?'':'disabled'}></label>
    <label>Obj. front <input id="vobjm" class="vi s" value="${esc(CFG.objMoy)}" inputmode="numeric" ${DB?'':'disabled'}></label>
    <details class="fimail"><summary>Courriels F&amp;I (agenda)</summary><div class="fim">${[...new Set([...FIS,...Object.keys(CFG.fiEmails||{})])].map(nm=>`<label>${esc(nm)} <input class="vi l fie" id="fie-${esc(nm)}" data-fi="${esc(nm)}" type="email" value="${esc((CFG.fiEmails||{})[nm]||'')}" placeholder="courriel@hyundaistconstant.com" ${DB?'':'disabled'}></label>`).join('')}<p class="hint">L'événement de livraison est envoyé en invitation au F&amp;I de la vente.</p></div></details></div>
    <div id="vsum"></div>
    <datalist id="dl-rep">${REPS.map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="dl-fi">${FIS.map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="dl-dir">${DIRS.map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="dl-src">${SRCS.map(x=>`<option value="${x}">`).join('')}</datalist>`;
  const prevM=prevMonth(VMONTH);
  const isCx=r=>(r.n.vente?.statut||'vendu')==='cancel';
  const carryAll=carryRows(), cancelled=[...rows,...carryAll].filter(isCx), carry=carryAll.filter(r=>!isCx(r));
  rows=rows.filter(r=>!isCx(r));
  const rowHtml=(r,i)=>{const v=r.v,k=r.k,x=r.n.vente||{},st=x.statut||'vendu',tot=st==='cancel'?0:effF(x)+num(x.back);
    const dv=(f,def)=>(x[f]!=null&&String(x[f]).trim()!=='')?x[f]:def;
    return `<tr data-vrow="${k}" class="${rowCls(x)}"><td class="idx">${i+1}</td>
    <td>${vIn(k,'rep',x.rep,'list="dl-rep"')}</td><td>${vIn(k,'fi',x.fi,'list="dl-fi" class="vi s"')}</td><td>${vIn(k,'dir',x.dir,'list="dl-dir"')}</td><td>${vIn(k,'source',x.source,'list="dl-src"')}</td>
    <td>${vIn(k,'client',(x.client&&x.client.trim())?x.client:(r.n.comment||''),'class="vi l" placeholder="Écrire dans Commentaire"')}</td>
    <td>${vIn(k,'model',dv('model',v.model),'list="dl-model" class="vi b"')}</td><td>${vIn(k,'gamme',dv('gamme',v.ver),'class="vi l"')}</td><td>${vIn(k,'couleur',dv('couleur',colorName(v.ext)),'class="vi l2"')}</td><td>${vIn(k,'annee',dv('annee',v.year),'inputmode="numeric" class="vi s"')}</td>
    <td>${vIn(k,'stock',dv('stock',STOCK[v.vin]||''),'class="vi m stkin" placeholder="'+(v.order?'CMD':'à entrer')+'"')}</td><td>${vIn(k,'niv',dv('niv',v.vin?v.vin.slice(-8):''),'class="vi m mono"')}</td>
    <td>${vIn(k,'dateFi',x.dateFi,'type="date"')}</td><td>${vIn(k,'livraison',x.livraison,'type="date"')}</td><td class="c-sold"><input type="checkbox" class="rdrcb" id="v-rdrOk-${k}" data-vk="${k}" data-f="rdrOk" aria-label="RDR fait" title="${x.rdrAt?'RDR le '+esc(x.rdrAt):'Cocher quand le RDR est fait'}" ${x.rdrOk?'checked':''} ${DB?'':'disabled'}></td><td>${vIn(k,'heure',x.heure,'type="time" class="vi t"')}</td><td id="cal-${k}" class="calc">${calCell(r)}</td>
    <td>${vIn(k,'front',x.front,'inputmode="decimal" class="vi m"')}</td><td>${vIn(k,'frontM',x.frontM,'inputmode="decimal" class="vi m"')}</td><td>${vIn(k,'back',x.back,'inputmode="decimal" class="vi m"')}</td>
    <td class="num tot" id="tot-${k}">${tot?money(tot):'—'}</td>
    <td><select class="vi" id="v-statut-${k}" data-vk="${k}" data-f="statut" ${DB?'':'disabled'}>${STATUTS.map(([val,l])=>`<option value="${val}" ${st===val?'selected':''}>${l}</option>`).join('')}</select></td>
    <td>${vIn(k,'soldAt',r.n.soldAt||SNAP,'type="date"')}</td></tr>`};
  const thead=`<thead><tr><th>#</th><th>Représentant</th><th>F&amp;I</th><th>Dir</th><th>Source</th><th>Nom du client</th><th>Modèle</th><th>Gamme</th><th>Couleur</th><th>Année</th><th>Stock</th><th>NIV</th><th>Date F&amp;I</th><th>Livraison</th><th>RDR</th><th>Heure</th><th>Agenda</th><th class="num">Front</th><th class="num">Front Marjo</th><th class="num">Back</th><th class="num">Total</th><th>Statut</th><th>Vendu le</th></tr></thead>`;
  const carryHtml=prevM?`<div class="sec-title">Carry over de ${MOIS_L[+prevM.slice(5)-1]} · vendus en ${MOIS_L[+prevM.slice(5)-1]}, livrés en ${MOIS_L[+VMONTH.slice(5)-1]} (${carry.length})</div><section class="model carry"><div class="tbl"><table class="veh vt">${thead}<tbody>${carry.map((r,i)=>rowHtml(r,i).replace('data-vrow=','data-vrow-c="1" data-vrow=')).join('')||`<tr><td colspan="23" class="empty-row">Aucun carry over : les ventes de ${MOIS_L[+prevM.slice(5)-1]} apparaissent ici dès qu'on entre une date de livraison en ${MOIS_L[+VMONTH.slice(5)-1]}.</td></tr>`}</tbody></table></div></section><div class="sec-title">Ventes de ${MOIS_L[+VMONTH.slice(5)-1]} (${rows.length})</div>`:'';
  const body=rows.map(rowHtml).join('');
  document.getElementById('list').innerHTML=head+`<datalist id="dl-model">${models.map(m=>`<option value="${esc(m)}">`).join('')}</datalist>`+carryHtml+`<section class="model"><div class="tbl"><table class="veh vt">${thead}<tbody>${body||`<tr><td colspan="23" class="empty-row">Aucune vente ${VMONTH?'ce mois-ci':''}. Cochez <b>Vendu</b> sur une auto dans les onglets Arrivages ou En stock : elle apparaîtra ici.</td></tr>`}</tbody></table></div></section>
    ${cancelled.length?`<div class="sec-title">Ventes annulées (${cancelled.length}) · non comptées dans les totaux</div><section class="model cx"><div class="tbl"><table class="veh vt">${thead}<tbody>${cancelled.map(rowHtml).join('')}</tbody></table></div></section>`:''}
    <p class="hint">Légende : <span class="pill p-ok">Front Marjo entré</span> <span class="pill p-liv">Livré</span> <span class="pill p-ok">Comptabilisé</span> <span class="pill p-n">Commande</span> <span class="pill p-warn">Dealer trade</span> <span class="pill p-bad">Annulé</span>. Décocher Vendu retire l'auto du board de ventes (les infos sont gardées si on la recoche).</p>`;
  ventesSummary();
  const sel=document.getElementById('vmonth'); sel.onchange=()=>{VMONTH=sel.value;ventesView()};
}
const vTimers={};
async function saveCfg(){ if(!DB) return; try{await DB.doc('config/ventes').set({objectif:num(CFG.objectif),objMoy:num(CFG.objMoy),fiEmails:CFG.fiEmails||{}});setStatus('Enregistré')}catch(e){setStatus('Objectif non enregistré')} }
document.addEventListener('input',e=>{const i=e.target;
  if(i.dataset&&i.dataset.fi){CFG.fiEmails={...(CFG.fiEmails||{}),[i.dataset.fi]:i.value.trim()};document.querySelectorAll('td.calc').forEach(c=>{const k=c.id.slice(4),v=vehOf(k);if(v)c.innerHTML=calCell({v,k,n:NOTES[k]})});clearTimeout(vTimers.cfg);vTimers.cfg=setTimeout(saveCfg,800);return}
  if(i.id==='vobj'||i.id==='vobjm'){CFG[i.id==='vobj'?'objectif':'objMoy']=i.value;ventesSummary();clearTimeout(vTimers.cfg);vTimers.cfg=setTimeout(saveCfg,800);return}
  if(!i.dataset||!i.dataset.vk) return; const k=i.dataset.vk,f=i.dataset.f;
  if(f==='soldAt'){NOTES[k]={...(NOTES[k]||{}),soldAt:i.value};clearTimeout(vTimers[k]);vTimers[k]=setTimeout(()=>saveNote(k),0);setTimeout(()=>{if(document.activeElement!==i)ventesView()},50);i.addEventListener('blur',()=>ventesView(),{once:true});return}
  if(i.type==='checkbox'){const o=NOTES[k]?.vente||{};NOTES[k]={...(NOTES[k]||{}),vente:{...o,[f]:i.checked,...(f==='rdrOk'?{rdrAt:i.checked?(o.rdrAt||new Date().toISOString().slice(0,10)):''}:{})}};ventesSummary();clearTimeout(vTimers[k]);vTimers[k]=setTimeout(()=>saveNote(k),0);return}
  NOTES[k]={...(NOTES[k]||{}),vente:{...(NOTES[k]?.vente||{}),[f]:i.value}};
  if(f==='stock'||f==='gamme'){document.querySelectorAll(`input[data-f="${f}"][data-vk="${k}"]`).forEach(o=>{if(o!==i)o.value=i.value})}
  if(['livraison','heure','rep','fi','client','model','stock'].includes(f)){refreshCal(k);const xx=NOTES[k].vente;if(MCP&&xx.livraison&&xx.heure&&(xx.calId||f==='livraison'||f==='heure')){clearTimeout(calTimers[k]);calTimers[k]=setTimeout(()=>syncCal(k),2500)}}
  if(f==='frontM'){const x=NOTES[k].vente,st=x.statut||'vendu',has=!!String(i.value).trim();
    if(has&&st!=='cancel'&&st!=='comptabilise') x.statut='comptabilise';
    else if(!has&&st==='comptabilise') x.statut='vendu';
    const sel=document.getElementById('v-statut-'+k); if(sel) sel.value=x.statut||'vendu';
    const tr=document.querySelector(`tr[data-vrow="${k}"]`); if(tr) tr.className=rowCls(x);}
  if(['front','frontM','back'].includes(f)){const x=NOTES[k].vente,t=effF(x)+num(x.back);const c=document.getElementById('tot-'+k);if(c)c.textContent=t?money(t):'—'}
  if(f==='statut'){const was=i.dataset.prev;setTimeout(()=>{if((i.value==='cancel')!==(was==='cancel'))ventesView()},0)}
  if(['statut','livraison','frontM'].includes(f)){const tr=document.querySelector(`tr[data-vrow="${k}"]`);if(tr)tr.className=rowCls(NOTES[k].vente)}
  ventesSummary(); clearTimeout(vTimers[k]); vTimers[k]=setTimeout(()=>saveNote(k), i.tagName==='SELECT'||i.type==='date'?0:800);
});
(async()=>{ try{ const db=await window.claude?.use?.('db'); if(!db) return; db.doc('config/ventes').onSnapshot(s=>{ if(s.exists){const x=s.data()||{}; if(document.activeElement?.id!=='vobj'&&document.activeElement?.id!=='vobjm'){if(!document.activeElement?.dataset?.fi) CFG={objectif:x.objectif??66,objMoy:x.objMoy??1500,fiEmails:x.fiEmails||{}}; if(tab==='ventes'){const a=document.getElementById('vobj'),b=document.getElementById('vobjm');if(a)a.value=CFG.objectif;if(b)b.value=CFG.objMoy;ventesSummary()}}} }); }catch(e){} })();


// ---- Copie en direct vers le Google Sheet du mois ----
let EXPORTS={}, SHEET_T=null, SHEET_BUSY=false, SHEET_AGAIN=false;
(async()=>{try{const db=await window.claude?.use?.('db');if(!db)return;db.doc('config/exports').onSnapshot(s=>{EXPORTS=s.exists?(s.data()||{}):{}})}catch(e){}})();
function scheduleSheet(){clearTimeout(SHEET_T);SHEET_T=setTimeout(syncSheet,5000)}
function sheetRows(month){
  const p=prevMonth(month), ST={vendu:'Vendu',commande:'Commande',comptabilise:'Comptabilisé',dealer:'Dealer trade',cancel:'Annulé'};
  const nn=v=>{const s=String(v??'').trim().replace(/\s/g,'').replace(',','.');if(!s)return '';const f=Number(s);return isNaN(f)?String(v):f};
  const out=[];
  for(const r of allSales()){const n=r.n,x=n.vente||{},v=r.v,sold=(n.soldAt||'').slice(0,10),liv=x.livraison||'';
    let sec=sold.slice(0,7)===month?'Ventes du mois':(sold.slice(0,7)===p&&liv.slice(0,7)===month?'Carry over':null); if(!sec)continue;
    const st=ST[x.statut||'vendu']||'Vendu'; if(st==='Annulé')sec='Annulée';
    const g=(f,d)=>String((x[f]!=null&&String(x[f]).trim()!=='')?x[f]:(d??'')).trim();
    out.push([sec,g('rep'),g('fi'),g('dir'),g('source'),g('client',n.comment),g('model',v.model),g('gamme',v.ver),g('couleur',colorName(v.ext||'')),nn(g('annee',v.year)),g('stock',STOCK[v.vin]||''),g('niv',v.vin?v.vin.slice(-8):''),g('dateFi'),liv,x.rdrOk?'Oui':'',nn(x.front),nn(x.frontM),nn(x.back),st,sold]);}
  const ord={'Carry over':0,'Ventes du mois':1,'Annulée':2};
  out.sort((a,b)=>ord[a[0]]-ord[b[0]]||String(a[19]).localeCompare(String(b[19]))||String(a[6]).localeCompare(String(b[6])));
  return out.map((r,i)=>{const k=i+2;return [...r.slice(0,18),`=IF(A${k}="Annulée","",IF(Q${k}<>"",Q${k},P${k}))`,`=IF(A${k}="Annulée","",N(S${k})+N(R${k}))`,...r.slice(18)]});
}
async function syncSheet(){
  if(SHEET_BUSY){SHEET_AGAIN=true;return}
  const now=new Date(), month=now.toLocaleDateString('en-CA',{timeZone:'America/Toronto'}).slice(0,7), id=EXPORTS[month];
  if(!id||!MCP) return;
  SHEET_BUSY=true;
  try{
    const H=['Section','Représentant','F&I','Dir','Source','Nom du client','Modèle','Gamme','Couleur','Année','Stock','NIV','Date F&I','Livraison','RDR','Front','Front Marjo','Back','Front retenu','Total','Statut','Vendu le'];
    const rows=sheetRows(month);
    await MCP.callTool('Google Sheets','batch_clear_values',{spreadsheetId:id,ranges:['Ventes!A2:V2000']},{cache:false});
    await MCP.callTool('Google Sheets','update_values',{spreadsheetId:id,range:`Ventes!A1:V${rows.length+1}`,values:[H,...rows]},{cache:false});
    const stamp=now.toLocaleString('sv-SE',{timeZone:'America/Toronto'}).slice(0,16);
    await MCP.callTool('Google Sheets','update_values',{spreadsheetId:id,range:'Sommaire!B5:C5',values:[[stamp,'Mis à jour en direct depuis le board']]},{cache:false});
    const el=document.getElementById('sheetsrc'); if(el) el.textContent='Google Sheet du mois mis à jour à '+stamp.slice(11);
  }catch(e){const el=document.getElementById('sheetsrc'); if(el) el.textContent='Google Sheet non mis à jour'+(e&&e.code==='not_granted'?' (accès Google Sheets refusé)':'')+' · la copie planifiée prendra le relais';}
  finally{SHEET_BUSY=false; if(SHEET_AGAIN){SHEET_AGAIN=false;scheduleSheet()}}
}

// ---- Inventaire partagé + bouton « Mettre à jour depuis HACC » ----
let INV_STAMP='';
function setSnapAt(at){const el=document.getElementById('snap');if(!el||!at)return;const d=new Date(at);el.textContent='Inventaire HACC mis à jour le '+d.toLocaleDateString('fr-CA',{timeZone:'America/Toronto',day:'numeric',month:'long',year:'numeric'})+' à '+d.toLocaleTimeString('fr-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'})}
(async()=>{try{const db=await window.claude?.use?.('db');if(!db)return;db.doc('inventaire/actuel').onSnapshot(sn=>{if(!sn.exists)return;const x=sn.data()||{};if(!x.json||!x.date||x.date<SNAP||x.at===INV_STAMP)return;
  let rows;try{rows=JSON.parse(x.json)}catch(e){return}if(!Array.isArray(rows)||rows.length<20)return;
  INV_STAMP=x.at;applyInventory(rows,x.date);setSnapAt(x.at);
  render();incoming();loadStock();})}catch(e){}})();
const HACC='https://salesportal-hacc.am.hyundai-corp.io', HACC_PAGE=HACC+'/salesportal/index.html#/dealerstocklist';
const SEL_L=['ZZLCAR_TXT','ZZMDYEAR','LSCCD_TXT','ZZEXTCL_TXT','ZZINTCL_TXT','VHVIN','ZODRNO','VBELN','LOCTNT','LGORTX','ZZETADT','AGING_DAYS','SOLD_STATUS','ZDEMO','ZPMON','RECALL_CNT','ZHOLDBAK'], SEL_O=['ZZLCAR_TXT','ZZMDYEAR','LSCCD_TXT','ZZEXTCL_TXT','ZZINTCL_TXT','ZODRNO','ZODRTYP_DESC','ZPMON'];
const haccUrl=(dt,loc,extra)=>`${HACC}/sap/opu/odata/sap/ZGWSDD77120_SRV/ZGWSDD77120_I_DATASet?sap-language=en&menu=dealerstocklist&rfc=ZFSDD_DP_LIST_DEALER_STK_DT&${dt==='S'?'$expand=T_ORDERS&$select='+SEL_O.map(f=>'T_ORDERS/'+f).join(','):'$expand=T_LIST&$select='+SEL_L.map(f=>'T_LIST/'+f).join(',')}&$format=json&$filter=I_BUKRS%20eq%20%271300%27%20and%20I_LANGU%20eq%20%27FR%27%20and%20I_DEALER%20eq%20%27B06AA31052%27%20and%20I_MDYEAR%20eq%20%27%27%20and%20I_VHVIN%20eq%20%27%27%20and%20I_MODEL%20eq%20%27%27%20and%20I_USAGE%20eq%20%27%27%20and%20I_LOCATION%20eq%20%27${loc}%27%20and%20I_HOLDBACK_FLG%20eq%20%27%27%20and%20I_UNSOLD%20eq%20%27%27%20and%20I_DTYPE%20eq%20%27${dt}%27`+(extra?`%20and%20I_AGING_RNG%20eq%20%27%27%20and%20I_LSCCD%20eq%20%27%27%20and%20I_TRIM%20eq%20%27%27%20and%20I_EXCOL%20eq%20%27%27%20and%20I_INCOL%20eq%20%27%27`:'');
function haccMsg(t,bad){const el=document.getElementById('haccmsg');if(el){el.textContent=t;el.classList.toggle('bad',!!bad)}}
let LAST_READ=null, HTAB=null;
const resTxt=r=>{const p=[];(r&&r.content||[]).forEach(c=>{if(c&&c.type==='text')p.push(c.text)});if(r&&r.payload!=null)p.push(typeof r.payload==='string'?r.payload:JSON.stringify(r.payload));if(r&&r.structuredContent)p.push(JSON.stringify(r.structuredContent));return p.join('\n')};
let NO_PREVIEW=false;
async function openHaccTab(mcp,url){if(NO_PREVIEW){HTAB=null;await mcp.callTool('host:claude_browser','navigate',{url},{cache:false});return null}let r;try{r=await mcp.callTool('host:claude_browser','preview_start',{url},{cache:false})}catch(e){NO_PREVIEW=true;HTAB=null;await mcp.callTool('host:claude_browser','navigate',{url},{cache:false});return null}const t=resTxt(r);let m=t.match(/tabId[^A-Za-z0-9_-]{0,6}([A-Za-z0-9_-]+)/);if(!m&&r&&r.payload&&r.payload.tabId)m=[0,r.payload.tabId];HTAB=m?m[1]:null;return HTAB}
const nav=async(mcp,url)=>{if(!HTAB){await openHaccTab(mcp,url);return}try{await mcp.callTool('host:claude_browser','navigate',{url,tabId:HTAB},{cache:false})}catch(e){if(e&&e.code==='not_granted')throw e;await openHaccTab(mcp,url)}};
async function readJsonPage(mcp,url){
  await nav(mcp,url);
  const res=await mcp.callTool('host:claude_browser','get_page_text',HTAB?{max_chars:3000000,tabId:HTAB}:{max_chars:3000000},{cache:false});
  const parts=[];(res.content||[]).forEach(c=>{if(c&&c.type==='text')parts.push(c.text)});if(typeof res.payload==='string')parts.push(res.payload);else if(res.payload)parts.push(JSON.stringify(res.payload));
  const txt=parts.join('\n');
  LAST_READ={len:txt.length,json:txt.indexOf('{"d"')>=0};
  const grab=t=>{const a=t.indexOf('{"d"');if(a<0)return null;let dep=0,str=false,esc=false;for(let i=a;i<t.length;i++){const c=t[i];if(str){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')str=false;continue}if(c==='"')str=true;else if(c==='{')dep++;else if(c==='}'){dep--;if(dep===0)return t.slice(a,i+1)}}return null};
  for(const t of [...parts,txt]){const j=grab(t);if(!j)continue;try{return JSON.parse(j).d.results[0]}catch(e){LAST_READ.parse=String(e&&e.message||e).slice(0,80)}}
  return null;
}
async function refreshHACC(){ window.HACC_APP && window.HACC_APP.openHaccHelp(); }
document.addEventListener('click',e=>{if(e.target&&e.target.id==='haccbtn')refreshHACC()});
(async()=>{const btn=document.getElementById('haccbtn');if(!btn)return;btn.hidden=true;try{const u=await window.claude?.use?.('user');const ok=u?(await Promise.resolve(u.canEdit())):false;btn.hidden=!ok}catch(e){btn.hidden=true}})();

function render(){kpis();matrix();tabsUI();list();['incoming','a-venir'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=(tab==='ventes')})}
incoming();
document.getElementById('q').oninput=e=>{q=e.target.value;list()};
render();

// ---- Synchro avec BOARD 2026 (Google Sheets) : nouvelles ventes + lignes vertes = Comptabilisé ----
const BOARD26='1tUgTC16T6uxK_2luFFnbOTI6SjeQk7-AQq7LEtZ_Ee8';
const MON_RX=[[/^janv/,1],[/^f[ée]v/,2],[/^mars/,3],[/^avr/,4],[/^mai/,5],[/^juin/,6],[/^juil/,7],[/^ao[uû]/,8],[/^sep/,9],[/^oct/,10],[/^nov/,11],[/^d[ée]c/,12]];
const normName=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function parseFrDate(s,refYM){const m=String(s||'').toLowerCase().trim().match(/^(\d{1,2})\s*(?:er)?\s*([a-zéûè]+)/);if(!m)return '';const mm=(MON_RX.find(([r])=>r.test(m[2]))||[])[1];if(!mm)return '';
  let y=+refYM.slice(0,4);if(mm>+refYM.slice(5)+1)y--;const d=+m[1];if(d<1||d>31)return '';return `${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function cellColor(c){const b=c&&c.effectiveFormat&&c.effectiveFormat.backgroundColor;if(!b)return '';const r=b.red||0,g=b.green||0,bl=b.blue||0;
  if(g>0.85&&r<0.3&&bl<0.3)return 'comptabilise';if(r>0.85&&g>0.85&&bl<0.3)return 'commande';if(r>0.85&&g>0.45&&g<0.75&&bl<0.3)return 'dealer';if(r>0.85&&g<0.3&&bl<0.3)return 'cancel';return ''}
let B26_BUSY=false;
async function syncBoard26(){
  if(B26_BUSY||!DB||!MCP)return; B26_BUSY=true; const el=document.getElementById('boardsrc');
  try{
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'}), ym=today.slice(0,7), mi=+ym.slice(5)-1;
    const up=MOIS_L[mi].toUpperCase(), names=[up+' NEUF', up.normalize('NFD').replace(/[̀-ͯ]/g,'')+' NEUF'];
    let grid=null, used='';
    for(const nm of [...new Set(names)]){try{const res=await MCP.callTool('Google Sheets','get_spreadsheet',{spreadsheetId:BOARD26,ranges:[`'${nm}'!A1:V300`],includeGridData:true,fields:['sheets.data.rowData.values.effectiveFormat.backgroundColor','sheets.data.rowData.values.formattedValue']},{cache:false});
      let p=res.payload;if(typeof p==='string'){try{p=JSON.parse(p)}catch(e){p=null}}if(!p||!p.sheets){const t=(res.content||[]).filter(c=>c&&c.type==='text').map(c=>c.text).join('');try{p=JSON.parse(t)}catch(e){}}
      const rd=p&&p.sheets&&p.sheets[0]&&p.sheets[0].data&&p.sheets[0].data[0]&&p.sheets[0].data[0].rowData;if(rd){grid=rd;used=nm;break}}catch(e){if(e&&e.code==='not_granted')throw e}}
    if(!grid)throw new Error('onglet introuvable');
    // index des ventes déjà dans le board (par nom de client)
    const byName={};Object.entries(NOTES).forEach(([k,n])=>{const nm=normName((n.vente&&n.vente.client)||n.comment);if(nm)byName[nm]=byName[nm]||k});
    const stockToVin={};V.forEach(v=>{if(v.vin&&STOCK[v.vin])stockToVin[STOCK[v.vin]]=v.vin});
    const byStock={};Object.entries(NOTES).forEach(([k,n])=>{const st=String((n.vente&&n.vente.stock)||'').replace(/\s/g,'');if(n.vendu&&/^\d{6}$/.test(st))byStock[st]=byStock[st]||k});
    const lev=(a,b)=>{if(Math.abs(a.length-b.length)>2)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]};
    const prevYM=(()=>{const d=new Date(+ym.slice(0,4),mi-1,1);return d.toISOString().slice(0,7)})();
    let sec='',headers=0,added=0,compta=0;
    for(let i=0;i<grid.length;i++){
      const cells=(grid[i]&&grid[i].values)||[],val=j=>String((cells[j]&&cells[j].formattedValue)||'').trim();
      const a=val(0).toUpperCase();
      if(/^CARRY OVER/.test(a)){sec='carry';continue} if(normName(a)===normName('VENTES '+up)){sec='mois';headers=0;continue}
      if(val(5).toUpperCase()==='NOM DU CLIENT'){headers++; if(sec==='mois'&&headers>1)sec='cancel'; continue}
      if(!sec)continue; const client=val(5); if(!client)continue;
      const color=cellColor(cells[5])||cellColor(cells[1]); const nm=normName(client);
      const stk0=val(10).replace(/\s/g,'');
      let exist=byName[nm];
      if(!exist&&/^\d{6}$/.test(stk0)){exist=byStock[stk0]||(stockToVin[stk0]&&NOTES[stockToVin[stk0]]&&NOTES[stockToVin[stk0]].vendu?stockToVin[stk0]:'')} // même no de stock = même vente
      if(!exist&&nm.length>=6){const mdl=normName(val(6));exist=(Object.entries(NOTES).find(([k2,n2])=>{const c2=normName((n2.vente&&n2.vente.client)||n2.comment);return c2&&c2.length>=6&&lev(c2,nm)<=2&&(!mdl||!n2.vente||!n2.vente.model||normName(n2.vente.model).slice(0,4)===mdl.slice(0,4))})||[])[0]} // faute de frappe dans le nom
      if(exist&&normName((NOTES[exist].vente&&NOTES[exist].vente.client)||NOTES[exist].comment)!==nm&&NOTES[exist].vendu){const n0=NOTES[exist];NOTES[exist]={...n0,comment:(normName(n0.comment)===normName(n0.vente&&n0.vente.client)||!n0.comment)?client:n0.comment,vente:{...(n0.vente||{}),client}};byName[nm]=exist;await saveNote(exist);compta++} // nom corrigé dans BOARD 2026
      if(exist&&sec==='carry'&&NOTES[exist].vendu&&document.activeElement?.dataset?.vk!==exist){ // carry over : la feuille BOARD 2026 fait foi
        const n0=NOTES[exist],v0={...(n0.vente||{})};let chg=false;
        const setF=(f,val,isNum)=>{if(!val)return;const cur=v0[f];if(isNum?(String(cur??'').trim()!==''&&num(cur)===num(val)):String(cur||'')===val)return;v0[f]=val;chg=true};
        const dF=parseFrDate(val(12),ym),dL=parseFrDate(val(13),ym);
        if(dF)setF('dateFi',dF);if(dL&&dL.slice(0,7)>=(n0.soldAt||'').slice(0,7))setF('livraison',dL);
        setF('front',val(14),true);setF('frontM',val(15),true);setF('back',val(16),true);
        ['rep','fi','dir'].forEach((f,j)=>setF(f,val(1+j)));
        if(chg){NOTES[exist]={...n0,vente:v0};await saveNote(exist);compta++}
      }
      if(exist){ // ligne verte → Comptabilisé
        const n=NOTES[exist];const st=(n.vente&&n.vente.statut)||'vendu';
        if(n.vendu&&color&&color!==st&&st!=='cancel'&&!(st==='comptabilise'&&color!=='cancel')){const fm=color==='comptabilise'?val(15):'';NOTES[exist]={...n,vente:{...(n.vente||{}),statut:color,...(fm&&!(n.vente&&n.vente.frontM)?{frontM:fm}:{})}};await saveNote(exist);compta++}
        continue}
      // nouvelle vente
      const stock=val(10), dateFi=parseFrDate(val(12),ym), liv=parseFrDate(val(13),ym);
      let k=(/^\d{6}$/.test(stock)&&stockToVin[stock])||''; if(k&&NOTES[k]&&NOTES[k].vendu)k='';
      if(!k)k='IMP-'+ym+'-'+nm.slice(0,40);
      const statut=sec==='cancel'?'cancel':(color||'vendu');
      const soldAt=dateFi||(sec==='carry'?prevYM+'-28':today);
      const vente={rep:val(1),fi:val(2),dir:val(3),source:val(4),client,model:val(6),gamme:val(7),couleur:val(8),annee:val(9),stock,niv:val(11),dateFi,livraison:liv,front:val(14),frontM:val(15),back:val(16),rdr:val(20),statut,importe:`BOARD 2026 ${used} ligne ${i+1}`};
      Object.keys(vente).forEach(f=>{if(vente[f]==='')delete vente[f]});
      NOTES[k]={vendu:true,comment:client,soldAt,vente};byName[nm]=k;if(/^\d{6}$/.test(stock))byStock[stock]=k;VKEYS.clear();await saveNote(k);added++;
    }
    if(el)el.textContent=`BOARD 2026 (${used}) vérifié à ${new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'})}`+(added?` · ${added} nouvelle${added>1?'s':''} vente${added>1?'s':''} ajoutée${added>1?'s':''}`:'')+(compta?` · ${compta} vente${compta>1?'s':''} mise${compta>1?'s':''} à jour`:'');
    if(added||compta){kpis();matrix();tabsUI();if(tab==='ventes'&&!document.activeElement?.dataset?.vk)list()}
  }catch(e){if(el)el.textContent='BOARD 2026 non vérifié'+(e&&e.code==='not_granted'?' (accès Google Sheets refusé)':'')}
  finally{B26_BUSY=false}
}
(async()=>{try{const u=await window.claude?.use?.('user');const ok=u?await Promise.resolve(u.canEdit()):false;if(!ok)return;
  const wait=()=>new Promise(r=>{const t=setInterval(()=>{if(DB&&MCP&&Object.keys(NOTES).length){clearInterval(t);r()}},500)});await wait();
  syncBoard26();setInterval(syncBoard26,5*60*1000);}catch(e){}})();
window.HACC_BOARD={applyInventory,render,incoming,loadStock,setSnapAt,haccMsg,setInvStamp:a=>{INV_STAMP=a}};
