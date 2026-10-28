// Ventes wholesale · Hyundai St-Constant — autos vendues aux marchands et aux encans.
// Même base que les autres boards (Firestore, préfixe wholesale_) : une fiche par vente dans « suivi »,
// {vendu, soldAt (date de vente), comment, vente:{stock, marque, modele, niv, vendant, coutant, acheteur, livraison, statut, note}}.
// Le profit = vendant − coûtant. Statuts : vendu (défaut), livre, paye, cancel (annulée, hors des totaux).
const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>{const n=parseFloat(String(x??'').replace(/[\s$]/g,'').replace(/,(?=\d{3}\b)/g,'').replace(',','.'));return isNaN(n)?0:n};
const money=n=>Math.round(n).toLocaleString('fr-CA')+' $';
const moneyS=n=>(n<0?'−':'')+money(Math.abs(n));
const normName=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const todayTO=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const fmtAt=at=>{const d=new Date(at);return d.toLocaleDateString('fr-CA',{timeZone:'America/Toronto',day:'numeric',month:'long',year:'numeric'})+' à '+d.toLocaleTimeString('fr-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'})};
const ACHETEURS=['STRATEGIA','OPENLANE','EBLOCK','JPC AUTO','WHOLESALE EXPRESS','TRADEREV','MONTMORENCY FORD'];
const STATUTS=[['vendu','Vendu'],['livre','Livré'],['paye','Payé'],['cancel','Annulé']];
const isManual=k=>String(k||'').startsWith('WS-');
let NOTES={}, CFG={objectif:40000}, DB=null, USER=null, CAN_EDIT=false, VMONTH=todayTO().slice(0,7), INV=[], COUTS=null, LAST_AT='';
const profit=v=>num(v.vendant)-num(v.coutant);
const alive=x=>(x.n.vente?.statut||'vendu')!=='cancel';

function allSales(){return Object.entries(NOTES).filter(([k,n])=>n&&n.vendu).map(([k,n])=>({k,n}))}
function monthSales(){return allSales().filter(x=>(x.n.soldAt||'').slice(0,7)===VMONTH).sort((a,b)=>(a.n.soldAt||'').localeCompare(b.n.soldAt||'')||String(a.n.vente?.stock||'').localeCompare(String(b.n.vente?.stock||'')))}
function setSnap(){const el=document.getElementById('snap');if(!el)return;el.textContent=LAST_AT?'Dernière vente enregistrée le '+fmtAt(LAST_AT):'Aucune vente enregistrée'}

// ---------- Sommaire du mois ----------
function summary(){
  const el=document.getElementById('vsum');if(!el)return;
  const rows=monthSales(), live=rows.filter(alive), canc=rows.length-live.length;
  const tp=live.reduce((a,x)=>a+profit(x.n.vente||{}),0), tv=live.reduce((a,x)=>a+num(x.n.vente?.vendant),0), tc=live.reduce((a,x)=>a+num(x.n.vente?.coutant),0);
  const obj=num(CFG.objectif)||0, pct=obj?Math.round(tp/obj*100):0;
  const livres=live.filter(x=>['livre','paye'].includes(x.n.vente?.statut)).length, payes=live.filter(x=>x.n.vente?.statut==='paye').length, neg=live.filter(x=>profit(x.n.vente||{})<0).length;
  const m={};live.forEach(x=>{const nm=String(x.n.vente?.acheteur||'').trim().toUpperCase()||'—';m[nm]=m[nm]||{d:0,p:0};m[nm].d++;m[nm].p+=profit(x.n.vente||{})});
  const list=Object.entries(m).sort((a,b)=>b[1].d-a[1].d||b[1].p-a[1].p);
  let bi=-1,bv=-Infinity;list.forEach(([,x],i)=>{if(x.p>bv){bv=x.p;bi=i}});
  el.innerHTML=`<div class="kpis wk">
    <div class="kpi"><b>${live.length}</b><span>Ventes wholesale ce mois${canc?` · ${canc} annulée${canc>1?'s':''}`:''}</span></div>
    <div class="kpi"><b class="${tp<0?'profit-neg':''}">${moneyS(tp)}<small> / ${obj?money(obj):'—'}</small></b><span>Profit du mois · ${pct} % de l'objectif</span><div class="bar"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div></div>
    <div class="kpi"><b>${live.length?moneyS(tp/live.length):'—'}</b><span>Profit moyen par auto${neg?` · ${neg} à perte`:''}</span></div>
    <div class="kpi"><b>${money(tv)}</b><span>Total vendant</span></div>
    <div class="kpi"><b>${money(tc)}</b><span>Total coûtant</span></div>
    <div class="kpi"><b>${livres}<small> / ${live.length}</small></b><span>Livrées · ${payes} payée${payes>1?'s':''}</span></div>
  </div>
  <div class="vboards" style="margin-top:10px"><div class="vbox"><h3>Acheteurs</h3>${list.length?`<table class="mini"><tr><th></th><th class="num">Autos</th><th class="num">Profit</th></tr>${list.map(([nm,x],i)=>`<tr><td>${i===0?'<span class="top" title="Le plus d\'autos">TOP 1</span> ':''}${esc(nm)}</td><td class="num">${x.d}</td><td class="num">${i===bi?'<span class="top top-m" title="Meilleur profit">TOP 1 $</span> ':''}${moneyS(x.p)}</td></tr>`).join('')}</table>`:'<p class="hint">Rien encore ce mois-ci.</p>'}</div></div>`;
}

// ---------- Tableau ----------
function vIn(k,f,v,a=''){return `<input ${a.includes('class=')?'':'class="vi"'} data-vk="${k}" data-f="${f}" value="${esc(v??'')}" aria-label="${f}" ${a} ${DB?'':'disabled'}>`}
function rowHtml(x,i){const k=x.k,n=x.n,v=n.vente||{},st=v.statut||'vendu',p=profit(v);
  return `<tr data-vrow="${k}" class="st-${st}"><td class="idx">${i+1}</td>
  <td>${vIn(k,'soldAt',n.soldAt,'type="date" class="vi d"')}</td>
  <td>${vIn(k,'stock',v.stock,'class="vi s stk" list="dl-stock" placeholder="Stock" style="font-family:var(--f-mono);font-weight:600;width:96px"')}</td>
  <td>${vIn(k,'marque',v.marque,'class="vi w" list="dl-marque"')}</td><td>${vIn(k,'modele',v.modele,'class="vi w"')}</td>
  <td>${vIn(k,'niv',v.niv,'class="vi s" placeholder="6 derniers" style="font-family:var(--f-mono);width:92px"')}</td>
  <td>${vIn(k,'vendant',v.vendant,'class="vi n" inputmode="decimal"')}</td><td>${vIn(k,'coutant',v.coutant,'class="vi n" inputmode="decimal"')}</td>
  <td class="num ${p<0?'profit-neg':''}" id="prof-${k}"><b>${(v.vendant||v.coutant)?moneyS(p):'—'}</b></td>
  <td>${vIn(k,'acheteur',v.acheteur,'class="vi x" list="dl-acheteur" placeholder="Strategia, Openlane…"')}</td>
  <td>${vIn(k,'livraison',v.livraison,'type="date" class="vi d"')}</td>
  <td><select class="vi" data-vk="${k}" data-f="statut" aria-label="Statut" ${DB?'':'disabled'}>${STATUTS.map(([val,l])=>`<option value="${val}" ${st===val?'selected':''}>${l}</option>`).join('')}</select></td>
  <td>${vIn(k,'facture',v.facture,'class="vi s" placeholder="#" style="width:64px" title="No de facture One-Eighty"')}</td>
  <td>${vIn(k,'note',v.note,'class="vi x" placeholder="Note"')}</td>
  <td class="c-del">${DB?`<button type="button" class="delrow" data-delsale="${k}" title="Supprimer cette ligne (doublon ou erreur)" aria-label="Supprimer la ligne ${i+1}">✕</button>`:''}</td></tr>`}
const HEAD='<thead><tr><th>#</th><th>Date</th><th>Stock</th><th>Marque</th><th>Modèle</th><th>NIV</th><th class="num">Vendant</th><th class="num">Coûtant</th><th class="num">Profit</th><th>Acheteur</th><th>Livraison</th><th>Statut</th><th>Facture</th><th>Note</th><th class="c-del" title="Supprimer une ligne"></th></tr></thead>';
function render(){
  setSnap();
  const months=[...new Set([todayTO().slice(0,7),...allSales().map(x=>(x.n.soldAt||'').slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m))])].sort().reverse();
  const rows=monthSales(), mName=MOIS[+VMONTH.slice(5)-1]+' '+VMONTH.slice(0,4);
  const marques=[...new Set([...INV.map(r=>String(r.make||'').toUpperCase()),...allSales().map(x=>String(x.n.vente?.marque||'').toUpperCase())].filter(Boolean))].sort();
  const acheteurs=[...new Set([...ACHETEURS,...allSales().map(x=>String(x.n.vente?.acheteur||'').toUpperCase().trim())].filter(Boolean))].sort();
  document.getElementById('view').innerHTML=`<div class="vhead"><h2>Ventes wholesale ${esc(mName)}</h2>
   <label>Mois <select id="vmonth">${months.map(m=>`<option value="${m}" ${m===VMONTH?'selected':''}>${MOIS[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('')}</select></label>
   <label>Objectif profit <input id="vobj" class="vi" style="width:84px;text-align:right" value="${esc(CFG.objectif)}" inputmode="numeric" ${DB?'':'disabled'}> $</label></div>
   <div id="vsum" style="margin-top:10px"></div>
   <datalist id="dl-stock">${INV.map(r=>`<option value="${esc(r.stock)}">${esc(r.year)} ${esc(r.make)} ${esc(r.model)}</option>`).join('')}</datalist>
   <datalist id="dl-marque">${marques.map(m=>`<option value="${esc(m)}">`).join('')}</datalist>
   <datalist id="dl-acheteur">${acheteurs.map(a=>`<option value="${esc(a)}">`).join('')}</datalist>
   <p class="sec-title sec-add">Ventes de ${esc(MOIS[+VMONTH.slice(5)-1])} (${rows.filter(alive).length}) <button type="button" class="addrow" data-addsale title="Ajouter une vente" aria-label="Ajouter une vente wholesale en ${esc(MOIS[+VMONTH.slice(5)-1])}" ${DB?'':'disabled'}>+</button></p>
   <div class="box"><div class="tbl" data-ts="mois"><table class="veh">${HEAD}<tbody>${rows.length?rows.map(rowHtml).join(''):`<tr><td colspan="15" class="empty-row">Aucune vente wholesale ${esc(MOIS[+VMONTH.slice(5)-1])}. Cliquez <b>+</b> pour en ajouter une.</td></tr>`}</tbody></table></div></div>
   <p class="hint">Couleurs : <span class="pill p-liv">Livré</span> <span class="pill p-ok">Payé</span> <span class="pill p-bad">Annulé</span> (exclu des totaux). Le <b>✕</b> au bout de la ligne supprime une vente (doublon ou erreur). « Mettre à jour depuis One-Eighty » ajoute les factures en gros du mois (date, stock, auto, acheteur, vendant, no de facture) ; le coûtant reste à entrer ici.</p>`;
  summary(); topBars(document.getElementById('view'));
  document.getElementById('vmonth').onchange=e=>{VMONTH=e.target.value;render()};
}

// ---------- Saisie ----------
const vt={};
document.addEventListener('input',e=>{const i=e.target;
  if(i.id==='vobj'){CFG.objectif=i.value;summary();clearTimeout(vt.cfg);vt.cfg=setTimeout(saveCfg,800);return}
  if(!i.dataset||!i.dataset.vk)return;const k=i.dataset.vk,f=i.dataset.f;if(!NOTES[k])return;
  if(f==='soldAt'){NOTES[k]={...NOTES[k],soldAt:i.value}}else{NOTES[k]={...NOTES[k],vente:{...(NOTES[k].vente||{}),[f]:i.value}}}
  if(f==='stock')fillFromInventory(k,i.value);
  if(f==='statut'){const tr=i.closest('tr');if(tr)tr.className='st-'+i.value}
  if(f==='vendant'||f==='coutant'){const v=NOTES[k].vente,p=profit(v),c=document.getElementById('prof-'+k);if(c){c.innerHTML=`<b>${(v.vendant||v.coutant)?moneyS(p):'—'}</b>`;c.classList.toggle('profit-neg',p<0)}}
  summary();clearTimeout(vt[k]);vt[k]=setTimeout(()=>{saveNote(k);if(f==='soldAt')setTimeout(()=>{if(!document.activeElement?.dataset?.vk)render()},50)},i.tagName==='SELECT'||i.type==='date'?0:800)});
document.addEventListener('change',e=>{const i=e.target;if(i.tagName==='SELECT'&&i.dataset.vk)i.dispatchEvent(new Event('input',{bubbles:true}))});
// No de stock connu dans l'inventaire usagé → marque, modèle, NIV (6 derniers) et coûtant (si disponible) se remplissent quand ils sont vides
function fillFromInventory(k,stock){
  const r=INV.find(x=>normName(x.stock)===normName(stock));if(!r)return;const v=NOTES[k].vente||{},t=s=>String(s??'').trim();
  const add={};if(!t(v.marque))add.marque=String(r.make||'').toUpperCase();if(!t(v.modele))add.modele=String(r.model||'').toUpperCase();if(!t(v.niv)&&r.vin)add.niv=String(r.vin).slice(-6);
  const c=COUTS&&COUTS[normName(r.stock)];if(!t(v.coutant)&&c&&c.c)add.coutant=String(Math.round(c.c));
  if(!Object.keys(add).length)return;NOTES[k]={...NOTES[k],vente:{...v,...add}};
  Object.entries(add).forEach(([f,val])=>{const inp=document.querySelector(`[data-vk="${k}"][data-f="${f}"]`);if(inp)inp.value=val});
  const p=profit(NOTES[k].vente),cell=document.getElementById('prof-'+k);if(cell){cell.innerHTML=`<b>${(NOTES[k].vente.vendant||NOTES[k].vente.coutant)?moneyS(p):'—'}</b>`;cell.classList.toggle('profit-neg',p<0)}
}
// + : nouvelle ligne (date = aujourd'hui pour le mois courant, sinon le dernier jour du mois affiché)
function newSaleDate(ym){const t=todayTO();if(ym===t.slice(0,7))return t;if(ym<t.slice(0,7)){const d=new Date(+ym.slice(0,4),+ym.slice(5),0);return ym+'-'+String(d.getDate()).padStart(2,'0')}return ym+'-01'}
async function addSale(){
  if(!DB)return;const k='WS-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  NOTES[k]={vendu:true,comment:'',soldAt:newSaleDate(VMONTH),vente:{statut:'vendu'}};render();
  const tr=document.querySelector(`tr[data-vrow="${k}"]`);if(tr){tr.classList.add('newrow');tr.scrollIntoView({block:'center',behavior:'smooth'})}
  const inp=document.querySelector(`input[data-vk="${k}"][data-f="stock"]`);if(inp)inp.focus({preventScroll:true});
  if(!await saveNote(k)){delete NOTES[k];render()}
}
async function delSale(k){
  const n=NOTES[k];if(!DB||!n)return;const v=n.vente||{};
  const what=[v.stock,[v.marque,v.modele].filter(Boolean).join(' '),v.acheteur].filter(Boolean).join(' · ');
  if(!confirm('Supprimer cette ligne ?'+(what?'\n'+what:'')))return;
  clearTimeout(vt[k]);delete NOTES[k];render();
  try{await DB.collection('suivi').doc(k).delete();setStatus('Ligne supprimée')}catch(e){NOTES[k]=n;render();setStatus('Non supprimée : accès en lecture seule ?')}
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-addsale]');if(a){addSale();return}const d=e.target.closest('[data-delsale]');if(d)delSale(d.dataset.delsale)});

// ---------- Barre du haut du tableau (même mécanique que les autres boards) ----------
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
      bar.addEventListener('pointerdown',e=>{if(e.button)return; const r=th.getBoundingClientRect(); off=(e.clientX>=r.left&&e.clientX<=r.right)?e.clientX-r.left:th.offsetWidth/2;
        try{bar.setPointerCapture(e.pointerId)}catch(x){} th.classList.add('drag'); go(e.clientX); e.preventDefault()});
      bar.addEventListener('pointermove',e=>{if(off!=null)go(e.clientX)});
      const end=()=>{off=null;th.classList.remove('drag')}; ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>bar.addEventListener(ev,end));
      bar.addEventListener('mousedown',e=>e.preventDefault());
      bar.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){t.scrollLeft+=e.deltaX;e.preventDefault()}},{passive:false});
      t.addEventListener('scroll',()=>{TS_POS[t.dataset.ts]=t.scrollLeft;tsSync(bar)},{passive:true});
    }
    if(TS_POS[t.dataset.ts])t.scrollLeft=TS_POS[t.dataset.ts];
    tsSync(bar);
    if(TS_RO){TS_RO.observe(t);if(t.firstElementChild)TS_RO.observe(t.firstElementChild)}
  });
}

// ---------- Synchro One-Eighty (favori « ⟳ Wholesale One-Eighty ») ----------
// Reçoit les factures en gros lues dans One-Eighty (quote_load.asp) : une vente par facture. Une vente déjà au board (même no de stock,
// vendue le même mois ou le mois d'à côté) est complétée (champs vides seulement) ; sinon elle est ajoutée. Le coûtant n'est jamais touché.
const ACH_ALIAS=[[/STRATEGIA/i,'STRATEGIA'],[/JPC/i,'JPC AUTO'],[/EBLOCK|E-BLOCK/i,'EBLOCK'],[/TRADEREV|TRADE REV/i,'TRADEREV'],[/OPENLANE|OPEN LANE/i,'OPENLANE'],[/WHOLESALE ?EXPRESS|WHOLESALEXPRESS/i,'WHOLESALE EXPRESS'],[/KARFLIP/i,'KARFLIP']];
const aliasAch=s=>{const t=String(s||'').replace(/\s*-\s*,?\s*$/,'').trim();const a=ACH_ALIAS.find(([re])=>re.test(t));return a?a[1]:t.toUpperCase()};
const monthsApart=(a,b)=>{const [ya,ma]=String(a||'').split('-').map(Number),[yb,mb]=String(b||'').split('-').map(Number);return (ya&&yb)?Math.abs((ya*12+ma)-(yb*12+mb)):99};
async function writeNotes(sets){const col=DB.collection('suivi'),b=DB.batch?DB.batch():null;
  if(!b){for(const k of sets)await col.doc(k).set(await noteDoc(NOTES[k]));return}
  for(let i=0;i<sets.length;i+=400){const bb=DB.batch();for(const k of sets.slice(i,i+400))bb.set(col.doc(k),await noteDoc(NOTES[k]));await bb.commit()}}
async function importOE(data){
  if(!DB)throw new Error('Connectez-vous pour mettre à jour les ventes wholesale.');
  const rows=Array.isArray(data.rows)?data.rows:[];if(!rows.length)throw new Error('Aucune facture en gros trouvée dans One-Eighty pour la période.');
  const t=x=>String(x??'').trim();let added=0,upd=0,same=0,quotes=0;const sets=[],bak={};
  for(const r of rows){
    if(!t(r.facture)){quotes++;continue}                         // proposition pas encore facturée : pas une vente
    const stock=normName(r.stock),date=t(r.date).slice(0,10);if(!stock||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const v={stock:t(r.stock).toUpperCase(),marque:t(r.marque).toUpperCase(),modele:t(r.modele).toUpperCase(),annee:t(r.annee),niv:t(r.niv).slice(-6),vendant:r.vendant!=null&&r.vendant!==''?String(num(r.vendant)):'',acheteur:aliasAch(r.acheteur),facture:t(r.facture),oeId:t(r.id),rep:t(r.rep)};
    let k=(Object.entries(NOTES).find(([,n])=>n&&n.vendu&&t(n.vente?.oeId)===v.oeId)||Object.entries(NOTES).find(([,n])=>n&&n.vendu&&normName(n.vente?.stock)===stock&&monthsApart(n.soldAt,date)<=1)||[])[0];
    if(!k){k='OE-'+v.oeId;bak[k]=undefined;NOTES[k]={vendu:true,comment:'',soldAt:date,vente:{...v,statut:'vendu',importe:'One-Eighty proposition '+v.oeId}};sets.push(k);added++;continue}
    const n=NOTES[k],x=n.vente||{},o={...x};let ch=false;
    ['marque','modele','annee','niv','acheteur','facture','oeId','rep'].forEach(f=>{if(!t(o[f])&&t(v[f])){o[f]=v[f];ch=true}});
    if(!t(o.vendant)&&v.vendant){o.vendant=v.vendant;ch=true}
    else if(v.vendant&&num(o.vendant)!==num(v.vendant)&&!String(o.note||'').includes('One-Eighty : vendant')){o.note=[t(o.note),'One-Eighty : vendant '+money(num(v.vendant))].filter(Boolean).join(' · ');ch=true}
    if(ch){bak[k]=n;NOTES[k]={...n,vente:o};sets.push(k);upd++}else same++;
  }
  if(sets.length){try{await writeNotes(sets)}catch(e){Object.entries(bak).forEach(([k,n])=>{if(n===undefined)delete NOTES[k];else NOTES[k]=n});render();throw new Error('Non enregistré ('+(e&&e.code==='permission-denied'?'accès en lecture seule':e.message)+')')}}
  if(!document.activeElement?.dataset?.vk)render();else summary();
  const msg=`One-Eighty : ${added} vente${added>1?'s':''} ajoutée${added>1?'s':''}, ${upd} complétée${upd>1?'s':''}, ${same} déjà à jour`+(quotes?` · ${quotes} proposition${quotes>1?'s':''} pas encore facturée${quotes>1?'s':''} (ignorée${quotes>1?'s':''})`:'')+'.';
  setStatus(msg);return msg;
}

// ---------- Base partagée ----------
function setStatus(t){const el=document.getElementById('savestate');el.textContent=t;el.className='status ok';clearTimeout(el._t);el._t=setTimeout(()=>{el.textContent=DB?'Ventes wholesale partagées avec l\'équipe':'';el.className='status'},3000)}
const noteDoc=async n=>({vendu:!!n.vendu,comment:n.comment||'',soldAt:n.soldAt||'',vente:n.vente||{},by:USER?await USER.id().catch(()=>''):'',at:new Date().toISOString()});
async function saveNote(k){if(!DB)return false;const n=NOTES[k]||{};try{await DB.collection('suivi').doc(k).set(await noteDoc(n));setStatus('Enregistré');return true}catch(e){setStatus('Non enregistré : accès en lecture seule ?');return false}}
async function saveCfg(){if(!DB)return;try{await DB.doc('config/ventes').set({objectif:num(CFG.objectif)});setStatus('Enregistré')}catch(e){}}
(async()=>{
  try{DB=await window.claude?.use?.('db');USER=await window.claude?.use?.('user')}catch(e){DB=null}
  if(!DB){document.getElementById('savestate').textContent='Connectez-vous pour entrer les ventes wholesale.';render();return}
  try{CAN_EDIT=USER?!!(await Promise.resolve(USER.canEdit())):false}catch(e){}
  let first=true;
  DB.collection('suivi').onSnapshot(s=>{const ae=document.activeElement?.dataset||{};
    if(typeof s.docChanges==='function')s.docChanges().forEach(ch=>{if(ch.type==='removed')delete NOTES[ch.doc.id]});
    LAST_AT='';s.docs.forEach(d=>{if(!d.exists)return;const x=d.data()||{};if(x.at&&x.at>LAST_AT)LAST_AT=x.at;if(ae.vk===d.id&&!first)return;NOTES[d.id]={vendu:!!x.vendu,comment:x.comment||'',soldAt:x.soldAt||'',vente:x.vente||{}}});
    first=false;if(!ae.vk)render();else summary()},e=>setStatus('Synchronisation interrompue, rechargez la page'));
  DB.doc('config/ventes').onSnapshot(s=>{if(s.exists){const x=s.data()||{};CFG={objectif:x.objectif??40000};if(document.activeElement?.id!=='vobj'){const o=document.getElementById('vobj');if(o)o.value=CFG.objectif;summary()}}});
  // Inventaire usagé (lecture seule) : suggestions de no de stock et remplissage marque / modèle / NIV
  if(DB.rawDoc){try{DB.rawDoc('usage_inventaire/actuel').onSnapshot(s=>{if(!s.exists)return;try{const r=JSON.parse((s.data()||{}).json||'[]');if(Array.isArray(r)){INV=r;if(!document.activeElement?.dataset?.vk)render()}}catch(e){}},()=>{})}catch(e){}
    if(CAN_EDIT){try{DB.rawDoc('usage_couts/actuel').onSnapshot(s=>{COUTS=s.exists?((s.data()||{}).map||null):null},()=>{COUTS=null})}catch(e){}}}
  setStatus('Ventes wholesale partagées avec l\'équipe');
})();
render();
window.WS_BOARD={render,importOE};
