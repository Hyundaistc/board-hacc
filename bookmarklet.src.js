var APP='__APP__';
var HO='https://salesportal-hacc.am.hyundai-corp.io';
if(location.origin!==HO){alert('Ouvrez d\'abord le portail HACC (liste de stock), puis cliquez ce favori.');return;}
var w=window.open(APP+'#import','hacc_board');
var AO=new URL(APP).origin;
var SEL_L=['ZZLCAR_TXT','ZZMDYEAR','LSCCD_TXT','ZZEXTCL_TXT','ZZINTCL_TXT','VHVIN','ZODRNO','VBELN','LOCTNT','LGORTX','ZZETADT','AGING_DAYS','SOLD_STATUS','ZDEMO','ZPMON','RECALL_CNT','ZHOLDBAK'];
var SEL_O=['ZZLCAR_TXT','ZZMDYEAR','LSCCD_TXT','ZZEXTCL_TXT','ZZINTCL_TXT','ZODRNO','ZODRTYP_DESC','ZPMON'];
function u(dt,loc,ex){return HO+'/sap/opu/odata/sap/ZGWSDD77120_SRV/ZGWSDD77120_I_DATASet?sap-language=en&menu=dealerstocklist&rfc=ZFSDD_DP_LIST_DEALER_STK_DT&'+(dt==='S'?'$expand=T_ORDERS&$select='+SEL_O.map(function(f){return 'T_ORDERS/'+f}).join(','):'$expand=T_LIST&$select='+SEL_L.map(function(f){return 'T_LIST/'+f}).join(','))+"&$format=json&$filter=I_BUKRS%20eq%20%271300%27%20and%20I_LANGU%20eq%20%27FR%27%20and%20I_DEALER%20eq%20%27B06AA31052%27%20and%20I_MDYEAR%20eq%20%27%27%20and%20I_VHVIN%20eq%20%27%27%20and%20I_MODEL%20eq%20%27%27%20and%20I_USAGE%20eq%20%27%27%20and%20I_LOCATION%20eq%20%27"+loc+"%27%20and%20I_HOLDBACK_FLG%20eq%20%27%27%20and%20I_UNSOLD%20eq%20%27%27%20and%20I_DTYPE%20eq%20%27"+dt+"%27"+(ex?'%20and%20I_AGING_RNG%20eq%20%27%27%20and%20I_LSCCD%20eq%20%27%27%20and%20I_TRIM%20eq%20%27%27%20and%20I_EXCOL%20eq%20%27%27%20and%20I_INCOL%20eq%20%27%27':'');}
var L5='220000000_230114000_270114001_230114500_230110000';
var P=[['D','',false,'T_LIST'],['I',L5,true,'T_LIST'],['O',L5,true,'T_LIST'],['S',L5,true,'T_ORDERS']];
function t(v){return (v==null||v==='0000-00-00')?'':String(v).trim();}
function row(g,x){return [g,t(x.ZZLCAR_TXT),t(x.ZZMDYEAR),t(x.LSCCD_TXT),t(x.ZZEXTCL_TXT),t(x.ZZINTCL_TXT),t(x.VHVIN),t(x.ZODRNO||x.VBELN),t(x.LOCTNT||x.ZODRTYP_DESC),t(x.LGORTX),t(x.ZZETADT),t(x.AGING_DAYS),t(x.SOLD_STATUS),t(x.ZDEMO),t(x.ZPMON)==='000000'?'':t(x.ZPMON),t(x.RECALL_CNT),t(x.ZHOLDBAK)];}
Promise.all(P.map(function(p){return fetch(u(p[0],p[1],p[2]),{credentials:'include',headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('HACC a répondu '+r.status);return r.json();}).then(function(j){var d=j.d.results[0];return (d[p[3]]&&d[p[3]].results)||[];});})).then(function(g){
  var G={D:'D',I:'T',O:'O',S:'S'},rows=[];
  P.forEach(function(p,i){g[i].forEach(function(x){rows.push(row(G[p[0]],x));});});
  if(rows.length<20)throw new Error('trop peu de véhicules reçus ('+rows.length+')');
  var msg={type:'hacc-board-seed',id:String(Date.now()),date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'}),rows:rows};
  var n=0,iv=setInterval(function(){if(n++>300){clearInterval(iv);return;}try{w.postMessage(msg,AO);}catch(e){}},1000);
  window.addEventListener('message',function(e){if(e.origin!==AO||!e.data)return;if(e.data.type==='hacc-board-ready'){try{w.postMessage(msg,AO);}catch(x){}}if(e.data.type==='hacc-board-ack'){clearInterval(iv);alert((e.data.ok?'✓ ':'✗ ')+e.data.msg);}});
}).catch(function(e){alert('Lecture HACC impossible : '+e.message+'\nVérifiez que vous êtes connecté(e) au portail HACC.');});
