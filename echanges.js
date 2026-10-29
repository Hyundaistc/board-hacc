// Échanges · Hyundai St-Constant — véhicules neufs sortis vers d'autres concessionnaires (échanges entre concessionnaires).
// Même base que les autres boards (Firestore, préfixe echanges_) : une fiche par échange dans « suivi »,
// {vendu:true, soldAt (date de transaction), vente:{stock, annee, marque, modele, niv, conces, rep, prix, facture, livraison, statut, note, brut (profit = Brut de véh. One-Eighty), oeId}}.
// Statuts : alivrer (défaut), livre, comptabilise, cancel (annulé, hors du compte).
const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>{const n=parseFloat(String(x??'').replace(/[\s$]/g,'').replace(/,(?=\d{3}\b)/g,'').replace(',','.'));return isNaN(n)?0:n};
const money=n=>Math.round(n).toLocaleString('fr-CA')+' $';
const normName=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const todayTO=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const fmtAt=at=>{const d=new Date(at);return d.toLocaleDateString('fr-CA',{timeZone:'America/Toronto',day:'numeric',month:'long',year:'numeric'})+' à '+d.toLocaleTimeString('fr-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'})};
const STATUTS=[['alivrer','À livrer'],['livre','Livré'],['comptabilise','Comptabilisé'],['cancel','Annulé']];
let NOTES={}, DB=null, USER=null, VMONTH=todayTO().slice(0,7), LAST_AT='';
const alive=x=>(x.n.vente?.statut||'alivrer')!=='cancel';

function allRows(){return Object.entries(NOTES).filter(([k,n])=>n&&n.vendu).map(([k,n])=>({k,n}))}
function monthRows(){return allRows().filter(x=>(x.n.soldAt||'').slice(0,7)===VMONTH).sort((a,b)=>(a.n.soldAt||'').localeCompare(b.n.soldAt||'')||String(a.n.vente?.stock||'').localeCompare(String(b.n.vente?.stock||'')))}
function setSnap(){const el=document.getElementById('snap');if(!el)return;el.textContent=LAST_AT?'Dernier échange enregistré le '+fmtAt(LAST_AT):'Aucun échange enregistré'}

// ---------- Sommaire du mois ----------
function summary(){
  const el=document.getElementById('vsum');if(!el)return;
  const rows=monthRows(), live=rows.filter(alive), canc=rows.length-live.length;
  el.innerHTML=`<div class="kpis ek"><div class="kpi"><b>${live.length}</b><span>Échanges ce mois${canc?` · ${canc} annulé${canc>1?'s':''}`:''}</span></div></div>`;
  const t=document.getElementById('ecount');if(t)t.textContent=live.length;
}

// ---------- Tableau ----------
function vIn(k,f,v,a=''){return `<input ${a.includes('class=')?'':'class="vi"'} data-vk="${k}" data-f="${f}" value="${esc(v??'')}" aria-label="${f}" ${a} ${DB?'':'disabled'}>`}
function rowHtml(x,i){const k=x.k,n=x.n,v=n.vente||{},st=v.statut||'alivrer';
  return `<tr data-vrow="${k}" class="st-${st}"><td class="idx">${i+1}</td>
  <td>${vIn(k,'soldAt',n.soldAt,'type="date" class="vi d"')}</td>
  <td>${vIn(k,'stock',v.stock,'class="vi s stk" placeholder="Stock" style="font-family:var(--f-mono);font-weight:600;width:96px"')}</td>
  <td>${vIn(k,'annee',v.annee,'class="vi s" style="width:60px" inputmode="numeric"')}</td>
  <td>${vIn(k,'marque',v.marque,'class="vi w"')}</td><td>${vIn(k,'modele',v.modele,'class="vi x"')}</td>
  <td>${vIn(k,'niv',v.niv,'class="vi s" placeholder="6 derniers" style="font-family:var(--f-mono);width:92px"')}</td>
  <td>${vIn(k,'conces',v.conces,'class="vi x" list="dl-conces" placeholder="Concessionnaire"')}</td>
  <td>${vIn(k,'rep',v.rep,'class="vi w"')}</td>
  <td>${vIn(k,'prix',v.prix,'class="vi n" inputmode="decimal"')}</td>
  <td>${vIn(k,'facture',v.facture,'class="vi s" placeholder="#" style="width:64px" title="No de facture One-Eighty"')}</td>
  <td>${vIn(k,'livraison',v.livraison,'type="date" class="vi d"')}</td>
  <td><select class="vi" data-vk="${k}" data-f="statut" aria-label="Statut" ${DB?'':'disabled'}>${STATUTS.map(([val,l])=>`<option value="${val}" ${st===val?'selected':''}>${l}</option>`).join('')}</select></td>
  <td>${vIn(k,'note',v.note,'class="vi x" placeholder="Note"')}</td>
  <td>${vIn(k,'brut',v.brut,`class="vi n${num(v.brut)<0?' profit-neg':''}" inputmode="decimal" title="Brut de véh. (rapport One-Eighty)"`)}</td>
  <td class="c-del">${DB?`<button type="button" class="delrow" data-delsale="${k}" title="Supprimer cette ligne (doublon ou erreur)" aria-label="Supprimer la ligne ${i+1}">✕</button>`:''}</td></tr>`}
const HEAD='<thead><tr><th>#</th><th>Date</th><th>Stock</th><th>Année</th><th>Marque</th><th>Modèle</th><th>NIV</th><th>Concessionnaire</th><th>Rep. ventes</th><th class="num">Prix</th><th>Facture</th><th>Livraison</th><th>Statut</th><th>Note</th><th class="num">Profit</th><th class="c-del" title="Supprimer une ligne"></th></tr></thead>';
function render(){
  setSnap();
  const months=[...new Set([todayTO().slice(0,7),...allRows().map(x=>(x.n.soldAt||'').slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m))])].sort().reverse();
  const rows=monthRows(), mo=MOIS[+VMONTH.slice(5)-1], mName=mo+' '+VMONTH.slice(0,4);
  const conces=[...new Set(allRows().map(x=>String(x.n.vente?.conces||'').trim()).filter(Boolean))].sort();
  document.getElementById('view').innerHTML=`<div class="vhead"><h2>Échanges ${esc(mName)}</h2>
   <label>Mois <select id="vmonth">${months.map(m=>`<option value="${m}" ${m===VMONTH?'selected':''}>${MOIS[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('')}</select></label></div>
   <div id="vsum" style="margin-top:10px"></div>
   <datalist id="dl-conces">${conces.map(a=>`<option value="${esc(a)}">`).join('')}</datalist>
   <p class="sec-title sec-add">Véhicules sortis en ${esc(mo)} (<span id="ecount">${rows.filter(alive).length}</span>) <button type="button" class="addrow" data-addsale title="Ajouter un échange" aria-label="Ajouter un échange en ${esc(mo)}" ${DB?'':'disabled'}>+</button></p>
   <div class="box"><div class="tbl" data-ts="mois"><table class="veh">${HEAD}<tbody>${rows.length?rows.map(rowHtml).join(''):`<tr><td colspan="16" class="empty-row">Aucun échange en ${esc(mo)}. Cliquez « Mettre à jour depuis One-Eighty » ou <b>+</b>.</td></tr>`}</tbody></table></div></div>
   <p class="hint">Couleurs : <span class="pill p-liv">Livré</span> <span class="pill p-ok">Comptabilisé</span> <span class="pill p-bad">Annulé</span> (exclu du compte). Le <b>✕</b> au bout de la ligne supprime un échange (doublon ou erreur). La date est la date de transaction dans One-Eighty. Le profit est le « Brut de véh. » du rapport One-Eighty.</p>`;
  summary(); topBars(document.getElementById('view'));
  document.getElementById('vmonth').onchange=e=>{VMONTH=e.target.value;render()};
}

// ---------- Saisie ----------
const vt={};
document.addEventListener('input',e=>{const i=e.target;
  if(!i.dataset||!i.dataset.vk)return;const k=i.dataset.vk,f=i.dataset.f;if(!NOTES[k])return;
  if(f==='soldAt'){NOTES[k]={...NOTES[k],soldAt:i.value}}else{NOTES[k]={...NOTES[k],vente:{...(NOTES[k].vente||{}),[f]:i.value}}}
  if(f==='statut'){const tr=i.closest('tr');if(tr)tr.className='st-'+i.value}
  if(f==='brut')i.classList.toggle('profit-neg',num(i.value)<0);
  summary();clearTimeout(vt[k]);vt[k]=setTimeout(()=>{saveNote(k);if(f==='soldAt')setTimeout(()=>{if(!document.activeElement?.dataset?.vk)render()},50)},i.tagName==='SELECT'||i.type==='date'?0:800)});
document.addEventListener('change',e=>{const i=e.target;if(i.tagName==='SELECT'&&i.dataset.vk)i.dispatchEvent(new Event('input',{bubbles:true}))});
function newDate(ym){const t=todayTO();if(ym===t.slice(0,7))return t;if(ym<t.slice(0,7)){const d=new Date(+ym.slice(0,4),+ym.slice(5),0);return ym+'-'+String(d.getDate()).padStart(2,'0')}return ym+'-01'}
async function addRow(){
  if(!DB)return;const k='EX-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  NOTES[k]={vendu:true,comment:'',soldAt:newDate(VMONTH),vente:{statut:'alivrer'}};render();
  const tr=document.querySelector(`tr[data-vrow="${k}"]`);if(tr){tr.classList.add('newrow');tr.scrollIntoView({block:'center',behavior:'smooth'})}
  const inp=document.querySelector(`input[data-vk="${k}"][data-f="stock"]`);if(inp)inp.focus({preventScroll:true});
  if(!await saveNote(k)){delete NOTES[k];render()}
}
async function delRow(k){
  const n=NOTES[k];if(!DB||!n)return;const v=n.vente||{};
  const what=[v.stock,[v.annee,v.marque,v.modele].filter(Boolean).join(' '),v.conces].filter(Boolean).join(' · ');
  if(!confirm('Supprimer cette ligne ?'+(what?'\n'+what:'')))return;
  clearTimeout(vt[k]);delete NOTES[k];render();
  try{await DB.collection('suivi').doc(k).delete();setStatus('Ligne supprimée')}catch(e){NOTES[k]=n;render();setStatus('Non supprimée : accès en lecture seule ?')}
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-addsale]');if(a){addRow();return}const d=e.target.closest('[data-delsale]');if(d)delRow(d.dataset.delsale)});

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

// ---------- Synchro One-Eighty (favori « ⟳ Échanges One-Eighty ») ----------
// Reçoit les factures d'échange lues dans One-Eighty (quote_load.asp?mode=dealertrade) : une ligne par facture. Un échange déjà au board
// (même proposition, ou même no de stock le même mois ou le mois d'à côté) est complété (champs vides seulement) ; sinon il est ajouté.
const monthsApart=(a,b)=>{const [ya,ma]=String(a||'').split('-').map(Number),[yb,mb]=String(b||'').split('-').map(Number);return (ya&&yb)?Math.abs((ya*12+ma)-(yb*12+mb)):99};
async function writeNotes(sets){const col=DB.collection('suivi');
  for(let i=0;i<sets.length;i+=400){const bb=DB.batch();for(const k of sets.slice(i,i+400))bb.set(col.doc(k),await noteDoc(NOTES[k]));await bb.commit()}}
async function importOE(data){
  if(!DB)throw new Error('Connectez-vous pour mettre à jour les échanges.');
  const rows=Array.isArray(data.rows)?data.rows:[];if(!rows.length)throw new Error('Aucun échange trouvé dans One-Eighty pour la période.');
  const t=x=>String(x??'').trim();let added=0,upd=0,same=0,quotes=0;const sets=[],bak={};
  for(const r of rows){
    if(!t(r.facture)){quotes++;continue}                         // proposition pas encore facturée
    const stock=normName(r.stock),date=t(r.date).slice(0,10);if(!stock||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const v={stock:t(r.stock).toUpperCase(),annee:t(r.annee),marque:t(r.marque).toUpperCase(),modele:t(r.modele).toUpperCase(),niv:t(r.niv).slice(-6),conces:t(r.conces).toUpperCase(),rep:t(r.rep),prix:r.prix!=null&&r.prix!==''?String(num(r.prix)):'',facture:t(r.facture),oeId:t(r.id),brut:r.brut!=null&&r.brut!==''?String(Math.round(num(r.brut)*100)/100):''};
    let k=(Object.entries(NOTES).find(([,n])=>n&&n.vendu&&t(n.vente?.oeId)===v.oeId)||Object.entries(NOTES).find(([,n])=>n&&n.vendu&&normName(n.vente?.stock)===stock&&monthsApart(n.soldAt,date)<=1)||[])[0];
    if(!k){k='OE-'+v.oeId;bak[k]=undefined;NOTES[k]={vendu:true,comment:'',soldAt:date,vente:{...v,statut:'alivrer',importe:'One-Eighty proposition '+v.oeId}};sets.push(k);added++;continue}
    const n=NOTES[k],o={...(n.vente||{})};let ch=false;
    ['annee','marque','modele','niv','conces','rep','prix','facture','oeId'].forEach(f=>{if(!t(o[f])&&t(v[f])){o[f]=v[f];ch=true}});
    if(v.brut!==''&&t(o.brut)!==v.brut){o.brut=v.brut;ch=true}   // le profit suit toujours One-Eighty
    if(ch){bak[k]=n;NOTES[k]={...n,vente:o};sets.push(k);upd++}else same++;
  }
  if(sets.length){try{await writeNotes(sets)}catch(e){Object.entries(bak).forEach(([k,n])=>{if(n===undefined)delete NOTES[k];else NOTES[k]=n});render();throw new Error('Non enregistré ('+(e&&e.code==='permission-denied'?'accès refusé : règles Firebase à publier ou accès en lecture seule':e.message)+')')}}
  if(!document.activeElement?.dataset?.vk)render();else summary();
  const msg=`One-Eighty : ${added} échange${added>1?'s':''} ajouté${added>1?'s':''}, ${upd} complété${upd>1?'s':''}, ${same} déjà à jour`+(quotes?` · ${quotes} proposition${quotes>1?'s':''} pas encore facturée${quotes>1?'s':''} (ignorée${quotes>1?'s':''})`:'')+'.';
  setStatus(msg);return msg;
}

// ---------- Base partagée ----------
function setStatus(t){const el=document.getElementById('savestate');el.textContent=t;el.className='status ok';clearTimeout(el._t);el._t=setTimeout(()=>{el.textContent=DB?'Échanges partagés avec l\'équipe':'';el.className='status'},3000)}
const noteDoc=async n=>({vendu:!!n.vendu,comment:n.comment||'',soldAt:n.soldAt||'',vente:n.vente||{},by:USER?await USER.id().catch(()=>''):'',at:new Date().toISOString()});
async function saveNote(k){if(!DB)return false;const n=NOTES[k]||{};try{await DB.collection('suivi').doc(k).set(await noteDoc(n));setStatus('Enregistré');return true}catch(e){setStatus('Non enregistré : accès en lecture seule ?');return false}}
(async()=>{
  try{DB=await window.claude?.use?.('db');USER=await window.claude?.use?.('user')}catch(e){DB=null}
  if(!DB){document.getElementById('savestate').textContent='Connectez-vous pour voir les échanges.';render();return}
  let first=true;
  DB.collection('suivi').onSnapshot(s=>{const ae=document.activeElement?.dataset||{};
    if(typeof s.docChanges==='function')s.docChanges().forEach(ch=>{if(ch.type==='removed')delete NOTES[ch.doc.id]});
    LAST_AT='';s.docs.forEach(d=>{if(!d.exists)return;const x=d.data()||{};if(x.at&&x.at>LAST_AT)LAST_AT=x.at;if(ae.vk===d.id&&!first)return;NOTES[d.id]={vendu:!!x.vendu,comment:x.comment||'',soldAt:x.soldAt||'',vente:x.vente||{}}});
    first=false;if(!ae.vk)render();else summary()},e=>setStatus(e&&e.code==='permission-denied'?'Accès refusé : les règles Firebase des échanges ne sont pas encore publiées':'Synchronisation interrompue, rechargez la page'));
  setStatus('Échanges partagés avec l\'équipe');
})();
render();
window.EX_BOARD={render,importOE};
