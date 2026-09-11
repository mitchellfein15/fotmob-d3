import { mergeRecords, validate, playersFor } from './model.js';
import {mountSync} from './sync-ui.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=s=>String(s??'').replaceAll('_',' ');
let events=[],participants=[],contenders=[],view='players',team=0,filter='',eventType='all',message='';
const content=$('#content');
let coverage='partial';
function loadMatch(m){events=m.events;participants=m.participants;contenders=m.contenders;team=0;filter='';eventType='all';coverage=m.coverage;document.querySelectorAll('.team h1').forEach((el,i)=>el.textContent=contenders[i]?.teamName||contenders[i]?.name||'Team');document.querySelectorAll('.crest').forEach((el,i)=>el.textContent=contenders[i]?.shortName||contenders[i]?.type||'Team');document.querySelector('.notice strong').textContent='All visible pages fetched · ratings pending';document.querySelector('.notice p').textContent='Spiideo processing completion and playing time are still unverified.';render();}
try {
 const responses=await Promise.all(['events','participants','contenders'].map(async n=>{const r=await fetch(`/data/${n}.json`);if(!r.ok)throw Error('Could not load sample data.');return r.json();}));
 [events,participants,contenders]=responses.map(r=>r.content);
 render();
 mountSync(loadMatch);
}catch(e){content.textContent=e.message;}
function render(){
 const passes=events.filter(e=>e.action.type==='pass');
 $('#summary').innerHTML=[['Imported events',events.length],['Passes completed',`${passes.filter(e=>e.action.outcome==='successful').length} / ${passes.length}`],['Shots',events.filter(e=>e.action.type==='shot').length],['Coverage',coverage==='partial'?'Partial':'Pages fetched']].map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join('');
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 if(view==='players') renderPlayers(); else if(view==='timeline') renderTimeline();else renderData();
}
function renderPlayers(){
 const rows=playersFor(events,participants,contenders[team].id).filter(p=>`${p.name} ${p.numberText}`.toLowerCase().includes(filter.toLowerCase()));
 content.innerHTML=`<div class="toolbar"><div class="segmented">${contenders.map((c,i)=>`<button data-team="${i}" class="${team===i?'selected':''}">${esc(c.shortName)}</button>`).join('')}</div><label class="search">Search players <input id="search" placeholder="Name or shirt number" value="${esc(filter)}"></label></div><div class="section-title"><h2>${esc(contenders[team].teamName)}</h2><span>${rows.length} players shown</span></div>${!participants.some(p=>p.contenderId===contenders[team].id)?'<p class="muted">Player names will appear when the roster is imported.</p>':''}<div class="table-wrap"><table><thead><tr><th>Player</th><th>Rating</th><th>Passes</th><th>Accuracy</th><th>Duels W / L</th><th>Shots</th><th>Blocks</th></tr></thead><tbody>${rows.map(p=>`<tr><td><button class="player" data-player="${esc(p.id)}"><span class="shirt">${esc(p.numberText??'—')}</span><span><b>${esc(p.name)}</b><small>${p.unknown?'Roster needed':p.inStartingLineup?'Starting XI':'Bench'}${p.goalkeeper?' · GK':''}${!p.events?' · No sampled actions':''}</small></span></button></td><td><span class="rating" title="Full match coverage and playing time required">—</span></td><td>${p.completed}<span class="muted"> / ${p.passes}</span></td><td>${p.passes?Math.round(p.completed/p.passes*100)+'%':'—'}</td><td>${p.duelsWon} / ${p.duelsLost}</td><td>${p.shots}</td><td>${p.blocks}</td></tr>`).join('')||'<tr><td colspan="7">No matching players.</td></tr>'}</tbody></table></div><p class="caption">Statistics reflect loaded events; processing completion remains unverified. Bench status does not establish whether a player appeared.</p>`;
 content.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{team=Number(b.dataset.team);filter='';render();});
 $('#search').oninput=e=>{const pos=e.target.selectionStart;filter=e.target.value;renderPlayers();$('#search').focus();$('#search').setSelectionRange(pos,pos);};
 content.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>showPlayer(b.dataset.player));
}
function showPlayer(id){const p=playersFor(events,participants,contenders[team].id).find(p=>p.id===id);$('#detail-body').innerHTML=`<div class="eyebrow">PLAYER SNAPSHOT</div><h2>${esc(p.name)}</h2><p class="muted">${esc(contenders[team].teamName)} · #${esc(p.numberText??'—')}</p><div class="notice"><strong>Rating pending</strong></div><p>Full match events and verified playing time are needed before calculating a performance rating.</p><dl><dt>Completed passes</dt><dd>${p.completed} / ${p.passes}</dd><dt>Duels won / lost</dt><dd>${p.duelsWon} / ${p.duelsLost}</dd><dt>Shots / blocks</dt><dd>${p.shots} / ${p.blocks}</dd><dt>Cards in sample</dt><dd>${p.cards}</dd></dl>`;$('#detail').showModal();}
function renderTimeline(){
 const types=[...new Set(events.map(e=>e.action.type))].sort();
 const shown=events.filter(e=>eventType==='all'||e.action.type===eventType).sort((a,b)=>a.timestamp-b.timestamp);
 content.innerHTML=`<div class="toolbar"><div><h2>Event timeline</h2><p class="muted">Ordered by source timestamp. Match minutes are not yet verified.</p></div><label>Event type <select id="event-type"><option value="all">All events</option>${types.map(t=>`<option ${t===eventType?'selected':''} value="${esc(t)}">${esc(label(t))}</option>`).join('')}</select></label></div><div class="timeline">${shown.map(e=>{const a=e.action;const id=a.fromParticipant||a.participant||a.successfulParticipant;const p=participants.find(p=>p.id===id);return `<article><span class="phase">Phase ${esc(a.phase??'?')}</span><div><strong>${esc(label(a.type))}</strong><p>${esc(p?.name||(id?'Unmapped player · '+id.slice(0,6):'Team event'))}${a.outcome?' · '+esc(label(a.outcome)):''}${a.duelType?' · '+esc(a.duelType):''}</p><small>Source timestamp ${esc(e.timestamp)}</small></div></article>`;}).join('')}</div>`;
 $('#event-type').onchange=e=>{eventType=e.target.value;renderTimeline();};
}
function renderData(){content.innerHTML=`<div class="section-title"><h2>Build out this match</h2><span>Local session</span></div><div class="import-grid"><article class="panel"><h3>Import Spiideo JSON</h3><p>Add event pages or either team’s participant response. Matching IDs update existing records; older revisions are ignored.</p><label>Response type<select id="import-kind"><option value="events">Match events</option><option value="participants">Participants</option></select></label><label class="file">Choose JSON or text file<input id="import-file" type="file" accept=".json,.txt,application/json,text/plain"></label><p id="message" role="status">${esc(message)}</p><small>Imports stay in memory until this page is reloaded. Export your session to keep them.</small><button id="export">Export session JSON ↓</button></article><article class="panel"><h3>Coverage checklist</h3><ul class="checklist"><li>✓ Home and away teams identified</li><li>✓ ${participants.filter(p=>p.type==='player').length} player records loaded</li><li>✓ ${events.length} unique events loaded</li><li>○ Full event coverage unverified</li><li>○ Period timing and minutes missing</li><li>○ Processing completion unverified</li></ul><p>Ratings remain pending even after importing a last page: earlier pages and timing must also be verified.</p></article></div><article class="panel"><h3>Next-day automation</h3><p>Use the Spiideo connection panel above to sync all event and roster pages. Synced matches persist on this computer. Scheduling runs while the server is open and pauses when access expires.</p></article>`;
 $('#import-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>20*1024*1024)throw Error('File is too large; use a response under 20 MB.');const kind=$('#import-kind').value;const records=validate(JSON.parse(await f.text()),kind,contenders);if(kind==='events')events=mergeRecords(events,records);else participants=mergeRecords(participants,records);message=`Imported ${records.length} records successfully. Coverage remains unverified.`;render();}catch(err){$('#message').textContent=err.message;}};
 $('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({contenders,participants,events,coverage,ratings:null},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='d3-match-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render();});
$('#manage').onclick=()=>{view='data';render();};$('#close').onclick=()=>$('#detail').close();

// Optional page-scoped access to the same visible player statistics.
if (document.modelContext?.registerTool) {
 const lifecycle = new AbortController();
 try {
  Promise.resolve(document.modelContext.registerTool({
   name:'read_player_statistics',
   description:'Read imported player statistics for one team. Results reflect imported pages and contain no ratings; processing completion is unverified.',
   inputSchema:{type:'object',properties:{side:{type:'string',enum:['home','away']}},required:['side'],additionalProperties:false},
   annotations:{readOnlyHint:true,untrustedContentHint:true},
   execute(input){if(!input || !['home','away'].includes(input.side))throw Error('Choose home or away.');const contender=contenders.find(c=>c.type===input.side);if(!contender)throw Error('Data is not loaded yet.');return {coverage,ratings:null,players:playersFor(events,participants,contender.id)};}
  },{signal:lifecycle.signal})).catch(()=>{});
 }catch{}
 addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
