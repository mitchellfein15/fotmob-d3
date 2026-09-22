import {ratedPlayers,teamStatistics,RATING_VERSION} from './ratings.js';
import {mountImports,api} from './import-ui.js';
import {mountBoxScore,playerTiming} from './boxscore-ui.js';
import {mountTracker,trackerDetails} from './tracker-ui.js';
import {mountPitch} from './pitch.js';
import {crestContent,mountTeamImages} from './team-images.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=s=>String(s??'').replaceAll('_',' ');
const time=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
let match=null,events=[],participants=[],contenders=[],view='lineups',team=0,filter='',eventType='all';
let admin=false,screen='home';
const trackerEditors=new Map();
let importControls={load:async()=>{},selected:()=>''};
const content=$('#content');
function showScreen() {
 document.body.dataset.screen=screen;
}
function openMatch() {
 screen='match';view='lineups';showScreen();
}
function loadMatch(m) {
 match=m;events=m.events;participants=m.participants;contenders=m.contenders;team=0;filter='';eventType='all';
 document.querySelectorAll('.team h1').forEach((el,i)=>el.textContent=contenders[i]?.teamName||'Team');
 document.querySelectorAll('.team small').forEach((el,i)=>el.textContent=['home','away'].includes(contenders[i]?.type)?contenders[i].type.toUpperCase():i?'AWAY':'HOME');
 document.querySelectorAll('#match-header .crest').forEach((el,i)=>el.innerHTML=crestContent(contenders[i]));
 const goals=contenders.map(c=>teamStatistics(match,c.id).goals);
 $('.score strong').textContent=goals.join(' : ');
 $('.score span').textContent='Goals';
 $('.notice strong').textContent=RATING_VERSION+' · ratings';
 $('.notice p').textContent='Built from match stats and attached tracker data. Higher shot and goal counts are selected, never added.';
 $('#match-header').hidden=false;$('#match-notice').hidden=false;
 if(screen!=='admin')openMatch();
 render();
}
function render() {
 if(view==='admin'&&!admin){view='lineups';screen=match?'match':'home';}
 if(screen==='admin'&&!admin)screen=match?'match':'home';
 showScreen();
 $('#admin-heading').hidden=!(admin&&screen==='admin');
 $('#admin-imports').hidden=!(admin&&screen==='admin');
 $('#summary').hidden=!match||screen!=='match';
 $('#match-header').hidden=!match||screen!=='match';
 $('#match-notice').hidden=!match||screen!=='match';
 $('#admin-open').setAttribute('aria-pressed',String(screen==='admin'));
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 content.className=view==='lineups'&&screen==='match'?'content-pitch':'';
 if(screen==='home')return;
 if(!match){content.innerHTML=`<div class="panel"><h2>No match selected</h2><p>${admin?'Import a Spiideo XML export to get started.':'An admin can import a match. Once available, open it from the home list.'}</p></div>`;return;}
 const passes=events.filter(e=>e.action.type==='pass');
 $('#summary').innerHTML=[['Events',events.length.toLocaleString()],['Passes',`${passes.filter(e=>e.action.outcome==='successful').length}/${passes.length}`],['Shots',contenders.reduce((sum,c)=>sum+teamStatistics(match,c.id).shots,0)],['Source',match.source==='spiideo-xml'?'XML':'Saved']].map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join('');
 if(screen==='admin'||view==='admin')renderAdmin();
 else if(view==='players')renderPlayers();
 else if(view==='timeline')renderTimeline();
 else if(view==='lineups'){
  content.replaceChildren();
  const pitch=document.createElement('article');
  content.append(pitch);
  mountPitch(pitch,match,{onPlayer:(id,teamId)=>{team=contenders.findIndex(c=>c.id===teamId);showPlayer(id);}});
 }else renderData();
}
function renderPlayers() {
 const rows=ratedPlayers(match,contenders[team].id).filter(p=>`${p.name} ${p.numberText}`.toLowerCase().includes(filter.toLowerCase()));
 content.innerHTML=`<div class="toolbar"><div class="segmented">${contenders.map((c,i)=>`<button data-team="${i}" class="${team===i?'selected':''}">${esc(c.shortName||c.teamName)}</button>`).join('')}</div><label class="search">Search<input id="search" placeholder="Name or number" value="${esc(filter)}"></label></div><div class="section-title"><h2>${esc(contenders[team].teamName)}</h2><span>${rows.length} players</span></div><div class="player-list">${rows.map(p=>`<button class="player-row" data-player="${esc(p.id)}"><span class="shirt">${esc(p.numberText??'—')}</span><span><b>${esc(p.name)}</b><div class="statline">${esc(p.position)} · ${p.minutes===null?'—':Math.round(p.minutes)+"'"} · ${p.completed}/${p.passes} passes</div></span><span class="rating ${p.rating>=7?'rating-good':''}">${p.rating?.toFixed(1)??'—'}</span></button>`).join('')||'<div class="empty-home">No matching players.</div>'}</div><p class="caption">Experimental v1 · Sorted by rating. Base 6.0, bounded to 1–10. *Best available minutes.</p>`;
 content.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{team=Number(b.dataset.team);filter='';render();});
 $('#search').oninput=e=>{const pos=e.target.selectionStart;filter=e.target.value;renderPlayers();$('#search').focus();$('#search').setSelectionRange(pos,pos);};
 content.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>showPlayer(b.dataset.player));
}
function ratingDetails(p) {
 return `<div class="rating-hero"><span class="rating ${p.rating>=7?'rating-good':''}">${p.rating?.toFixed(1)??'—'}</span><div><h3>${RATING_VERSION}</h3><p>${esc(p.coverage)} · ${esc(p.position)}</p></div></div><dl><dt>Starting score</dt><dd>${p.rating===null?'—':'6.00'}</dd>${p.contributions.map(c=>`<dt>${esc(c.label)}</dt><dd>${c.points>0?'+':''}${c.points.toFixed(2)}</dd>`).join('')}</dl><p class="caption">${p.rating===null?'No recorded appearance.':'Total rounded to one decimal and limited to 1–10. Missing statistics add no points. Short appearances are not scaled up.'}</p>`;
}
function showPlayer(id) {
 const p=ratedPlayers(match,contenders[team].id).find(p=>p.id===id);
 $('#detail-body').innerHTML=`<div class="eyebrow">PLAYER</div><h2>${esc(p.name)}</h2><p class="muted">${esc(contenders[team].teamName)} · #${esc(p.numberText??'—')}</p>${ratingDetails(p)}${trackerDetails(p.physicalStats)}${playerTiming(match,p.id)}<dl><dt>Completed passes</dt><dd>${p.completed} / ${p.passes}</dd><dt>Duels won / lost</dt><dd>${p.duelsWon} / ${p.duelsLost}</dd><dt>Shots / blocks</dt><dd>${p.shots} / ${p.blocks}</dd><dt>Cards</dt><dd>${p.cards}</dd></dl>`;$('#detail').showModal();
}
function renderTimeline() {
 const types=[...new Set(events.map(e=>e.action.type))].sort();
 const shown=events.filter(e=>eventType==='all'||e.action.type===eventType);
 content.innerHTML=`<div class="toolbar"><div><h2>Timeline</h2><p class="muted">Video clip ranges, not match minutes.</p></div><label>Event type<select id="event-type"><option value="all">All events</option>${types.map(t=>`<option ${t===eventType?'selected':''} value="${esc(t)}">${esc(label(t))}</option>`).join('')}</select></label></div><div class="timeline">${shown.map(e=>{const a=e.action,id=a.fromParticipant||a.participant||a.successfulParticipant,p=participants.find(p=>p.id===id);return `<article><span class="phase">P${esc(a.phase??'?')}</span><div><strong>${esc(label(a.type))}</strong><p>${esc(p?.name||(id?'Unmapped player':'Team event'))}${a.outcome?' · '+esc(label(a.outcome)):''}${a.duelType?' · '+esc(label(a.duelType)):''}</p><small>${e.clipStart!==undefined?'Video '+time(e.clipStart)+'–'+time(e.clipEnd):'Source timestamp '+esc(e.timestamp)}</small></div></article>`;}).join('')}</div>`;
 $('#event-type').onchange=e=>{eventType=e.target.value;renderTimeline();};
}
function renderData() {
 const c=match.counts||{},xml=match.source==='spiideo-xml';
 const totals=match.totals||contenders.map(c=>{const passes=events.filter(e=>e.action.type==='pass'&&e.action.fromContender===c.id);return {team:c.teamName,passes:passes.length,completed:passes.filter(e=>e.action.outcome==='successful').length,shots:events.filter(e=>e.action.type==='shot'&&e.action.contender===c.id).length,goals:events.filter(e=>e.action.type==='goal'&&e.action.contender===c.id).length};});
 content.innerHTML=`<div class="section-title"><h2>Match details</h2><span>${esc(new Date(match.importedAt).toLocaleString())}</span></div><div class="import-grid"><article class="panel"><h3>${esc(match.sourceFilename||'Saved match')}</h3><dl><dt>XML entries</dt><dd>${c.instances??'—'}</dd><dt>Repeated player/team entries</dt><dd>${c.representations??'—'}</dd><dt>Identical action rows collapsed</dt><dd>${c.duplicateRows??'—'}</dd><dt>Events retained</dt><dd>${events.length}</dd><dt>Player identities by team</dt><dd>${participants.length}</dd></dl><button id="export">Download match JSON</button>${xml?`<p><a class="download" href="/api/matches/${encodeURIComponent(match.gameId)}/source" download>Download original XML</a></p>`:''}</article><article class="panel"><h3>Still needs checking</h3><ul class="checklist">${(match.warnings||['Completeness and playing time remain unverified.']).map(w=>`<li>${esc(w)}</li>`).join('')}</ul></article></div><article class="panel"><h3>Team totals</h3><div class="table-wrap"><table><thead><tr><th>Team</th><th>Passes</th><th>Completed</th><th>Shots</th><th>Goals</th></tr></thead><tbody>${totals.map(t=>`<tr><td>${esc(t.team)}</td><td>${t.passes}</td><td>${t.completed}</td><td>${t.shots}</td><td>${t.goals}</td></tr>`).join('')}</tbody></table></div></article>`;
 $('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(match,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='match-'+match.gameId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const records=document.createElement('div');
 content.append(records);
 mountBoxScore(records,match,loadMatch);
}
function renderAdmin() {
 content.innerHTML=`<div class="section-title"><h2>${esc(contenders.map(c=>c.teamName).join(' vs '))}</h2><span>Saved for all viewers</span></div><div class="admin-summary"><span>XML: ${events.length.toLocaleString()} events</span><span>Box score: ${match.boxScore?'attached':'not attached'}</span><span>Tracker: ${Object.keys(match.trackerData||{}).length} teams</span></div><div id="admin-boxscore"></div><article id="admin-tracker" class="panel"></article><article id="admin-pitch"></article>`;
 const images=document.createElement('article');images.className='panel';content.querySelector('.admin-summary').after(images);
 const imageMatch=match;
 mountTeamImages(images,match,async updated=>{
  if(match===imageMatch){loadMatch(updated);const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Team image saved for all viewers.';content.querySelector('.admin-summary').after(status);}
  try{await importControls.refresh();}catch(e){$('#import-status').textContent='Image saved. Could not refresh match cards: '+e.message;}
 });
 mountBoxScore($('#admin-boxscore'),match,loadMatch,{editable:true});
 if(!trackerEditors.has(match.gameId))trackerEditors.set(match.gameId,{drafts:{}});
 mountTracker($('#admin-tracker'),match,loadMatch,trackerEditors.get(match.gameId));
 const editingMatch=match;
 mountPitch($('#admin-pitch'),match,{editable:true,onPlayer:(id,teamId)=>{team=contenders.findIndex(c=>c.id===teamId);showPlayer(id);},onSave:async(teamId,positions)=>{
  const updated=await api('pitch',{gameId:editingMatch.gameId,teamId,positions});
  if(match===editingMatch)match.pitchPositions=updated.pitchPositions;
 }});
}
function setAdmin(value) {
 admin=value;
 $('#access-mode').textContent=admin?'ADMIN MODE':'VIEW ONLY';
 $('#admin-open').textContent=admin?'Admin dashboard':'Admin sign in';
 $('#admin-logout').hidden=!admin;
 if(!admin&&(view==='admin'||screen==='admin')){view='lineups';screen=match?'match':'home';}
 render();
}
$('#home-link').onclick=e=>{e.preventDefault();screen='home';if(view==='admin')view='lineups';render();};
$('#back-home').onclick=()=>{screen='home';if(view==='admin')view='lineups';render();};
$('#admin-open').onclick=async()=>{
 if(admin){
  view='admin';screen='admin';
  const id=importControls.selected();
  if(!match&&id&&id!=='')await importControls.load(id);
  else render();
  return;
 }
 $('#admin-status').textContent='';$('#admin-dialog').showModal();$('#admin-password').focus();
 try{const state=await api('auth');if(!state.configured)$('#admin-status').textContent='Set ADMIN_PASSWORD on the server (at least 12 characters), then restart to enable admin sign-in.';}catch(e){$('#admin-status').textContent=e.message;}
};
$('#admin-close').onclick=()=>$('#admin-dialog').close();
$('#admin-dialog').addEventListener('close',()=>{$('#admin-password').value='';});
$('#admin-form').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{await api('auth/login',{password:$('#admin-password').value});$('#admin-dialog').close();view='admin';screen='admin';setAdmin(true);}
 catch(err){$('#admin-status').textContent=err.message;}
 finally{$('#admin-password').value='';button.disabled=false;}
};
$('#admin-logout').onclick=async()=>{
 try{await api('auth/logout',{});setAdmin(false);}
 catch(e){$('#import-status').textContent='Sign out failed: '+e.message;}
};
window.addEventListener('admin-expired',()=>{setAdmin(false);$('#import-status').textContent='Your admin session ended. Sign in again to make changes.';});
async function refreshAuth(){try{const state=await api('auth');if(state.authenticated!==admin)setAdmin(state.authenticated);}catch{if(admin)setAdmin(false);}}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;screen='match';render();});
$('#manage').onclick=()=>{view='data';screen='match';render();};
$('#close').onclick=()=>$('#detail').close();
render();
importControls=await mountImports(m=>{
 const stayAdmin=screen==='admin'||view==='admin';
 if(stayAdmin)screen='admin';
 loadMatch(m);
 if(stayAdmin){screen='admin';view='admin';render();}
});
await refreshAuth();
setInterval(refreshAuth,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAuth();});
