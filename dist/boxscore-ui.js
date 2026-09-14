import {api} from './import-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=s=>s===null||s===undefined?'—':`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
export function officialPlayer(match,id) {
 const b=match?.boxScore,link=b?.links.find(l=>l.participantId===id);
 if(id.startsWith('official:'))return b?.players.find(p=>p.id===id.slice(9));
 return link?b.players.find(p=>p.id===link.officialId):null;
}
export function minuteLabel(match,id) {return clock(officialPlayer(match,id)?.derivedSeconds);}
export function playerTiming(match,id) {
 const p=officialPlayer(match,id);
 if(!p)return '<p>No matched official playing-time record. Rating uses available XML events.</p>';
 return `<h3>Official match record</h3><p>${esc(p.position||'Position not listed')} · ${p.starter?'Starter':'Substitute'} · Official #${esc(p.jersey)}</p><dl><dt>Reconstructed time</dt><dd>${clock(p.derivedSeconds)}</dd><dt>Published minutes</dt><dd>${p.publishedMinutes??'—'}</dd>${p.goalkeeper?`<dt>Goalkeeper clock</dt><dd>${clock(p.goalkeeper.seconds)}</dd>`:''}<dt>Official shots / goals</dt><dd>${p.stats.shots??'—'} / ${p.stats.goals??'—'}</dd></dl><p class="caption">${p.derivedSeconds===null?'The substitution sequence could not be verified.':'Time reconstructed from official play-by-play; not aligned to Spiideo video clips.'}</p>${p.stints.length?`<details><summary>Playing stints</summary><ul>${p.stints.map(s=>`<li>Period ${s.period}: ${clock(s.start)}–${clock(s.end)} (${clock(s.end-s.start)})</li>`).join('')}</ul></details>`:''}`;
}
function comparisonTable(rows) {return `<div class="table-wrap"><table><thead><tr><th>Team</th><th>Spiideo shots</th><th>Official shots</th><th>Spiideo goals</th><th>Official goals</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.xmlTeam)} (${esc(r.teamKey)})</td><td>${r.xml.shots}</td><td>${r.official.shots}</td><td>${r.xml.goals}</td><td>${r.official.goals}</td></tr>`).join('')}</tbody></table></div>`;}
function warningList(warnings){return `<ul class="checklist">${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`;}
export function mountBoxScore(container,match,onLoad) {
 const b=match.boxScore;
 container.innerHTML=`<article class="panel"><h2>Official box score</h2><p>Attach the athletics website’s lineup, positions, and playing-time records to this XML match.</p><label>Box-score URL<input id="box-url" type="url" placeholder="https://athletics.case.edu/boxscore.aspx?id=…&path=msoc" value="${esc(b?.sourceUrl||'')}"></label><p class="caption">Supports men’s soccer box scores from Case Western and Wooster. Confirm the game date in the preview.</p><details><summary>Use a saved webpage if the website is unavailable</summary><p>On the box-score page, save the complete webpage as HTML. Choose that .html file here and enter its original URL above.</p><label>Saved box-score HTML<input id="box-file" type="file" accept=".html,.htm,text/html"></label></details><button id="box-preview">Preview box score</button><p id="box-status" role="status" aria-live="polite"></p><div id="box-draft"></div></article><div id="box-attached"></div>`;
 const $=s=>container.querySelector(s);
 const previewButton=$('#box-preview'),alive=()=>container.querySelector('#box-preview')===previewButton;
 function attached() {
  if(!b){$('#box-attached').innerHTML='<p class="muted">No official box score attached yet. Spiideo events remain unchanged.</p>';return;}
  $('#box-attached').innerHTML=`<article class="panel"><div class="section-title"><h2>Lineups & minutes · ${esc(b.date)}</h2><a class="download" href="${esc(b.sourceUrl)}" target="_blank" rel="noopener">Official source</a></div><p>${b.players.length} official players · ${b.substitutions.length} substitution records · ${b.timingComplete?'Playing stints reconstructed':'Playing stints need review'}</p><label>Official team<select id="official-team">${b.teams.map(t=>`<option value="${esc(t.key)}">${esc(match.contenders.find(c=>c.id===b.teamMapping[t.key])?.teamName||t.key)}</option>`).join('')}</select></label><div id="official-roster"></div><details><summary>Timing and data checks</summary>${warningList(b.warnings)}<p class="caption">A complete substitution sequence does not establish event coverage or rating accuracy. Published minute discrepancies remain visible.</p></details></article><article class="panel"><h3>Source comparison</h3>${comparisonTable(b.comparisons)}<p class="caption">Official statistics and Spiideo events are preserved separately. Ratings select the higher count for overlapping shots and goals; they never add the sources together.</p>${b.unmatchedXml.length?`<h3>XML players without a same-team official match</h3>${warningList(b.unmatchedXml.map(p=>`${p.name} · ${p.team} · #${p.number}`))}`:''}</article>`;
  function roster(){const key=$('#official-team').value;$('#official-roster').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Player</th><th>Position</th><th>Lineup</th><th>Published min</th><th>Reconstructed</th><th>XML match</th></tr></thead><tbody>${b.players.filter(p=>p.teamKey===key).map(p=>{const l=b.links.find(l=>l.officialId===p.id);return `<tr><td>#${esc(p.jersey)} ${esc(p.name)}</td><td>${esc(p.position||'—')}</td><td>${p.starter?'Starter':'Substitute'}</td><td>${p.publishedMinutes??'—'}</td><td>${clock(p.derivedSeconds)}${p.stints.length?`<details><summary>Stints</summary>${p.stints.map(s=>`<div>P${s.period}: ${clock(s.start)}–${clock(s.end)}</div>`).join('')}</details>`:''}</td><td>${esc(l.status==='jersey-difference'?`Number differs: XML #${l.xmlJersey}`:l.status)}</td></tr>`;}).join('')}</tbody></table></div>`;}
  $('#official-team').onchange=roster;roster();
 }
 attached();
 $('#box-preview').onclick=async()=>{
  $('#box-preview').disabled=true;$('#box-status').textContent='Reading the official box score…';$('#box-draft').innerHTML='';
  try {
   const file=$('#box-file').files[0];if(file&&file.size>8*1024*1024)throw Error('Choose an HTML file under 8 MB.');
   const preview=await api('boxscore/preview',{gameId:match.gameId,url:$('#box-url').value,html:file?await file.text():undefined});
   if(!alive())return;
   const box=preview.boxScore;
   $('#box-status').textContent='Preview ready. Nothing has been attached yet.';
   $('#box-draft').innerHTML=`<h3>Review match · ${esc(box.date)}</h3><p>${box.teams.map(t=>`${esc(t.key)} → ${esc(match.contenders.find(c=>c.id===preview.teamMapping[t.key]).teamName)}`).join('<br>')}</p>${comparisonTable(preview.comparisons)}<p>${box.players.length} official players · ${preview.links.filter(l=>l.participantId).length} matched XML players · ${box.substitutions.length} substitutions</p><details open><summary>Player matching preview</summary><div class="table-wrap"><table><thead><tr><th>Team</th><th>Player</th><th>Official #</th><th>XML #</th><th>Match</th></tr></thead><tbody>${preview.links.map(l=>`<tr><td>${esc(l.teamKey)}</td><td>${esc(l.name)}</td><td>${esc(l.officialJersey)}</td><td>${esc(l.xmlJersey??'—')}</td><td>${esc(l.status)}</td></tr>`).join('')}</tbody></table></div></details>${warningList([...preview.warnings,...box.warnings,...preview.unmatchedXml.map(p=>`Unmatched XML player: ${p.name} (${p.team}).`)])}<label class="confirm-line"><input id="box-confirm" type="checkbox"> I checked that this is the same game and reviewed the team and player matches.</label><button id="box-attach" disabled>${b?'Replace attached box score':'Attach box score'}</button><button id="box-cancel">Cancel preview</button>`;
   $('#box-confirm').onchange=e=>$('#box-attach').disabled=!e.target.checked;
   $('#box-cancel').onclick=()=>{$('#box-draft').innerHTML='';$('#box-status').textContent='Preview cancelled. Saved match unchanged.';};
   $('#box-attach').onclick=async()=>{
    $('#box-attach').disabled=true;$('#box-cancel').disabled=true;$('#box-status').textContent='Saving official records…';
    try{const updated=await api('boxscore/attach',{token:preview.token,teamMapping:preview.teamMapping,confirmed:$('#box-confirm').checked});if(alive())onLoad(updated);}
    catch(e){if(alive()){$('#box-status').textContent=e.message;$('#box-attach').disabled=!$('#box-confirm').checked;$('#box-cancel').disabled=false;}}
   };
  }catch(e){if(alive())$('#box-status').textContent=e.message;}
  finally{if(alive())$('#box-preview').disabled=false;}
 };
}
