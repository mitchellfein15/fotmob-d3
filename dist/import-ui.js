const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function api(path,body) {
 const response=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Matchroom-Request':'1'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed.');return result;
}
export async function mountImports(onLoad) {
 const shell=document.querySelector('#imports');
 shell.innerHTML=`<div class="section-title"><h2>Import a match</h2><span>Saved on this computer</span></div><p>In Spiideo, open the recording → Info → Export tags. Choose the downloaded XML below.</p><div class="toolbar"><label>Tag export (.xml)<input id="xml-file" type="file" accept=".xml,application/xml,text/xml"></label><button id="import-xml">Import XML</button><label>Saved match<select id="saved-match"><option value="">No saved matches</option></select></label></div><p id="import-status" role="status" aria-live="polite"></p>`;
 const $=s=>shell.querySelector(s);let current='',busy=false;
 try{current=localStorage.getItem('d3-selected-match')||'';}catch{}
 const remember=id=>{current=id;try{localStorage.setItem('d3-selected-match',id);}catch{}};
 function state(value){busy=value;for(const id of ['#import-xml','#xml-file','#saved-match'])$(id).disabled=value;}
 async function refresh(){const rows=await api('matches');$('#saved-match').innerHTML=rows.length?rows.map(m=>`<option value="${esc(m.gameId)}">${esc(m.contenders.map(c=>c.teamName).join(' vs '))} · ${esc(new Date(m.importedAt).toLocaleString())}</option>`).join(''):'<option value="">No saved matches</option>';return rows;}
 async function load(id){const match=await api('matches/'+id);onLoad(match);remember(id);$('#saved-match').value=id;}
 $('#import-xml').onclick=async()=>{
  if(busy)return;
  const file=$('#xml-file').files[0];
  if(!file){$('#import-status').textContent='Choose an XML export first.';return;}
  if(file.size>20*1024*1024){$('#import-status').textContent='Choose an XML export under 20 MB.';return;}
  state(true);$('#import-status').textContent='Reading and saving your match…';
  try {const match=await api('import',{xml:await file.text(),filename:file.name});onLoad(match);remember(match.gameId);await refresh();$('#saved-match').value=match.gameId;$('#xml-file').value='';$('#import-status').textContent=`Saved ${match.counts.events.toLocaleString()} events. ${match.counts.representations.toLocaleString()} repeated player/team entries excluded; ${match.counts.duplicateRows} identical action rows collapsed. See Import details for totals and limitations.`;}
  catch(e){$('#import-status').textContent=e.message;}
  finally{state(false);}
 };
 $('#saved-match').onchange=async e=>{if(!e.target.value||busy)return;state(true);try{await load(e.target.value);$('#import-status').textContent='Saved match loaded.';}catch(err){$('#saved-match').value=current;$('#import-status').textContent=err.message;}finally{state(false);}};
 state(true);
 try{const rows=await refresh();if(rows.length)await load(rows.some(m=>m.gameId===current)?current:rows[0].gameId);}
 catch(e){$('#import-status').textContent=e.message;}
 finally{state(false);}
}
