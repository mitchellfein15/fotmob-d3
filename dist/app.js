import {ratedPlayers,teamStatistics,RATING_VERSION} from './ratings.js';
import {mountImports} from './import-ui.js';
import {mountBoxScore,playerTiming} from './boxscore-ui.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=s=>String(s??'').replaceAll('_',' ');
const time=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
let match=null,events=[],participants=[],contenders=[],view='players',team=0,filter='',eventType='all';
const content=$('#content');
function loadMatch(m) {
 match=m;events=m.events;participants=m.participants;contenders=m.contenders;team=0;filter='';eventType='all';
 document.querySelectorAll('.team h1').forEach((el,i)=>el.textContent=contenders[i]?.teamName||'Team');
 document.querySelectorAll('.team small').forEach((el,i)=>el.textContent=['home','away'].includes(contenders[i]?.type)?contenders[i].type.toUpperCase():'TEAM');
 document.querySelectorAll('.crest').forEach((el,i)=>el.textContent=(contenders[i]?.teamName||'').split(/\s+/).map(s=>s[0]).join('').slice(0,4));
 const goals=contenders.map(c=>teamStatistics(match,c.id).goals);
 $('.score strong').textContent=goals.join(' : ');
 $('.score span').textContent='Higher source totals';
 $('.notice strong').textContent=RATING_VERSION+' · player ratings';
 $('.notice p').textContent='Ratings use available on-ball statistics. Higher shot and goal counts are selected, never added. Select a player to see the breakdown.';
 $('#match-header').hidden=false;$('#match-notice').hidden=false;
 render();
}
function render() {
 $('#summary').hidden=!match;
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 if(!match){content.innerHTML='<div class="panel"><h2>No match imported yet</h2><p>Choose a Spiideo XML export above to load player statistics and the event timeline.</p></div>';return;}
 const passes=events.filter(e=>e.action.type==='pass');
 $('#summary').innerHTML=[['Imported events',events.length.toLocaleString()],['Passes completed',`${passes.filter(e=>e.action.outcome==='successful').length} / ${passes.length}`],['Shots',contenders.reduce((sum,c)=>sum+teamStatistics(match,c.id).shots,0)],['Source',match.source==='spiideo-xml'?'XML export':'Saved match']].map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join('');
 if(view==='players')renderPlayers();else if(view==='timeline')renderTimeline();else if(view==='lineups')mountBoxScore(content,match,loadMatch);else renderData();
}
function renderPlayers() {
 const rows=ratedPlayers(match,contenders[team].id).filter(p=>`${p.name} ${p.numberText}`.toLowerCase().includes(filter.toLowerCase()));
 content.innerHTML=`<div class="toolbar"><div class="segmented">${contenders.map((c,i)=>`<button data-team="${i}" class="${team===i?'selected':''}">${esc(c.shortName||c.teamName)}</button>`).join('')}</div><label class="search">Search players<input id="search" placeholder="Name or shirt number" value="${esc(filter)}"></label></div><div class="section-title"><h2>${esc(contenders[team].teamName)}</h2><span>${rows.length} players shown</span></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Rating</th><th>Minutes*</th><th>Passes</th><th>Accuracy</th><th>Duels W / L</th><th>Shots</th><th>Blocks</th><th>Cards</th></tr></thead><tbody>${rows.map(p=>`<tr><td><button class="player" data-player="${esc(p.id)}"><span class="shirt">${esc(p.numberText??'—')}</span><span><b>${esc(p.name)}</b><small>${esc(p.position)} · ${esc(p.coverage)}</small></span></button></td><td><span class="rating ${p.rating>=7?'rating-good':''}">${p.rating?.toFixed(1)??'—'}</span></td><td>${p.minutes===null?'—':Math.round(p.minutes)}</td><td>${p.completed}<span class="muted"> / ${p.passes}</span></td><td>${p.passes?Math.round(p.completed/p.passes*100)+'%':'—'}</td><td>${p.duelsWon} / ${p.duelsLost}</td><td>${p.shots}</td><td>${p.blocks}</td><td>${p.cards}</td></tr>`).join('')||'<tr><td colspan="9">No matching players.</td></tr>'}</tbody></table></div><p class="caption">Experimental v1 · Sorted by rating. Base 6.0, bounded to 1–10; no per-90 extrapolation. Shots use the higher player count from either source. Confirmed erroneous Wooster identities are excluded. *Best available minutes, rounded. Team totals are selected separately and can differ from player sums.</p>`;
 content.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{team=Number(b.dataset.team);filter='';render();});
 $('#search').oninput=e=>{const pos=e.target.selectionStart;filter=e.target.value;renderPlayers();$('#search').focus();$('#search').setSelectionRange(pos,pos);};
 content.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>showPlayer(b.dataset.player));
}
function ratingDetails(p) {
 return `<h3>${RATING_VERSION} · ${p.rating?.toFixed(1)??'No rating'}</h3><p>${esc(p.coverage)} · ${esc(p.position)}</p><dl><dt>Starting score</dt><dd>${p.rating===null?'—':'6.00'}</dd>${p.contributions.map(c=>`<dt>${esc(c.label)}</dt><dd>${c.points>0?'+':''}${c.points.toFixed(2)}</dd>`).join('')}</dl><p class="caption">${p.rating===null?'No recorded appearance.':'Total rounded to one decimal and limited to 1–10. Missing statistics add no points. Short appearances are not scaled up.'} This is a fun, experimental on-ball score, not a calibrated overall assessment.</p>`;
}
function showPlayer(id) {
 const p=ratedPlayers(match,contenders[team].id).find(p=>p.id===id);
 $('#detail-body').innerHTML=`<div class="eyebrow">PLAYER SNAPSHOT</div><h2>${esc(p.name)}</h2><p class="muted">${esc(contenders[team].teamName)} · #${esc(p.numberText??'—')}</p>${ratingDetails(p)}${playerTiming(match,p.id)}<dl><dt>Completed passes</dt><dd>${p.completed} / ${p.passes}</dd><dt>Duels won / lost</dt><dd>${p.duelsWon} / ${p.duelsLost}</dd><dt>Shots / blocks</dt><dd>${p.shots} / ${p.blocks}</dd><dt>Cards</dt><dd>${p.cards}</dd></dl>`;$('#detail').showModal();
}
function renderTimeline() {
 const types=[...new Set(events.map(e=>e.action.type))].sort();
 const shown=events.filter(e=>eventType==='all'||e.action.type===eventType);
 content.innerHTML=`<div class="toolbar"><div><h2>Event timeline</h2><p class="muted">Video clip ranges; these are not match minutes.</p></div><label>Event type<select id="event-type"><option value="all">All events</option>${types.map(t=>`<option ${t===eventType?'selected':''} value="${esc(t)}">${esc(label(t))}</option>`).join('')}</select></label></div><div class="timeline">${shown.map(e=>{const a=e.action,id=a.fromParticipant||a.participant||a.successfulParticipant,p=participants.find(p=>p.id===id);return `<article><span class="phase">Phase ${esc(a.phase??'?')}</span><div><strong>${esc(label(a.type))}</strong><p>${esc(p?.name||(id?'Unmapped player':'Team event'))}${a.outcome?' · '+esc(label(a.outcome)):''}${a.duelType?' · '+esc(label(a.duelType)):''}</p><small>${e.clipStart!==undefined?'Video '+time(e.clipStart)+'–'+time(e.clipEnd):'Source timestamp '+esc(e.timestamp)}</small></div></article>`;}).join('')}</div>`;
 $('#event-type').onchange=e=>{eventType=e.target.value;renderTimeline();};
}
function renderData() {
 const c=match.counts||{},xml=match.source==='spiideo-xml';
 const totals=match.totals||contenders.map(c=>{const passes=events.filter(e=>e.action.type==='pass'&&e.action.fromContender===c.id);return {team:c.teamName,passes:passes.length,completed:passes.filter(e=>e.action.outcome==='successful').length,shots:events.filter(e=>e.action.type==='shot'&&e.action.contender===c.id).length,goals:events.filter(e=>e.action.type==='goal'&&e.action.contender===c.id).length};});
 content.innerHTML=`<div class="section-title"><h2>Import details</h2><span>${esc(new Date(match.importedAt).toLocaleString())}</span></div><div class="import-grid"><article class="panel"><h3>${esc(match.sourceFilename||'Saved match')}</h3><dl><dt>XML entries</dt><dd>${c.instances??'—'}</dd><dt>Repeated player/team entries</dt><dd>${c.representations??'—'}</dd><dt>Identical action rows collapsed</dt><dd>${c.duplicateRows??'—'}</dd><dt>Events retained</dt><dd>${events.length}</dd><dt>Player identities by team</dt><dd>${participants.length}</dd></dl><button id="export">Download match JSON</button>${xml?`<p><a class="download" href="/api/matches/${encodeURIComponent(match.gameId)}/source" download>Download original XML</a></p>`:''}</article><article class="panel"><h3>What still needs checking</h3><ul class="checklist">${(match.warnings||['Completeness and playing time remain unverified.']).map(w=>`<li>${esc(w)}</li>`).join('')}</ul></article></div><article class="panel"><h3>Compare with Spiideo</h3><p>These totals are calculated from retained events. Compare them with the game’s statistics in Spiideo before relying on them.</p><div class="table-wrap"><table><thead><tr><th>Team</th><th>Passes</th><th>Completed</th><th>Shots</th><th>Goals</th></tr></thead><tbody>${totals.map(t=>`<tr><td>${esc(t.team)}</td><td>${t.passes}</td><td>${t.completed}</td><td>${t.shots}</td><td>${t.goals}</td></tr>`).join('')}</tbody></table></div><p class="caption">Reimporting the same events reuses the saved match. A changed export is saved separately so you can compare revisions.</p></article>`;
 $('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(match,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='match-'+match.gameId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render();});
$('#manage').onclick=()=>{view='data';render();};
$('#close').onclick=()=>$('#detail').close();
render();
await mountImports(loadMatch);
