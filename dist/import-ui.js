import {crestContent} from './team-images.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function api(path,body) {
 const response=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Matchroom-Request':'1'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok){if(response.status===401&&path!=='auth/login')window.dispatchEvent(new Event('admin-expired'));throw Error(result.error||'Request failed.');}return result;
}
export async function mountImports(onLoad) {
 const shell=document.querySelector('#imports');
 const editor=document.querySelector('#admin-imports');
 const home=document.querySelector('#home-matches');
 const stats=document.querySelector('#home-stats');
 shell.innerHTML='<div class="toolbar"><label>Working match<select id="saved-match"><option value="">No saved matches</option></select></label></div><p id="import-status" role="status" aria-live="polite"></p>';
 editor.innerHTML='<div class="section-title"><h2>Import XML</h2><span>Saved on the server</span></div><p>In Spiideo, open the recording → Info → Export tags. Import the XML, then attach the box score and tracker data on this console. Reimporting the same match preserves attachments and the saved lineup.</p><label>Tag export (.xml)<input id="xml-file" type="file" accept=".xml,application/xml,text/xml"></label><button id="import-xml">Import XML</button>';
 const $=s=>shell.querySelector(s);let current='',busy=false;
 const lookup=s=>shell.querySelector(s)||editor.querySelector(s);
 try{current=localStorage.getItem('d3-selected-match')||'';}catch{}
 const remember=id=>{current=id;try{localStorage.setItem('d3-selected-match',id);}catch{}};
 function state(value){busy=value;for(const id of ['#import-xml','#xml-file','#saved-match'])lookup(id).disabled=value;}
 function renderHome(rows) {
  if(stats)stats.innerHTML=`<div><span>Matches</span><strong>${rows.length}</strong></div><div><span>Events stored</span><strong>${rows.reduce((n,m)=>n+(m.counts?.events||0),0).toLocaleString()}</strong></div><div><span>Latest import</span><strong>${rows[0]?new Date(rows[0].importedAt).toLocaleDateString():'—'}</strong></div>`;
  if(!home)return;
  if(!rows.length){home.innerHTML='<div class="empty-home"><h2>No games yet</h2><p>When an admin imports a Spiideo XML export, matches appear here. Tap a game to open the pitch.</p></div>';return;}
  home.innerHTML=rows.map(m=>{
   const teams=m.contenders||[];
   const homeTeam=teams[0]?.teamName||'Home';
   const awayTeam=teams[1]?.teamName||'Away';
   return `<button class="game-card" type="button" data-game="${esc(m.gameId)}"><div class="versus"><div class="game-side"><span class="crest">${crestContent(teams[0])}</span><b>${esc(homeTeam)}</b></div><div class="game-side"><span class="crest">${crestContent(teams[1])}</span><b>${esc(awayTeam)}</b></div></div><div class="game-meta"><strong>${(m.counts?.events??0).toLocaleString()}</strong><span>events</span><span>${esc(new Date(m.importedAt).toLocaleString())}</span></div></button>`;
  }).join('');
  home.querySelectorAll('[data-game]').forEach(b=>b.onclick=async()=>{
   if(busy||!b.dataset.game)return;
   state(true);
   try{await load(b.dataset.game);$('#import-status').textContent='';}
   catch(err){$('#import-status').textContent=err.message;}
   finally{state(false);}
  });
 }
 async function refresh(){const rows=await api('matches');$('#saved-match').innerHTML=rows.length?rows.map(m=>`<option value="${esc(m.gameId)}">${esc(m.contenders.map(c=>c.teamName).join(' vs '))} · ${esc(new Date(m.importedAt).toLocaleString())}</option>`).join(''):'<option value="">No saved matches</option>';renderHome(rows);return rows;}
 async function load(id){const match=await api('matches/'+id);onLoad(match);remember(id);$('#saved-match').value=id;}
 lookup('#import-xml').onclick=async()=>{
  if(busy)return;
  const file=lookup('#xml-file').files[0];
  if(!file){$('#import-status').textContent='Choose an XML export first.';return;}
  if(file.size>20*1024*1024){$('#import-status').textContent='Choose an XML export under 20 MB.';return;}
  state(true);$('#import-status').textContent='Reading and saving your match…';
  try {const match=await api('import',{xml:await file.text(),filename:file.name});onLoad(match);remember(match.gameId);await refresh();$('#saved-match').value=match.gameId;lookup('#xml-file').value='';$('#import-status').textContent=`Saved ${match.counts.events.toLocaleString()} events. Player ratings updated.`;}
  catch(e){$('#import-status').textContent=e.message;}
  finally{state(false);}
 };
 $('#saved-match').onchange=async e=>{if(!e.target.value||busy)return;state(true);try{await load(e.target.value);$('#import-status').textContent='Saved match loaded. Player ratings calculated from its XML events and any attached box score.';}catch(err){$('#saved-match').value=current;$('#import-status').textContent=err.message;}finally{state(false);}};
 state(true);
 try{
  const rows=await refresh();
  if(rows.length&&rows.some(m=>m.gameId===current))$('#saved-match').value=current;
 }
 catch(e){$('#import-status').textContent=e.message;}
 finally{state(false);}
 return {load,refresh:async()=>{await refresh();$('#saved-match').value=current;},selected:()=>current||$('#saved-match').value};
}
