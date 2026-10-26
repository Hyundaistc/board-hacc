const SNAP_AT="2000-01-01T00:00:00.000Z";
let INV=[];
let INV_AT=SNAP_AT;
const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const BOARD26='1tUgTC16T6uxK_2luFFnbOTI6SjeQk7-AQq7LEtZ_Ee8';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>{const n=parseFloat(String(x??'').replace(/[\s$]/g,'').replace(/,(?=\d{3}\b)/g,'').replace(',','.'));return isNaN(n)?0:n};
const money=n=>Math.round(n).toLocaleString('fr-CA')+' $';
const normName=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const keyOf=r=>'S-'+normName(r.stock);
const todayTO=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const fmtAt=at=>{const d=new Date(at);return d.toLocaleDateString('fr-CA',{timeZone:'America/Toronto',day:'numeric',month:'long',year:'numeric'})+' à '+d.toLocaleTimeString('fr-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'})};
let COUTS=null, COUT_SRC='', PRETS={rows:[]}, NOTES={}, CFG={objectif:50,objMoy:1800}, DB=null, USER=null, MCP=null, CAN_EDIT=false;
let tab='inv', filt='tous', q='', sortK='days', sortDir=-1, VMONTH=todayTO().slice(0,7);

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
function carryRows(){const p=prevYM(VMONTH);return allSales().filter(x=>(x.n.soldAt||'').slice(0,7)===p&&(x.n.vente?.statut||'vendu')!=='cancel'&&(!x.n.vente?.livraison||x.n.vente.livraison.slice(0,7)>=VMONTH))}
function ventesSummary(){
  const el=document.getElementById('vsum');if(!el)return;
  const month=salesRows().filter(x=>(x.n.vente?.statut||'vendu')!=='cancel'), carry=carryRows(), scope=[...month,...carry];
  const obj=num(CFG.objectif)||0,pct=obj?Math.round(month.length/obj*100):0;
  const livre=scope.filter(x=>{const l=x.n.vente?.livraison;return l&&l.slice(0,7)===VMONTH&&l<=todayTO()}).length;
  const fr=scope.map(x=>effF(x.n.vente||{})).filter(v=>v), bk=scope.map(x=>num(x.n.vente?.back)).filter(v=>v);
  const tf=fr.reduce((a,b)=>a+b,0),tb=bk.reduce((a,b)=>a+b,0);
  const group=f=>{const m={};scope.forEach(x=>{const ns=String(x.n.vente?.[f]||'').toUpperCase().split(/[-\/]/).map(s=>s.trim()).filter(Boolean);const w=ns.length?1/ns.length:0;ns.forEach(nm=>{m[nm]=m[nm]||{d:0,f:0,b:0};m[nm].d+=w;m[nm].f+=effF(x.n.vente||{})*w;m[nm].b+=num(x.n.vente?.back)*w})});return Object.entries(m).sort((a,b)=>b[1].d-a[1].d)};
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
  <td><input class="vi" type="date" data-vk="${k}" data-f="soldAt" value="${esc(n.soldAt||'')}" aria-label="Vendu le" style="width:128px" ${DB?'':'disabled'}></td></tr>`}
const HEAD='<thead><tr><th>#</th><th>Représentant</th><th>F&amp;I</th><th>Dir</th><th>Source</th><th>Client</th><th>Marque</th><th>Modèle</th><th>Année</th><th>Stock</th><th>Date F&amp;I</th><th>Garantie</th><th>Financ.</th><th>Livraison</th><th class="num">Recon</th><th class="num">Front</th><th class="num">Front Marjo</th><th class="num">Back</th><th class="num">Total</th><th>Statut</th><th>Vendu le</th></tr></thead>';
function pretsTbl(){const r=PRETS.rows||[];if(!r.length)return '<div class="box"><p class="empty-row" style="margin:0">Aucun véhicule prêté dans BOARD 2026.</p></div>';
  return `<div class="box"><div class="tbl"><table class="veh"><thead><tr><th>#</th><th>Stock</th><th>Véhicule</th><th>Plaque</th><th>NIV</th><th>Depuis</th><th>Prêté à / détails</th></tr></thead><tbody>${r.map((x,i)=>{const inv=INV.find(v=>normName(v.stock)===normName(x.stock));return `<tr><td class="idx">${i+1}</td><td class="mono stk">${esc(x.stock||'—')}</td><td><b>${esc(x.annee)} ${esc(x.modele)}</b>${inv?`<small>${esc(inv.make)} ${esc(inv.model)} · ${esc(inv.color)} · ${esc(inv.km)} km</small>`:''}</td><td class="mono">${esc(x.plaque||'')}</td><td class="mono"><small>${esc(x.vin||(inv?inv.vin:''))}</small></td><td class="mono">${esc(x.date||'')}</td><td>${esc(x.details)}</td></tr>`}).join('')}</tbody></table></div></div><p class="hint">Liste lue dans BOARD 2026 (${esc(PRETS.tab||'onglet USED')}), sous les ventes du mois. Modifiez-la dans la feuille.</p>`}
function ventesView(){
  const months=[...new Set([todayTO().slice(0,7),...Object.values(NOTES).filter(n=>n.vendu&&n.soldAt).map(n=>n.soldAt.slice(0,7))])].sort().reverse();
  const fq=x=>!q||[x.n.vente?.client,x.n.comment,x.n.vente?.stock,x.n.vente?.modele,x.n.vente?.rep].join(' ').toLowerCase().includes(q);
  const srt=a=>a.sort((x,y)=>(x.n.soldAt||'').localeCompare(y.n.soldAt||''));
  const all=srt(salesRows().filter(fq)), live=all.filter(x=>(x.n.vente?.statut||'vendu')!=='cancel'), canc=srt([...all.filter(x=>(x.n.vente?.statut||'vendu')==='cancel'),...allSales().filter(x=>(x.n.vente?.statut||'vendu')==='cancel'&&(x.n.soldAt||'').slice(0,7)===prevYM(VMONTH)&&normName(x.n.vente?.importe).includes(normName(MOIS[+VMONTH.slice(5)-1]+' USED'))).filter(fq)]), carry=srt(carryRows().filter(fq));
  const pm=MOIS[+prevYM(VMONTH).slice(5)-1];
  const tbl=(rows,empty)=>`<div class="box"><div class="tbl"><table class="veh">${HEAD}<tbody>${rows.length?rows.map(rowHtml).join(''):`<tr><td colspan="21" class="empty-row">${empty}</td></tr>`}</tbody></table></div></div>`;
  document.getElementById('view').innerHTML=`<div class="vhead"><h2>Ventes usagés ${MOIS[+VMONTH.slice(5)-1]} ${VMONTH.slice(0,4)}</h2>
   <label>Mois <select id="vmonth">${months.map(m=>`<option value="${m}" ${m===VMONTH?'selected':''}>${MOIS[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('')}</select></label>
   <label>Objectif <input id="vobj" class="vi s" value="${esc(CFG.objectif)}" inputmode="numeric" ${DB?'':'disabled'}></label>
   <label>Obj. front <input id="vobjm" class="vi s" value="${esc(CFG.objMoy)}" inputmode="numeric" ${DB?'':'disabled'}></label></div>
   <div id="vsum" style="margin-top:10px"></div>
   <datalist id="dl-rep">${['MICK','ALEX M','ALEX D','NINA','SEB','PAT','SAM','WILL','CHARBEL','HOUSE'].map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="dl-fi">${['MEL','KEV','ISA'].map(x=>`<option value="${x}">`).join('')}</datalist><datalist id="dl-dir">${['OMAR','BLACK','MICK'].map(x=>`<option value="${x}">`).join('')}</datalist>
   ${carry.length?`<p class="sec-title">Carry over de ${pm}</p>${tbl(carry,'')}`:''}
   <p class="sec-title">Ventes du mois</p>${tbl(live,'Aucune vente. Cochez Vendu dans l\'inventaire ou ajoutez-la dans BOARD 2026 (onglet USED).')}
   ${canc.length?`<p class="sec-title">Ventes annulées / refus (exclues des totaux)</p>${tbl(canc,'')}`:''}
   <p class="sec-title">Véhicules prêtés · ${(PRETS.rows||[]).length}</p>${pretsTbl()}
   <p class="hint">Couleurs : <span class="pill p-ok">Comptabilisé</span> <span class="pill p-n">Livré</span> <span class="pill p-bad">Annulé / refus</span>. Décocher Vendu dans l'inventaire retire l'auto des ventes.</p>`;
  ventesSummary();
  document.getElementById('vmonth').onchange=e=>{VMONTH=e.target.value;ventesView()};
}
const vt={};
document.addEventListener('input',e=>{const i=e.target;
  if(i.id==='vobj'||i.id==='vobjm'){CFG[i.id==='vobj'?'objectif':'objMoy']=i.value;ventesSummary();clearTimeout(vt.cfg);vt.cfg=setTimeout(saveCfg,800);return}
  if(!i.dataset||!i.dataset.vk)return;const k=i.dataset.vk,f=i.dataset.f;
  if(f==='soldAt'){NOTES[k]={...(NOTES[k]||{}),soldAt:i.value}}else{NOTES[k]={...(NOTES[k]||{}),vente:{...(NOTES[k]?.vente||{}),[f]:i.value}}}
  if(f==='statut'){const tr=i.closest('tr');if(tr){tr.classList.remove('st-vendu','st-comptabilise','st-cancel');tr.classList.add('st-'+i.value)}}
  if(['front','frontM','back'].includes(f)){const v=NOTES[k].vente,t=effF(v)+num(v.back);const c=document.getElementById('tot-'+k);if(c)c.textContent=t?money(t):'—'}
  ventesSummary();clearTimeout(vt[k]);vt[k]=setTimeout(()=>{saveNote(k);if(f==='statut'||f==='soldAt'||f==='livraison')setTimeout(()=>{if(!document.activeElement?.dataset?.vk)ventesView()},50)},i.tagName==='SELECT'||i.type==='date'?0:800)});
document.addEventListener('change',e=>{const i=e.target;if(i.tagName==='SELECT'&&i.dataset.vk)i.dispatchEvent(new Event('input',{bubbles:true}))});

// ---------- Base partagée ----------
function setStatus(t){const el=document.getElementById('savestate');el.textContent=t;el.className='status ok';clearTimeout(el._t);el._t=setTimeout(()=>{el.textContent=DB?'Vendu, commentaires et ventes partagés avec l\'équipe':'';el.className='status'},3000)}
async function saveNote(k){if(!DB)return;const n=NOTES[k]||{};try{await DB.collection('suivi').doc(k).set({vendu:!!n.vendu,comment:n.comment||'',soldAt:n.soldAt||'',vente:n.vente||{},by:USER?await USER.id().catch(()=>''):'',at:new Date().toISOString()});setStatus('Enregistré')}catch(e){setStatus('Non enregistré : accès en lecture seule ?')}}
async function saveCfg(){if(!DB)return;try{await DB.doc('config/ventes').set({objectif:num(CFG.objectif),objMoy:num(CFG.objMoy)});setStatus('Enregistré')}catch(e){}}
function render(){setSnap();kpis();tabsUI();if(tab==='inv')invView();else ventesView()}
(async()=>{
  try{DB=await window.claude?.use?.('db');USER=await window.claude?.use?.('user')}catch(e){DB=null}
  if(!DB){document.getElementById('savestate').textContent='Connectez-vous pour cocher Vendu et saisir les ventes.';return}
  try{CAN_EDIT=USER?!!(await Promise.resolve(USER.canEdit())):false}catch(e){}
  try{MCP=await window.claude?.use?.('mcp')}catch(e){MCP=null}
  let first=true;
  DB.collection('suivi').onSnapshot(s=>{const ae=document.activeElement?.dataset||{};s.docs.forEach(d=>{if(!d.exists)return;const x=d.data()||{};const ed=ae.vk===d.id||ae.k===d.id||ae.dk===d.id;if(ed&&!first)return;NOTES[d.id]={vendu:!!x.vendu,comment:x.comment||'',soldAt:x.soldAt||'',vente:x.vente||{}}});
    if(first){first=false;render();if(CAN_EDIT&&MCP){syncBoard();setInterval(syncBoard,5*60*1000)}}else if(!ae.vk&&!ae.k&&!ae.dk)render();else{kpis();tabsUI();ventesSummary()}});
  DB.doc('config/ventes').onSnapshot(s=>{if(s.exists){const x=s.data()||{};CFG={objectif:x.objectif??50,objMoy:x.objMoy??1800};if(tab==='ventes'&&!['vobj','vobjm'].includes(document.activeElement?.id))ventesSummary()}});
  try{DB.doc('couts/actuel').onSnapshot(s=>{if(s.exists){const x=s.data()||{};COUTS=x.map||null;COUT_SRC=x.source||'';if(tab==='inv'&&!document.activeElement?.dataset?.k)invView()}},()=>{COUTS=null})}catch(e){}
  DB.doc('config/prets').onSnapshot(s=>{if(s.exists){PRETS=s.data()||{rows:[]};if(!document.activeElement?.dataset?.vk)render()}});
  DB.doc('inventaire/actuel').onSnapshot(s=>{if(!s.exists)return;const x=s.data()||{};if(!x.json||!x.at||x.at<=INV_AT)return;try{const r=JSON.parse(x.json);if(Array.isArray(r)&&r.length>5){INV=r;INV_AT=x.at;render()}}catch(e){}});
  setStatus('Vendu, commentaires et ventes partagés avec l\'équipe');
})();
render();

// ---------- Synchro BOARD 2026 (onglet <MOIS> USED) ----------
const MON_RX=[[/^janv/,1],[/^f[ée]v/,2],[/^mars/,3],[/^avr/,4],[/^mai/,5],[/^juin/,6],[/^juil/,7],[/^ao[uû]/,8],[/^sep/,9],[/^oct/,10],[/^nov/,11],[/^d[ée]c/,12]];
function parseD(s,ym){s=String(s||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=s.toLowerCase().match(/^(\d{1,2})\s*(?:er)?\s*([a-zéûè]+)/);if(!m)return '';const mm=(MON_RX.find(([r])=>r.test(m[2]))||[])[1];if(!mm)return '';let y=+ym.slice(0,4);if(mm>+ym.slice(5)+1)y--;return `${y}-${String(mm).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`}
function colorOf(c){const b=c&&c.effectiveFormat&&c.effectiveFormat.backgroundColor;if(!b)return '';const r=b.red||0,g=b.green||0,bl=b.blue||0;if(g>0.85&&r<0.3&&bl<0.3)return 'comptabilise';if(r>0.85&&g<0.3&&bl<0.3)return 'cancel';return ''}
const lev=(a,b)=>{if(Math.abs(a.length-b.length)>2)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]};
let SYNC_BUSY=false;
function pretOf(val){const cells=[0,1,2,3,4,5,6,7,8,9,10].map(j=>val(j));const used=new Set();
  const stkI=[0,1].find(j=>/^[A-Z]?\d{4,6}[A-Z]{0,2}$/i.test(cells[j])&&!/^\d{1,3}$/.test(cells[j]));if(stkI!=null)used.add(stkI);
  const vinI=cells.findIndex((c,j)=>!used.has(j)&&/^[A-HJ-NPR-Z0-9]{17}$/i.test(c));if(vinI>=0)used.add(vinI);
  const plI=cells.findIndex((c,j)=>!used.has(j)&&j>0&&/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,7}$/i.test(c));if(plI>=0)used.add(plI);
  const dtI=cells.findIndex((c,j)=>!used.has(j)&&/^\d{4}-\d{2}-\d{2}$/.test(c));if(dtI>=0)used.add(dtI);
  [0,3,4].forEach(j=>used.add(j));
  return {stock:stkI!=null?cells[stkI]:'',modele:cells[3],annee:/^\d{4}$/.test(cells[4])?cells[4]:'',vin:vinI>=0?cells[vinI]:'',plaque:plI>=0?cells[plI]:'',date:dtI>=0?cells[dtI]:'',details:cells.filter((c,j)=>c&&!used.has(j)).join(' · ')}}
async function syncBoard(){
  if(SYNC_BUSY||!DB||!MCP)return;SYNC_BUSY=true;const el=document.getElementById('boardsrc');
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
      let ex=byName[nm]||(stk.length>=4?byStock[stk]:'');
      if(!ex&&nm.length>=6)ex=(Object.entries(NOTES).find(([k2,n2])=>{const c2=normName(n2.vente?.client||n2.comment);return c2&&c2.length>=6&&lev(c2,nm)<=2})||[])[0];
      if(ex){const n=NOTES[ex];if(!n.vendu)continue;const st=n.vente?.statut||'vendu';let ch=false;const v={...(n.vente||{})};
        if(normName(v.client||n.comment)!==nm){v.client=client;ch=true}
        if(color&&color!==st&&st!=='cancel'&&!(st==='comptabilise'&&color!=='cancel')){v.statut=color;if(color==='comptabilise'&&!v.frontM&&val(17))v.frontM=val(17);ch=true}
        if(ch){NOTES[ex]={...n,vente:v};byName[nm]=ex;await saveNote(ex);upd++}continue}
      const inv=invByStock[stk];let k=inv?keyOf(inv):'';if(k&&NOTES[k]&&NOTES[k].vendu)k='';if(!k)k='U-'+ym+'-'+nm.slice(0,40);
      const dateFi=parseD(val(11),ym);
      const vente={rep:val(1),fi:val(2),dir:val(3),source:val(5),client,marque:val(7),modele:val(8),annee:val(9),stock:val(10),dateFi,garantie:val(12).toUpperCase(),financement:val(13).toUpperCase(),livraison:parseD(val(14),ym),recon:val(15),front:val(16),frontM:val(17),back:val(18),statut:sec==='after'?'cancel':(color||'vendu'),importe:`BOARD 2026 ${used} ligne ${i+1}`};
      Object.keys(vente).forEach(f=>{if(vente[f]==='')delete vente[f]});
      NOTES[k]={vendu:true,comment:client,soldAt:dateFi||(sec==='carry'?pYM+'-28':todayTO()),vente};byName[nm]=k;if(stk.length>=4)byStock[stk]=k;await saveNote(k);added++;
    }
    const pj=JSON.stringify(prets);if(pj!==JSON.stringify(PRETS.rows||[])){PRETS={rows:prets,at:new Date().toISOString(),tab:used};try{await DB.doc('config/prets').set(PRETS)}catch(e){}render()}
    if(el)el.textContent=`BOARD 2026 (${used}) vérifié à ${new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'})}`+(added?` · ${added} vente${added>1?'s':''} ajoutée${added>1?'s':''}`:'')+(upd?` · ${upd} mise${upd>1?'s':''} à jour`:'');
    if(added||upd)render();
  }catch(e){if(el)el.textContent='BOARD 2026 (USED) non vérifié'+(e&&e.code==='not_granted'?' — accès Google Sheets refusé':'')}
  finally{SYNC_BUSY=false}
}
window.D2C_BOARD={render,setInv:(rows,at)=>{INV=rows;INV_AT=at;render()}};
