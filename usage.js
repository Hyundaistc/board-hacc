const SNAP_AT="2000-01-01T00:00:00.000Z";
let INV=[];
let INV_AT=SNAP_AT;
const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const BOARD26='1tUgTC16T6uxK_2luFFnbOTI6SjeQk7-AQq7LEtZ_Ee8';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>{const n=parseFloat(String(x??'').replace(/[\s$]/g,'').replace(/,(?=\d{3}\b)/g,'').replace(',','.'));return isNaN(n)?0:n};
const money=n=>Math.round(n).toLocaleString('fr-CA')+' $';
const normName=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
// Règle des noms (représentant, F&I, directeur) : « ALEX M » et « MAHER » s'écrivent « ALEX » (ALEM M = faute de frappe). Appliquée à chaque
// enregistrement, dans les sommaires et aux ventes déjà entrées (rattrapage admin, normalizeNames). Les ventes partagées (ex. « ALEX M-PAT ») sont gérées.
const NOM_ALIAS={'ALEX M':'ALEX','ALEXM':'ALEX','ALEM M':'ALEX','MAHER':'ALEX'}, NOM_F=['rep','fi','dir'];
const canonNom=s=>String(s??'').split(/([-\/])/).map(p=>{const t=p.trim(),a=NOM_ALIAS[t.toUpperCase().replace(/\./g,'').replace(/\s+/g,' ')];return a?p.replace(t,a):p}).join('');
const canonVente=x=>{if(!x||typeof x!=='object')return x;let o=x;NOM_F.forEach(f=>{if(typeof x[f]==='string'){const c=canonNom(x[f]);if(c!==x[f]){if(o===x)o={...x};o[f]=c}}});return o};
const keyOf=r=>'S-'+normName(r.stock);
// Ventes hors inventaire : MAN-… = ajoutée à la main (bouton +), CX-… = vente annulée d'une auto remise en inventaire, U-… = importée de BOARD 2026
const isManual=k=>String(k||'').startsWith('MAN-');
const invOf=k=>INV.find(x=>keyOf(x)===k);
const todayTO=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const fmtAt=at=>{const d=new Date(at);return d.toLocaleDateString('fr-CA',{timeZone:'America/Toronto',day:'numeric',month:'long',year:'numeric'})+' à '+d.toLocaleTimeString('fr-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'})};
let COUTS=null, COUT_SRC='', PRETS={rows:[]}, NOTES={}, CFG={objectif:50,objMoy:1800}, DB=null, USER=null, MCP=null, CAN_EDIT=false;
let tab=location.hash==='#ventes'?'ventes':'inv', filt='tous', q='', sortK='days', sortDir=-1, VMONTH=todayTO().slice(0,7);

function setSnap(){document.getElementById('snap').textContent=INV.length?'Inventaire D2C mis à jour le '+fmtAt(INV_AT):'Inventaire D2C : en attente des données'}
const isSold=r=>!!(NOTES[keyOf(r)]&&NOTES[keyOf(r)].vendu);
function kpis(){
  const avail=INV.filter(r=>!isSold(r));const live=avail.filter(r=>r.live).length, unpub=avail.length-live, cert=avail.filter(r=>r.cert).length;
  const avg=avail.length?Math.round(avail.reduce((a,r)=>a+(+r.days||0),0)/avail.length):0, old=avail.filter(r=>+r.days>60).length;
  const sold=INV.length-avail.length;
  document.getElementById('kpis').innerHTML=[
    [avail.length,'En stock disponible'+(sold?` · ${sold} vendu${sold>1?'s':''} retiré${sold>1?'s':''}`:'')],[live,'En ligne (publiés)'],[unpub,'Non publiés'],[cert,'Certifiés'],[avg+' j','Âge moyen'],[old,'Plus de 60 jours']
  ].map(([v,l])=>`<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
}
function tabsUI(){
  const n=salesRows().filter(x=>(x.n.vente?.statut||'vendu')!=='cancel').length;
  const T=[['inv','Inventaire',INV.filter(r=>!isSold(r)).length],['ventes','Ventes',n]];
  document.getElementById('tabs').innerHTML=T.map(([k,l,c])=>`<button role="tab" aria-selected="${tab===k}" data-tab="${k}">${l}<span class="n">${c}</span></button>`).join('');
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render()}
  const c=e.target.closest('[data-filt]');if(c){filt=c.dataset.filt;invView()}
  const s=e.target.closest('th[data-sort]');if(s){const k=s.dataset.sort;if(sortK===k)sortDir=-sortDir;else{sortK=k;sortDir=k==='days'||k==='price'||k==='km'?-1:1}invView()}});
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.toLowerCase();render()});

// ---------- Inventaire ----------
const FILTS=[['tous','Tous'],['live','En ligne'],['unpub','Non publiés'],['cert','Certifiés'],['noncert','Non certifiés'],['vendus','Vendus']];
function invView(){
  let rows=INV.slice();
  const f={tous:r=>!isSold(r),live:r=>r.live&&!isSold(r),unpub:r=>!r.live&&!isSold(r),cert:r=>r.cert&&!isSold(r),noncert:r=>!r.cert&&!isSold(r),vendus:r=>isSold(r)}[filt];
  rows=rows.filter(f);
  if(q)rows=rows.filter(r=>[r.stock,r.vin,r.make,r.model,r.version,r.year,r.color,NOTES[keyOf(r)]?.comment||''].join(' ').toLowerCase().includes(q));
  const val=r=>sortK==='cost'?((COUTS&&COUTS[normName(r.stock)]||{}).c||0):sortK==='marge'?(COUTS&&COUTS[normName(r.stock)]?num(r.price)-COUTS[normName(r.stock)].c:-1e9):sortK==='price'?num(r.price):sortK==='km'?num(r.km):sortK==='year'?+r.year:sortK==='model'?(r.make+' '+r.model):(+r.days||0);
  rows.sort((a,b)=>{const x=val(a),y=val(b);return (x>y?1:x<y?-1:0)*sortDir});
  const cnt=k=>INV.filter({tous:r=>!isSold(r),live:r=>r.live&&!isSold(r),unpub:r=>!r.live&&!isSold(r),cert:r=>r.cert&&!isSold(r),noncert:r=>!r.cert&&!isSold(r),vendus:r=>isSold(r)}[k]).length;
  const ageP=d=>`<span class="pill ${d>90?'p-bad':d>60?'p-hot':d>30?'p-warn':'p-ok'}">${d} j</span>`;
  const th=(k,l,cls='')=>`<th class="sortable ${cls}" data-sort="${k}" aria-sort="${sortK===k?(sortDir>0?'ascending':'descending'):'none'}">${l}${sortK===k?(sortDir>0?' ▲':' ▼'):''}</th>`;
  const body=rows.map((r,i)=>{const k=keyOf(r),n=NOTES[k]||{};const pr=num(r.price),or=num(r.orig);
    return `<tr data-row="${k}" class="${n.vendu?'sold':''}"><td class="idx">${i+1}</td><td class="mono stk">${esc(r.stock)}</td>
    <td class="vh"><b>${esc(r.year)} ${esc(r.make)} ${esc(r.model)}</b><small>${esc(r.version)}${r.type?' · '+esc(r.type):''}</small></td>
    <td>${esc(r.color)}</td><td class="num mono">${esc(r.km)}</td>
    <td class="num">${or&&or!==pr?`<span class="strike">${esc(r.orig)}</span>`:''}<b>${esc(r.price)}</b>${r.priceDays?`<small>prix depuis ${esc(r.priceDays.replace(' Jours',' j'))}</small>`:''}</td>${COUTS?(()=>{const c=COUTS[normName(r.stock)];if(!c)return '<td class="num">—</td><td class="num">—</td>';const m=pr-c.c;return `<td class="num">${money(c.c)}</td><td class="num"><span class="pill ${m<0?'p-bad':'p-ok'}">${m<0?'−':'+'}${money(Math.abs(m))}</span></td>`})():''}
    <td class="num">${ageP(+r.days||0)}</td>
    <td>${r.cert?'<span class="pill p-ok">Certifié</span>':'<span class="pill p-z">Non certifié</span>'}</td>
    <td>${(PRETS.rows||[]).some(p=>p.stock&&normName(p.stock)===normName(r.stock))?'<span class="pill p-warn">Prêté</span> ':''}${r.live?`<span class="pill p-n">En ligne</span>${r.url&&r.url!=='#'?` <a class="lnk" href="${esc(r.url)}" target="_blank" rel="noopener">voir</a>`:''}`:'<span class="pill p-bad">Non publié</span>'}</td>
    <td class="num mono">${esc(r.pics||'0')}</td><td class="mono"><small>${esc(r.vin)}</small></td>
    <td class="c-sold"><input type="checkbox" data-k="${k}" aria-label="Vendu ${esc(r.stock)}" ${n.vendu?'checked':''} ${DB?'':'disabled'}></td>
    <td class="c-date"><input type="date" data-dk="${k}" value="${esc(n.vendu?(n.soldAt||''):'')}" aria-label="Date de vente ${esc(r.stock)}" ${DB&&n.vendu?'':'disabled'}></td>
    <td class="c-com"><input type="text" data-k="${k}" value="${esc(n.comment||'')}" aria-label="Commentaire ${esc(r.stock)}" ${DB?'':'disabled'}></td></tr>`}).join('');
  document.getElementById('view').innerHTML=`<div class="chips" role="group" aria-label="Filtres">${FILTS.map(([k,l])=>`<button class="chip" data-filt="${k}" aria-pressed="${filt===k}">${l} · ${cnt(k)}</button>`).join('')}</div>
  <div class="box" style="margin-top:10px"><div class="box-h"><h2>${FILTS.find(x=>x[0]===filt)[1]}</h2><span class="meta">${rows.length} véhicule${rows.length>1?'s':''} · cliquez un en-tête pour trier${COUTS?' · coûtant : '+esc(COUT_SRC)+' (visible par les éditeurs seulement)':''}</span></div>
  <div class="tbl"><table class="veh"><thead><tr><th>#</th><th>Stock</th>${th('model','Véhicule')}<th>Couleur</th>${th('km','Km','num')}${th('price','Prix','num')}${COUTS?th('cost','Coûtant','num')+th('marge','Écart','num'):''}${th('days','En stock','num')}<th>Certifié</th><th>Site web</th><th class="num">Photos</th><th>NIV</th><th class="c-sold">Vendu</th><th class="c-date">Date</th><th>Commentaire</th></tr></thead>
  <tbody>${body||'<tr><td colspan="16" class="empty-row">Aucun véhicule.</td></tr>'}</tbody></table></div></div>`;
}
// Vendu / commentaire depuis l'inventaire
document.addEventListener('change',e=>{const i=e.target;if(i.matches('input[type=checkbox][data-k]')){const k=i.dataset.k,r=INV.find(x=>keyOf(x)===k),o=NOTES[k]||{};
  const v=o.vente||{};const base=r?{marque:r.make,modele:r.model,annee:r.year,stock:r.stock}:{};
  NOTES[k]={...o,vendu:i.checked,soldAt:i.checked?(o.soldAt||todayTO()):o.soldAt,vente:{...base,...v,client:v.client||o.comment||''}};
  saveNote(k);render()}
  // Date de vente (à côté de Vendu) : enregistrée seulement si l'auto est vendue et la date complète
  if(i.matches('input[type=date][data-dk]')){const k=i.dataset.dk,o=NOTES[k]||{};if(!o.vendu||!/^20\d\d-\d\d-\d\d$/.test(i.value))return;NOTES[k]={...o,soldAt:i.value};saveNote(k);tabsUI()}});
document.addEventListener('focusout',e=>{const i=e.target;if(i.matches&&i.matches('input[type=date][data-dk]')){const n=NOTES[i.dataset.dk]||{};i.value=n.vendu?(n.soldAt||''):''}});
const tmr={};
document.addEventListener('input',e=>{const i=e.target;if(i.matches('input[type=text][data-k]')){const k=i.dataset.k;NOTES[k]={...(NOTES[k]||{}),comment:i.value};clearTimeout(tmr[k]);tmr[k]=setTimeout(()=>saveNote(k),800)}});

// ---------- Ventes ----------
const STATUTS=[['vendu','Vendu'],['comptabilise','Comptabilisé'],['cancel','Annulé / refus']];
const prevYM=ym=>{const d=new Date(+ym.slice(0,4),+ym.slice(5)-2,15);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const effF=x=>String(x.frontM??'').trim()!==''?num(x.frontM):num(x.front);
function allSales(){return Object.entries(NOTES).filter(([k,n])=>n&&n.vendu).map(([k,n])=>({k,n,r:INV.find(x=>keyOf(x)===k)}))}
function salesRows(){return allSales().filter(x=>(x.n.soldAt||'').slice(0,7)===VMONTH)}
const nextYM=ym=>{const d=new Date(+ym.slice(0,4),+ym.slice(5),15);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
// Carry over — règle dès novembre 2026 : vente du mois précédent pas encore livrée ou livrée APRÈS le 2 du mois ;
// livrée le 1er ou le 2, elle reste dans son mois de vente et compte dans ses livraisons. Avant novembre : livrée dans le mois ou plus tard.
const CARRY_DES='2026-11';
const isCarryLiv=(l,m)=>{l=String(l||'').slice(0,10);return m>=CARRY_DES?l>m+'-02':l.slice(0,7)>=m};
const inMonthLiv=(d,m)=>{d=String(d||'').slice(0,10);if(d.slice(0,7)===m)return true;const nx=nextYM(m);return nx>=CARRY_DES&&(d===nx+'-01'||d===nx+'-02')};
function carryRows(){const p=prevYM(VMONTH);return allSales().filter(x=>(x.n.soldAt||'').slice(0,7)===p&&(x.n.vente?.statut||'vendu')!=='cancel'&&(!x.n.vente?.livraison||isCarryLiv(x.n.vente.livraison,VMONTH)))}
function ventesSummary(){
  const el=document.getElementById('vsum');if(!el)return;
  const month=salesRows().filter(x=>(x.n.vente?.statut||'vendu')!=='cancel'), carry=carryRows(), scope=[...month,...carry];
  const obj=num(CFG.objectif)||0,pct=obj?Math.round(month.length/obj*100):0;
  const livre=scope.filter(x=>{const l=x.n.vente?.livraison;return l&&inMonthLiv(l,VMONTH)&&l<=todayTO()}).length;
  const fr=scope.map(x=>effF(x.n.vente||{})).filter(v=>v), bk=scope.map(x=>num(x.n.vente?.back)).filter(v=>v);
  const tf=fr.reduce((a,b)=>a+b,0),tb=bk.reduce((a,b)=>a+b,0);
  const group=f=>{const m={};scope.forEach(x=>{const ns=canonNom(x.n.vente?.[f]).toUpperCase().split(/[-\/]/).map(s=>s.trim()).filter(Boolean);const w=ns.length?1/ns.length:0;ns.forEach(nm=>{m[nm]=m[nm]||{d:0,f:0,b:0};m[nm].d+=w;m[nm].f+=effF(x.n.vente||{})*w;m[nm].b+=num(x.n.vente?.back)*w})});return Object.entries(m).sort((a,b)=>b[1].d-a[1].d)};
  const fd=d=>Number.isInteger(d)?d:d.toFixed(1);
  const board=(t,l,c,lab)=>`<div class="vbox"><h3>${t}</h3>${l.length?`<table class="mini"><tr><th></th><th class="num">Deals</th><th class="num">${lab}</th></tr>${l.map(([nm,x],i)=>`<tr><td>${i===0?'<span class="top">TOP 1</span> ':''}${esc(nm)}</td><td class="num">${fd(x.d)}</td><td class="num">${x.d?money(x[c]/x.d):'—'}</td></tr>`).join('')}</table>`:'<p class="hint">Rien encore.</p>'}</div>`;
  el.innerHTML=`<div class="kpis"><div class="kpi"><b>${month.length}<small> / ${obj||'—'}</small></b><span>Vendus ce mois · ${pct}% · + ${carry.length} carry over</span><div class="bar"><i style="width:${Math.min(100,pct)}%"></i></div></div>
  <div class="kpi"><b>${livre}</b><span>Livrés ce mois</span></div>
  <div class="kpi"><b>${fr.length?money(tf/fr.length):'—'}</b><span>Moyenne front · obj. ${money(num(CFG.objMoy))}</span></div>
  <div class="kpi"><b>${bk.length?money(tb/bk.length):'—'}</b><span>Moyenne back</span></div>
  <div class="kpi"><b>${money(tf)}</b><span>Total front</span></div>
  <div class="kpi"><b>${money(tf+tb)}</b><span>Total profit · back ${money(tb)}</span></div></div>
  <div class="vboards" style="margin-top:10px">${board('Représentants',group('rep'),'f','Moy. front')}${board('F&amp;I',group('fi'),'b','Moy. back')}${board('Directeurs',group('dir'),'f','Moy. front')}</div>`;
}
function vIn(k,f,v,a=''){return `<input class="vi ${a.includes('class=')?'':''}" data-vk="${k}" data-f="${f}" value="${esc(v??'')}" aria-label="${f}" ${a} ${DB?'':'disabled'}>`}
function vSel(k,f,v,opts){return `<select class="vi" data-vk="${k}" data-f="${f}" aria-label="${f}" ${DB?'':'disabled'}>${opts.map(([val,l])=>`<option value="${val}" ${String(v??'')===val?'selected':''}>${l}</option>`).join('')}</select>`}
function rowHtml(x,i){const k=x.k,n=x.n,v=n.vente||{},r=x.r||{},st=v.statut||'vendu';const liv=v.livraison&&v.livraison<=todayTO();
  const g=(f,d)=>v[f]!=null&&String(v[f]).trim()!==''?v[f]:(d||'');
  const tot=effF(v)+num(v.back);
  return `<tr data-vrow="${k}" class="st-${st} ${liv&&st!=='cancel'?'livre':''}"><td class="idx">${i+1}</td>
  <td>${vIn(k,'rep',v.rep,'list="dl-rep"')}</td><td>${vIn(k,'fi',v.fi,'list="dl-fi" style="width:62px"')}</td><td>${vIn(k,'dir',v.dir,'list="dl-dir" style="width:72px"')}</td><td>${vIn(k,'source',v.source,'style="width:84px"')}</td>
  <td>${vIn(k,'client',g('client',n.comment),'style="width:170px"')}</td>
  <td>${vIn(k,'marque',g('marque',r.make),'style="width:84px"')}</td><td>${vIn(k,'modele',g('modele',r.model),'style="width:96px"')}</td><td>${vIn(k,'annee',g('annee',r.year),'style="width:58px"')}</td>
  <td>${vIn(k,'stock',g('stock',r.stock),'style="width:80px;font-family:var(--f-mono);font-weight:600"')}</td>
  <td>${vIn(k,'dateFi',v.dateFi,'type="date" style="width:128px"')}</td>
  <td>${vSel(k,'garantie',v.garantie,[['',''],['OUI','Oui'],['NON','Non']])}</td><td>${vSel(k,'financement',v.financement,[['',''],['OUI','Oui'],['NON','Non']])}</td>
  <td>${vIn(k,'livraison',v.livraison,'type="date" style="width:128px"')}</td>
  <td>${vIn(k,'recon',v.recon,'inputmode="decimal" style="width:70px;text-align:right"')}</td>
  <td>${vIn(k,'front',v.front,'inputmode="decimal" style="width:76px;text-align:right"')}</td><td>${vIn(k,'frontM',v.frontM,'inputmode="decimal" style="width:76px;text-align:right"')}</td>
  <td>${vIn(k,'back',v.back,'inputmode="decimal" style="width:76px;text-align:right"')}</td>
  <td class="num" id="tot-${k}">${tot?money(tot):'—'}</td>
  <td>${vSel(k,'statut',st,STATUTS)}</td>
  <td><input class="vi" type="date" data-vk="${k}" data-f="soldAt" value="${esc(n.soldAt||'')}" aria-label="Vendu le" style="width:128px" ${DB?'':'disabled'}></td>
  <td class="c-del">${DB?`<button type="button" class="delrow" data-delsale="${k}" title="Supprimer cette ligne (doublon ou erreur)" aria-label="Supprimer la ligne ${i+1}">✕</button>`:''}</td></tr>`}
const HEAD='<thead><tr><th>#</th><th>Représentant</th><th>F&amp;I</th><th>Dir</th><th>Source</th><th>Client</th><th>Marque</th><th>Modèle</th><th>Année</th><th>Stock</th><th>Date F&amp;I</th><th>Garantie</th><th>Financ.</th><th>Livraison</th><th class="num">Recon</th><th class="num">Front</th><th class="num">Front Marjo</th><th class="num">Back</th><th class="num">Total</th><th>Statut</th><th>Vendu le</th><th class="c-del" title="Supprimer une ligne"></th></tr></thead>';
function pretsTbl(){const r=PRETS.rows||[];if(!r.length)return '<div class="box"><p class="empty-row" style="margin:0">Aucun véhicule prêté dans BOARD 2026.</p></div>';
  return `<div class="box"><div class="tbl" data-ts="prets"><table class="veh"><thead><tr><th>#</th><th>Stock</th><th>Véhicule</th><th>Plaque</th><th>NIV</th><th>Depuis</th><th>Prêté à / détails</th></tr></thead><tbody>${r.map((x,i)=>{const inv=INV.find(v=>normName(v.stock)===normName(x.stock));return `<tr><td class="idx">${i+1}</td><td class="mono stk">${esc(x.stock||'—')}</td><td><b>${esc(x.annee)} ${esc(x.modele)}</b>${inv?`<small>${esc(inv.make)} ${esc(inv.model)} · ${esc(inv.color)} · ${esc(inv.km)} km</small>`:''}</td><td class="mono">${esc(x.plaque||'')}</td><td class="mono"><small>${esc(x.vin||(inv?inv.vin:''))}</small></td><td class="mono">${esc(x.date||'')}</td><td>${esc(x.details)}</td></tr>`}).join('')}</tbody></table></div></div><p class="hint">Liste lue dans BOARD 2026 (${esc(PRETS.tab||'onglet USED')}), sous les ventes du mois. Modifiez-la dans la feuille.</p>`}
// ---- Barre du haut sur chaque tableau de ventes : on la glisse (souris ou doigt) pour voir les colonnes de droite ----
// Toujours visible (dessinée par le board, pas la barre du système qui se cache sur Mac), elle suit le tableau et l'inverse,
// reste collée en haut de l'écran tant que le tableau est visible et garde sa position quand le board se met à jour.
const TS_POS={}; let TS_RO=null;
function tsSync(bar){
  const t=bar.nextElementSibling, th=bar.querySelector('.tthumb'), tr=th&&th.parentElement; if(!t||!th)return;
  const max=t.scrollWidth-t.clientWidth; bar.hidden=max<2; if(bar.hidden)return;
  const W=tr.clientWidth, w=Math.min(W,Math.max(48,Math.round(W*t.clientWidth/t.scrollWidth)));
  th.style.width=w+'px'; th.style.transform=`translateX(${Math.round((W-w)*Math.min(1,Math.max(0,t.scrollLeft/max)))}px)`;
}
function topBars(root){
  if(!root)return;
  if(!TS_RO&&window.ResizeObserver)TS_RO=new ResizeObserver(es=>es.forEach(e=>{const t=e.target.closest('.tbl'),b=t&&t.previousElementSibling;if(b&&b.classList.contains('tscroll'))tsSync(b)}));
  if(TS_RO)TS_RO.disconnect();
  root.querySelectorAll('.tbl[data-ts]').forEach(t=>{
    let bar=t.previousElementSibling;
    if(!bar||!bar.classList.contains('tscroll')){
      bar=document.createElement('div'); bar.className='tscroll'; bar.title='Glissez pour voir les autres colonnes'; bar.setAttribute('aria-hidden','true');
      bar.innerHTML='<div class="ttrack"><div class="tthumb"></div></div>'; t.before(bar); t.parentElement.classList.add('ts-host');
      const th=bar.querySelector('.tthumb'), tr=th.parentElement; let off=null;
      const go=x=>{const W=tr.clientWidth-th.offsetWidth, max=t.scrollWidth-t.clientWidth; if(W>0)t.scrollLeft=(x-tr.getBoundingClientRect().left-off)/W*max};
      bar.addEventListener('pointerdown',e=>{if(e.button)return; const r=th.getBoundingClientRect(); off=(e.clientX>=r.left&&e.clientX<=r.right)?e.clientX-r.left:th.offsetWidth/2; // clic hors du curseur : il saute sous la souris
        try{bar.setPointerCapture(e.pointerId)}catch(x){} th.classList.add('drag'); go(e.clientX); e.preventDefault()});
      bar.addEventListener('pointermove',e=>{if(off!=null)go(e.clientX)});
      const end=()=>{off=null;th.classList.remove('drag')}; ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>bar.addEventListener(ev,end));
      bar.addEventListener('mousedown',e=>e.preventDefault()); // ne pas sortir de la case en cours de saisie
      bar.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){t.scrollLeft+=e.deltaX;e.preventDefault()}},{passive:false});
      t.addEventListener('scroll',()=>{TS_POS[t.dataset.ts]=t.scrollLeft;tsSync(bar)},{passive:true});
    }
    if(TS_POS[t.dataset.ts])t.scrollLeft=TS_POS[t.dataset.ts];
    tsSync(bar);
    if(TS_RO){TS_RO.observe(t);if(t.firstElementChild)TS_RO.observe(t.firstElementChild)}
  });
}
function ventesView(){
  const months=[...new Set([todayTO().slice(0,7),...Object.values(NOTES).filter(n=>n.vendu&&n.soldAt).map(n=>n.soldAt.slice(0,7))])].sort().reverse();
  const fq=x=>!q||[x.n.vente?.client,x.n.comment,x.n.vente?.stock,x.n.vente?.modele,x.n.vente?.rep].join(' ').toLowerCase().includes(q);
  const srt=a=>a.sort((x,y)=>(x.n.soldAt||'').localeCompare(y.n.soldAt||''));
  const all=srt(salesRows().filter(fq)), live=all.filter(x=>(x.n.vente?.statut||'vendu')!=='cancel'), canc=srt([...all.filter(x=>(x.n.vente?.statut||'vendu')==='cancel'),...allSales().filter(x=>(x.n.vente?.statut||'vendu')==='cancel'&&(x.n.soldAt||'').slice(0,7)===prevYM(VMONTH)&&normName(x.n.vente?.importe).includes(normName(MOIS[+VMONTH.slice(5)-1]+' USED'))).filter(fq)]), carry=srt(carryRows().filter(fq));
  const pm=MOIS[+prevYM(VMONTH).slice(5)-1];
  const tbl=(rows,empty,ts)=>`<div class="box"><div class="tbl" data-ts="${ts}"><table class="veh">${HEAD}<tbody>${rows.length?rows.map(rowHtml).join(''):`<tr><td colspan="22" class="empty-row">${empty}</td></tr>`}</tbody></table></div></div>`;
  document.getElementById('view').innerHTML=`<div class="vhead"><h2>Ventes usagés ${MOIS[+VMONTH.slice(5)-1]} ${VMONTH.slice(0,4)}</h2>
   <label>Mois <select id="vmonth">${months.map(m=>`<option value="${m}" ${m===VMONTH?'selected':''}>${MOIS[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('')}</select></label>
   <label>Objectif <input id="vobj" class="vi s" value="${esc(CFG.objectif)}" inputmode="numeric" ${DB?'':'disabled'}></label>
   <label>Obj. front <input id="vobjm" class="vi s" value="${esc(CFG.objMoy)}" inputmode="numeric" ${DB?'':'disabled'}></label></div>
   <div id="vsum" style="margin-top:10px"></div>
   <datalist id="dl-rep">${['MICK','ALEX','ALEX D','NINA','SEB','PAT','SAM','WILL','CHARBEL','HOUSE'].map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="dl-fi">${['MEL','KEV','ISA'].map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="dl-dir">${['OMAR','BLACK','MICK'].map(x=>`<option value="${x}">`).join('')}</datalist>
   ${carry.length?`<p class="sec-title">Carry over de ${pm}${VMONTH>=CARRY_DES?` · vendus en ${pm}, pas encore livrés ou livrés après le 2 ${MOIS[+VMONTH.slice(5)-1]}`:''}</p>${tbl(carry,'','carry')}`:''}
   <p class="sec-title sec-add">Ventes du mois <button type="button" class="addrow" data-addsale title="Ajouter une vente à la main" aria-label="Ajouter une vente en ${MOIS[+VMONTH.slice(5)-1]}" ${DB?'':'disabled'}>+</button></p>${tbl(live,'Aucune vente. Cochez Vendu dans l\'inventaire ou cliquez + pour en ajouter une à la main.','mois')}
   ${canc.length?`<p class="sec-title">Ventes annulées / refus (exclues des totaux)</p>${tbl(canc,'','cx')}`:''}
   <p class="sec-title">Véhicules prêtés · ${(PRETS.rows||[]).length}</p>${pretsTbl()}
   <p class="hint">Couleurs : <span class="pill p-ok">Comptabilisé</span> <span class="pill p-n">Livré</span> <span class="pill p-bad">Annulé / refus</span>. Décocher Vendu dans l'inventaire retire l'auto des ventes. Une vente mise <b>Annulé / refus</b> reste ici en rouge et l'auto redevient disponible en inventaire. Le <b>✕</b> au bout de la ligne supprime une vente (doublon ou erreur) : une auto de l'inventaire redevient disponible.</p>`;
  ventesSummary(); topBars(document.getElementById('view'));
  document.getElementById('vmonth').onchange=e=>{VMONTH=e.target.value;ventesView()};
}
const vt={};
document.addEventListener('input',e=>{const i=e.target;
  if(i.id==='vobj'||i.id==='vobjm'){CFG[i.id==='vobj'?'objectif':'objMoy']=i.value;ventesSummary();clearTimeout(vt.cfg);vt.cfg=setTimeout(saveCfg,800);return}
  if(!i.dataset||!i.dataset.vk)return;const k=i.dataset.vk,f=i.dataset.f;
  if(!NOTES[k]||!NOTES[k].vendu)return; // ligne périmée (vente retirée, annulée ou effacée entre-temps)
  if(f==='statut'){const was=NOTES[k].vente?.statut||'vendu',from=NOTES[k].vente?.annuleDe;
    if(i.value==='cancel'&&was!=='cancel'&&invOf(k)){cancelToInventory(k);return}             // l'auto redevient disponible en inventaire
    if(i.value!=='cancel'&&was==='cancel'&&from&&invOf(from)){reactivate(k,i.value);return}} // l'auto redevient vendue
  if(f==='soldAt'){NOTES[k]={...(NOTES[k]||{}),soldAt:i.value}}else{NOTES[k]={...(NOTES[k]||{}),vente:{...(NOTES[k]?.vente||{}),[f]:i.value}}}
  if(f==='statut'){const tr=i.closest('tr');if(tr){tr.classList.remove('st-vendu','st-comptabilise','st-cancel');tr.classList.add('st-'+i.value)}}
  if(['front','frontM','back'].includes(f)){const v=NOTES[k].vente,t=effF(v)+num(v.back);const c=document.getElementById('tot-'+k);if(c)c.textContent=t?money(t):'—'}
  ventesSummary();clearTimeout(vt[k]);vt[k]=setTimeout(()=>{saveNote(k);if(f==='statut'||f==='soldAt'||f==='livraison')setTimeout(()=>{if(!document.activeElement?.dataset?.vk)ventesView()},50)},i.tagName==='SELECT'||i.type==='date'?0:800)});
document.addEventListener('change',e=>{const i=e.target;if(i.tagName==='SELECT'&&i.dataset.vk)i.dispatchEvent(new Event('input',{bubbles:true}))});
// Règle des noms : en quittant la case Représentant / F&I / Dir, « ALEX M » ou « MAHER » devient « ALEX » (puis enregistré comme une saisie)
document.addEventListener('change',e=>{const i=e.target;if(!i.dataset||!i.dataset.vk||!NOM_F.includes(i.dataset.f))return;const c=canonNom(i.value);if(c!==i.value){i.value=c;i.dispatchEvent(new Event('input',{bubbles:true}))}});

// Ajout manuel d'une vente (bouton + à côté de « Ventes du mois ») : date par défaut = aujourd'hui pour le mois en cours,
// sinon le dernier jour du mois affiché (le 1er pour un mois à venir).
function newSaleDate(ym){const t=todayTO();if(ym===t.slice(0,7))return t;if(ym<t.slice(0,7)){const d=new Date(+ym.slice(0,4),+ym.slice(5),0);return ym+'-'+String(d.getDate()).padStart(2,'0')}return ym+'-01'}
async function addSale(){
  if(!DB||!VMONTH)return;
  const k='MAN-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  NOTES[k]={vendu:true,comment:'',soldAt:newSaleDate(VMONTH),vente:{}};
  if(q){q='';const s=document.getElementById('q');if(s)s.value=''} // la recherche cacherait la ligne vide
  render();
  const tr=document.querySelector(`tr[data-vrow="${k}"]`);if(tr){tr.classList.add('newrow');tr.scrollIntoView({block:'center',behavior:'smooth'})}
  const inp=document.querySelector(`input[data-vk="${k}"][data-f="rep"]`);if(inp)inp.focus({preventScroll:true});
  if(!await saveNote(k)){delete NOTES[k];render()}
}
// ✕ au bout de chaque ligne de ventes : supprimer un doublon ou une mauvaise entrée (après confirmation).
// Auto de l'inventaire → redevient disponible (Vendu décoché, infos de vente effacées) ; vente ajoutée à la main (+) → effacée ;
// autre vente hors inventaire (importée de BOARD 2026, annulée…) → retirée du board (Vendu décoché, fiche gardée) pour que l'import ne la remette pas.
async function delSale(k){
  const n=NOTES[k];if(!DB||!n)return;
  const v=n.vente||{},r=invOf(k),t=s=>String(s??'').trim();
  const what=[t(v.client)||t(n.comment),[t(v.marque)||(r&&r.make)||'',t(v.modele)||(r&&r.model)||''].filter(Boolean).join(' '),t(v.stock)||(r&&r.stock)||''].filter(Boolean).join(' · ');
  if(!confirm('Supprimer cette ligne ?'+(what?'\n'+what:'')+(r?'\nL\'auto redevient disponible en inventaire.':'')))return;
  clearTimeout(vt[k]);clearTimeout(tmr[k]);
  const next=r?{vendu:false,comment:'',soldAt:'',vente:{}}:isManual(k)?null:{...n,vendu:false,vente:{...v,retireLe:todayTO()}};
  if(next)NOTES[k]=next;else delete NOTES[k];render();
  try{if(next)await DB.collection('suivi').doc(k).set(await noteDoc(next));else await DB.collection('suivi').doc(k).delete();
    setStatus(r?'Ligne supprimée : l\'auto est de nouveau disponible en inventaire':'Ligne supprimée')}
  catch(e){NOTES[k]=n;render();setStatus('Non supprimée : accès en lecture seule ?')}
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-addsale]');if(a){addSale();return}const d=e.target.closest('[data-delsale]');if(d)delSale(d.dataset.delsale)});

// Vente annulée → l'auto redevient disponible en inventaire : la vente passe dans une fiche « CX-… » (hors inventaire)
// qui reste en rouge dans les ventes annulées ; la fiche de l'auto est remise à zéro (Vendu décoché, commentaire vidé).
function cancelPlan(k,n){
  const r=invOf(k)||{},x={...(n.vente||{})},t=s=>String(s??'').trim();
  let cx='CX-'+k+'-'+(t(n.soldAt)||todayTO()).replace(/-/g,'');if(NOTES[cx])cx+='-'+Date.now().toString(36);
  const rec={vendu:true,comment:'',soldAt:n.soldAt||todayTO(),vente:{...x,statut:'cancel',client:t(x.client)||t(n.comment),marque:t(x.marque)||r.make||'',modele:t(x.modele)||r.model||'',annee:t(x.annee)||r.year||'',stock:t(x.stock)||r.stock||'',annuleDe:k,annuleLe:todayTO()}};
  return {cx,rec,back:{vendu:false,comment:'',soldAt:'',vente:{}}};
}
async function cancelToInventory(k){
  const n=NOTES[k];if(!n||!DB)return;const p=cancelPlan(k,n);
  clearTimeout(vt[k]);clearTimeout(tmr[k]);NOTES[p.cx]=p.rec;NOTES[k]=p.back;render();
  try{await writeNotes([[p.cx,p.rec],[k,p.back]]);setStatus('Vente annulée : l\'auto est de nouveau disponible en inventaire')}
  catch(e){delete NOTES[p.cx];NOTES[k]=n;render();setStatus('Non enregistré : accès en lecture seule ?')}
}
// Vente annulée remise à Vendu / Comptabilisé : la vente retourne sur l'auto, qui redevient vendue
async function reactivate(cx,st){
  const n=NOTES[cx],x={...(n.vente||{})},k=x.annuleDe,cur=NOTES[k];
  if(cur&&cur.vendu){render();alert('Cette auto a été revendue depuis l\'annulation : cette vente annulée ne peut pas être réactivée.');return}
  const {annuleDe,annuleLe,...sale}=x;
  const back={vendu:true,comment:sale.client||'',soldAt:n.soldAt||todayTO(),vente:{...sale,statut:st}};
  clearTimeout(vt[cx]);delete NOTES[cx];NOTES[k]=back;render();
  try{await writeNotes([[k,back]],[cx]);setStatus('Vente réactivée : l\'auto est de nouveau vendue')}
  catch(e){NOTES[cx]=n;if(cur)NOTES[k]=cur;else delete NOTES[k];render();setStatus('Non enregistré : accès en lecture seule ?')}
}
// Rattrapage (admin) : ventes déjà annulées dont l'auto est encore cochée Vendu (avant cette règle, ou rouges dans BOARD 2026)
let RELEASING=false;
async function releaseCancelled(){
  if(RELEASING||!DB||!CAN_EDIT||!INV.length)return;
  const ae=document.activeElement?.dataset||{};
  const todo=Object.entries(NOTES).filter(([k,n])=>n&&n.vendu&&n.vente?.statut==='cancel'&&invOf(k)&&ae.vk!==k&&ae.k!==k);
  if(!todo.length)return;RELEASING=true;const bak=[],sets=[];
  try{todo.forEach(([k,n])=>{const p=cancelPlan(k,n);bak.push([k,n],[p.cx,undefined]);NOTES[p.cx]=p.rec;NOTES[k]=p.back;sets.push([p.cx,p.rec],[k,p.back])});
    await writeNotes(sets);const s=todo.length>1?'s':'';setStatus(`${todo.length} vente${s} annulée${s} : auto${s} remise${s} en inventaire`)}
  catch(e){bak.forEach(([k,n])=>{if(n===undefined)delete NOTES[k];else NOTES[k]=n})}
  finally{RELEASING=false;const a=document.activeElement?.dataset||{};if(!a.vk&&!a.k&&!a.dk)render();else{kpis();tabsUI();ventesSummary()}}
}
// Rattrapage (admin) : ventes entrées avant la règle des noms (ex. « ALEX M », « MAHER ») → réécrites avec le bon nom (« ALEX »)
let RENAMING=false;
async function normalizeNames(){
  if(RENAMING||!DB||!CAN_EDIT)return;
  const ae=document.activeElement?.dataset||{};
  const todo=Object.entries(NOTES).filter(([k,n])=>n&&n.vente&&canonVente(n.vente)!==n.vente&&ae.vk!==k);
  if(!todo.length)return;RENAMING=true;
  try{const sets=todo.map(([k,n])=>{const m={...n,vente:canonVente(n.vente)};NOTES[k]=m;return [k,m]});
    for(let i=0;i<sets.length;i+=400)await writeNotes(sets.slice(i,i+400));
    const s=sets.length>1?'s':'';setStatus(`Règle des noms appliquée à ${sets.length} vente${s} (ALEX M, MAHER → ALEX)`)}
  catch(e){todo.forEach(([k,n])=>{NOTES[k]=n})}
  finally{RENAMING=false;const a=document.activeElement?.dataset||{};if(!a.vk&&!a.k&&!a.dk)render();else ventesSummary()}
}

// ---------- Base partagée ----------
function setStatus(t){const el=document.getElementById('savestate');el.textContent=t;el.className='status ok';clearTimeout(el._t);el._t=setTimeout(()=>{el.textContent=DB?'Vendu, commentaires et ventes partagés avec l\'équipe':'';el.className='status'},3000)}
const noteDoc=async n=>{if(n.vente)n.vente=canonVente(n.vente); // règle des noms (ALEX M, MAHER → ALEX) appliquée à chaque enregistrement
  return {vendu:!!n.vendu,comment:n.comment||'',soldAt:n.soldAt||'',vente:n.vente||{},by:USER?await USER.id().catch(()=>''):'',at:new Date().toISOString()}};
async function saveNote(k){if(!DB)return false;const n=NOTES[k]||{};try{await DB.collection('suivi').doc(k).set(await noteDoc(n));setStatus('Enregistré');return true}catch(e){setStatus('Non enregistré : accès en lecture seule ?');return false}}
// Écrit plusieurs fiches d'un seul coup (tout ou rien) : sets = [[clé, fiche]…], dels = [clé…]
async function writeNotes(sets,dels=[]){const col=DB.collection('suivi'),b=DB.batch?DB.batch():null;
  if(!b){for(const [k,n] of sets)await col.doc(k).set(await noteDoc(n));for(const k of dels)await col.doc(k).delete();return}
  for(const [k,n] of sets)b.set(col.doc(k),await noteDoc(n));for(const k of dels)b.delete(col.doc(k));await b.commit()}
async function saveCfg(){if(!DB)return;try{await DB.doc('config/ventes').set({objectif:num(CFG.objectif),objMoy:num(CFG.objMoy)});setStatus('Enregistré')}catch(e){}}
function render(){setSnap();kpis();tabsUI();if(tab==='inv')invView();else ventesView()}
(async()=>{
  try{DB=await window.claude?.use?.('db');USER=await window.claude?.use?.('user')}catch(e){DB=null}
  if(!DB){document.getElementById('savestate').textContent='Connectez-vous pour cocher Vendu et saisir les ventes.';return}
  try{CAN_EDIT=USER?!!(await Promise.resolve(USER.canEdit())):false}catch(e){}
  try{MCP=await window.claude?.use?.('mcp')}catch(e){MCP=null}
  let first=true;
  DB.collection('suivi').onSnapshot(s=>{const ae=document.activeElement?.dataset||{};
    if(typeof s.docChanges==='function')s.docChanges().forEach(ch=>{if(ch.type==='removed')delete NOTES[ch.doc.id]}); // fiche effacée ailleurs (✕, vente réactivée)
    s.docs.forEach(d=>{if(!d.exists)return;const x=d.data()||{};const ed=ae.vk===d.id||ae.k===d.id||ae.dk===d.id;if(ed&&!first)return;NOTES[d.id]={vendu:!!x.vendu,comment:x.comment||'',soldAt:x.soldAt||'',vente:x.vente||{}}});
    if(first){first=false;render();releaseCancelled();normalizeNames();if(CAN_EDIT&&MCP){syncBoard();setInterval(syncBoard,5*60*1000)}}else if(!ae.vk&&!ae.k&&!ae.dk)render();else{kpis();tabsUI();ventesSummary()}});
  DB.doc('config/ventes').onSnapshot(s=>{if(s.exists){const x=s.data()||{};CFG={objectif:x.objectif??50,objMoy:x.objMoy??1800};if(tab==='ventes'&&!['vobj','vobjm'].includes(document.activeElement?.id))ventesSummary()}});
  try{DB.doc('couts/actuel').onSnapshot(s=>{if(s.exists){const x=s.data()||{};COUTS=x.map||null;COUT_SRC=x.source||'';if(tab==='inv'&&!document.activeElement?.dataset?.k)invView()}},()=>{COUTS=null})}catch(e){}
  DB.doc('config/prets').onSnapshot(s=>{if(s.exists){PRETS=s.data()||{rows:[]};if(!document.activeElement?.dataset?.vk)render()}});
  DB.doc('inventaire/actuel').onSnapshot(s=>{if(!s.exists)return;const x=s.data()||{};if(!x.json||!x.at||x.at<=INV_AT)return;try{const r=JSON.parse(x.json);if(Array.isArray(r)&&r.length>5){INV=r;INV_AT=x.at;render();releaseCancelled()}}catch(e){}});
  setStatus('Vendu, commentaires et ventes partagés avec l\'équipe');
})();
render();

// ---------- Synchro BOARD 2026 (onglet <MOIS> USED) ----------
const MON_RX=[[/^janv/,1],[/^f[ée]v/,2],[/^mars/,3],[/^avr/,4],[/^mai/,5],[/^juin/,6],[/^juil/,7],[/^ao[uû]/,8],[/^sep/,9],[/^oct/,10],[/^nov/,11],[/^d[ée]c/,12]];
function parseD(s,ym){s=String(s||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=s.toLowerCase().match(/^(\d{1,2})\s*(?:er)?\s*([a-zéûè]+)/);if(!m)return '';const mm=(MON_RX.find(([r])=>r.test(m[2]))||[])[1];if(!mm)return '';let y=+ym.slice(0,4);if(mm>+ym.slice(5)+1)y--;return `${y}-${String(mm).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`}
function colorOf(c){const b=c&&c.effectiveFormat&&c.effectiveFormat.backgroundColor;if(!b)return '';const r=b.red||0,g=b.green||0,bl=b.blue||0;if(g>0.85&&r<0.3&&bl<0.3)return 'comptabilise';if(r>0.85&&g<0.3&&bl<0.3)return 'cancel';return ''}
const lev=(a,b)=>{if(Math.abs(a.length-b.length)>2)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]};
let SYNC_BUSY=false;
const IMPORT_FIN='2026-11-01'; // dès le 1er novembre 2026, les ventes s'entrent directement dans le board : plus d'import de ventes de BOARD 2026 (les prêts restent lus)
function pretOf(val){const cells=[0,1,2,3,4,5,6,7,8,9,10].map(j=>val(j));const used=new Set();
  const stkI=[0,1].find(j=>/^[A-Z]?\d{4,6}[A-Z]{0,2}$/i.test(cells[j])&&!/^\d{1,3}$/.test(cells[j]));if(stkI!=null)used.add(stkI);
  const vinI=cells.findIndex((c,j)=>!used.has(j)&&/^[A-HJ-NPR-Z0-9]{17}$/i.test(c));if(vinI>=0)used.add(vinI);
  const plI=cells.findIndex((c,j)=>!used.has(j)&&j>0&&/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,7}$/i.test(c));if(plI>=0)used.add(plI);
  const dtI=cells.findIndex((c,j)=>!used.has(j)&&/^\d{4}-\d{2}-\d{2}$/.test(c));if(dtI>=0)used.add(dtI);
  [0,3,4].forEach(j=>used.add(j));
  return {stock:stkI!=null?cells[stkI]:'',modele:cells[3],annee:/^\d{4}$/.test(cells[4])?cells[4]:'',vin:vinI>=0?cells[vinI]:'',plaque:plI>=0?cells[plI]:'',date:dtI>=0?cells[dtI]:'',details:cells.filter((c,j)=>c&&!used.has(j)).join(' · ')}}
async function syncBoard(){
  if(SYNC_BUSY||!DB||!MCP)return;SYNC_BUSY=true;const el=document.getElementById('boardsrc'),ventesOn=todayTO()<IMPORT_FIN;
  try{
    const ym=todayTO().slice(0,7),up=MOIS[+ym.slice(5)-1].toUpperCase();let grid=null,used='';
    for(const nm of [...new Set([up+' USED',up.normalize('NFD').replace(/[̀-ͯ]/g,'')+' USED'])]){try{const res=await MCP.callTool('Google Sheets','get_spreadsheet',{spreadsheetId:BOARD26,ranges:[`'${nm}'!A1:T300`],includeGridData:true,fields:['sheets.data.rowData.values.effectiveFormat.backgroundColor','sheets.data.rowData.values.formattedValue']},{cache:false});
      let p=res.payload;if(typeof p==='string'){try{p=JSON.parse(p)}catch(e){p=null}}if(!p||!p.sheets){const t=(res.content||[]).filter(c=>c&&c.type==='text').map(c=>c.text).join('');try{p=JSON.parse(t)}catch(e){}}
      const rd=p&&p.sheets&&p.sheets[0]&&p.sheets[0].data&&p.sheets[0].data[0]&&p.sheets[0].data[0].rowData;if(rd){grid=rd;used=nm;break}}catch(e){if(e&&e.code==='not_granted')throw e}}
    if(!grid)throw new Error('onglet introuvable');
    const byName={},byStock={};Object.entries(NOTES).forEach(([k,n])=>{const nm=normName(n.vente?.client||n.comment);if(nm)byName[nm]=byName[nm]||k;const st=normName(n.vente?.stock);if(n.vendu&&st.length>=4)byStock[st]=byStock[st]||k});
    const invByStock={};INV.forEach(r=>invByStock[normName(r.stock)]=r);
    let sec='',blank=0,added=0,upd=0;const prets=[];const pYM=prevYM(ym);
    for(let i=0;i<grid.length;i++){
      const cells=(grid[i]&&grid[i].values)||[],val=j=>String((cells[j]&&cells[j].formattedValue)||'').trim(),a=val(0).toUpperCase();
      if(/^CARRY OVER/.test(a)){sec='carry';blank=0;continue} if(normName(a)===normName('VENTES '+up)){sec='mois';blank=0;continue}
      if(!sec)continue;const client=val(6);
      if(sec==='after'){const filled=[1,2,3,4,5,6,7,8,9,10].some(j=>val(j))||(val(0)&&!/^\d{1,3}$/.test(val(0)));
        if(filled&&colorOf(cells[6])!=='cancel'&&colorOf(cells[1])!=='cancel'){prets.push(pretOf(val));continue}}
      if(!client){if(sec==='mois'||sec==='after'){blank++;if(blank>=3)sec='after'}continue} blank=0;
      if(normName(client)==='NOMDUCLIENT')continue;
      const color=colorOf(cells[6])||colorOf(cells[1]),nm=normName(client),stk=normName(val(10));
      if(sec==='after'&&color!=='cancel')continue; // sous les ventes du mois : seulement le bloc des annulations (rouge), pas les prêts / courtoisie
      if(!ventesOn)continue; // dès le 1er novembre : plus d'import de ventes (seulement les prêts)
      let ex=byName[nm]||(stk.length>=4?byStock[stk]:'');
      if(!ex&&nm.length>=6)ex=(Object.entries(NOTES).find(([k2,n2])=>{const c2=normName(n2.vente?.client||n2.comment);return c2&&c2.length>=6&&lev(c2,nm)<=2})||[])[0];
      if(ex){const n=NOTES[ex];if(!n.vendu)continue;const st=n.vente?.statut||'vendu';let ch=false;const v={...(n.vente||{})};
        if(normName(v.client||n.comment)!==nm){v.client=client;ch=true}
        if(color&&color!==st&&st!=='cancel'&&!(st==='comptabilise'&&color!=='cancel')){v.statut=color;if(color==='comptabilise'&&!v.frontM&&val(17))v.frontM=val(17);ch=true}
        if(ch){NOTES[ex]={...n,vente:v};byName[nm]=ex;await saveNote(ex);upd++}continue}
      const inv=invByStock[stk];let k=inv?keyOf(inv):'';if(k&&NOTES[k]&&NOTES[k].vendu)k='';if(!k)k='U-'+ym+'-'+nm.slice(0,40);
      const dateFi=parseD(val(11),ym);
      const vente={rep:canonNom(val(1)),fi:canonNom(val(2)),dir:canonNom(val(3)),source:val(5),client,marque:val(7),modele:val(8),annee:val(9),stock:val(10),dateFi,garantie:val(12).toUpperCase(),financement:val(13).toUpperCase(),livraison:parseD(val(14),ym),recon:val(15),front:val(16),frontM:val(17),back:val(18),statut:sec==='after'?'cancel':(color||'vendu'),importe:`BOARD 2026 ${used} ligne ${i+1}`};
      Object.keys(vente).forEach(f=>{if(vente[f]==='')delete vente[f]});
      NOTES[k]={vendu:true,comment:client,soldAt:dateFi||(sec==='carry'?pYM+'-28':todayTO()),vente};byName[nm]=k;if(stk.length>=4)byStock[stk]=k;await saveNote(k);added++;
    }
    const pj=JSON.stringify(prets);if(pj!==JSON.stringify(PRETS.rows||[])){PRETS={rows:prets,at:new Date().toISOString(),tab:used};try{await DB.doc('config/prets').set(PRETS)}catch(e){}render()}
    const hm=new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
    if(el)el.textContent=!ventesOn?`Véhicules prêtés lus dans BOARD 2026 (${used}) à ${hm}`:`BOARD 2026 (${used}) vérifié à ${hm}`+(added?` · ${added} vente${added>1?'s':''} ajoutée${added>1?'s':''}`:'')+(upd?` · ${upd} mise${upd>1?'s':''} à jour`:'');
    if(added||upd){render();releaseCancelled()} // vente annulée (rouge) dans BOARD 2026 : l'auto retourne en inventaire
  }catch(e){if(el)el.textContent=(ventesOn?'BOARD 2026 (USED) non vérifié':'Véhicules prêtés : BOARD 2026 non lu'+(e&&e.message==='onglet introuvable'?' (pas d\'onglet USED pour ce mois)':''))+(e&&e.code==='not_granted'?' — accès Google Sheets refusé':'')}
  finally{SYNC_BUSY=false}
}
window.D2C_BOARD={render,setInv:(rows,at)=>{INV=rows;INV_AT=at;render()}};
