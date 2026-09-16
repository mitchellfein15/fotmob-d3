import {ratedPlayers} from './ratings.js';
import {PITCH,BANDS,category,splitLineup,tieredLayout,boundPosition,lastName,ratingColor} from './pitch-layout.js';
const d3=globalThis.d3;
let sequence=0;
const placeholder=(text,background='#344c43')=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${background}"/><text x="50" y="62" text-anchor="middle" fill="#edf1e8" font-family="sans-serif" font-size="32">${String(text).replace(/[<>&"']/g,'')}</text></svg>`);
// Match assets may be local files or HTTPS images; no executable URL schemes.
const asset=url=>typeof url==='string'&&(/^(https?:\/\/|\/[^/])/.test(url)||/^data:image\/(png|jpeg|webp);base64,/.test(url))?url:null;
function image(group,url,fallback,x,y,size,clip) {
 group.append('image').attr('href',asset(url)||fallback).attr('x',x).attr('y',y).attr('width',size).attr('height',size).attr('preserveAspectRatio','xMidYMid slice').attr('clip-path',`url(#${clip})`).on('error',function(){d3.select(this).on('error',null).attr('href',fallback);});
}
function playerNode(group,p,club,defs) {
 const id=`avatar-${++sequence}`,crest=`crest-${sequence}`;
 defs.append('clipPath').attr('id',id).append('circle').attr('r',30);
 defs.append('clipPath').attr('id',crest).append('circle').attr('cx',24).attr('cy',22).attr('r',11);
 group.append('circle').attr('r',32).attr('fill','#15251e').attr('stroke','#81988a').attr('stroke-width',2);
 const initials=p.name?.split(/\s+/).map(s=>s[0]).slice(0,2).join('')||'?';
 image(group,p.avatarUrl||p.photoUrl||p.official?.avatarUrl,placeholder(initials),-30,-30,60,id);
 group.append('circle').attr('cx',24).attr('cy',22).attr('r',13).attr('fill','#111c16');
 image(group,club.crestUrl||club.logoUrl,placeholder(club.shortName?.slice(0,2)||club.teamName?.split(/\s+/).map(s=>s[0]).slice(0,2).join('')||'FC','#53654d'),13,11,22,crest);
 group.append('rect').attr('x',12).attr('y',-37).attr('width',39).attr('height',23).attr('rx',11.5).attr('fill',ratingColor(p.rating)).attr('stroke','#18291f').attr('stroke-width',2);
 group.append('text').attr('x',31.5).attr('y',-21).attr('class','pitch-rating').text(Number.isFinite(p.rating)?p.rating.toFixed(1):'—');
 group.append('text').attr('y',53).attr('class','pitch-name').text(lastName(p));
 group.append('title').text(`${p.name} · ${p.position} · Rating ${p.rating??'unavailable'}`);
}
export function mountPitch(container,match,{onPlayer=()=>{},editable=false,onSave=async()=>{}}={}) {
 const root=d3.select(container).attr('class','lineup-board');
 root.append('h2').text('Tactical lineup');
 root.classed('pitch-readonly',!editable);
 root.append('p').attr('class','muted').text(editable?'Drag players or use arrow keys, then save positions. Select a player for their rating breakdown.':'Select a player for their rating breakdown.');
 const toolbar=root.append('div').attr('class','toolbar');
 const teams=toolbar.append('div').attr('class','segmented');
 const reset=toolbar.append('button').text('Reset positions').attr('hidden',editable?null:true);
 const saveButton=toolbar.append('button').text('Save positions').attr('hidden',editable?null:true);
 const body=root.append('div');
 let teamId=match.contenders[0]?.id;
 const drafts=structuredClone(match.pitchPositions||{});
 const buttons=teams.selectAll('button').data(match.contenders).join('button').text(d=>d.shortName||d.teamName).on('click',(_,d)=>{teamId=d.id;render();});
 function render() {
  buttons.classed('selected',d=>d.id===teamId).attr('aria-pressed',d=>d.id===teamId);
  body.selectAll('*').remove();
  const club=match.contenders.find(c=>c.id===teamId);
  if(!club)return;
  let saved=drafts[teamId]||{};
  const status=body.append('p').attr('class','caption').attr('role','status');
  function persist(){drafts[teamId]=saved;status.text('Unsaved positions. Select Save positions to publish this layout.');}
  reset.on('click',()=>{if(!editable)return;saved={};persist();render();});
  status.text(editable?'Select Save positions to publish this team’s layout.':'');
  saveButton.on('click',async()=>{
   if(!editable)return;
   const selectedTeam=teamId,positions=structuredClone(saved);
   saveButton.property('disabled',true);reset.property('disabled',true);status.text('Saving positions…');
   try{await onSave(selectedTeam,positions);status.text('Positions saved for all viewers.');}
   catch(e){status.text(e.message);}
   finally{saveButton.property('disabled',false);reset.property('disabled',false);}
  });
  const groups=splitLineup(ratedPlayers(match,teamId));
  const nodes=tieredLayout(groups.starters,saved);
  const svg=body.append('svg').attr('class','tactical-pitch').attr('viewBox',`0 0 ${PITCH.width} ${PITCH.height}`).attr('aria-label',`${club.teamName} tactical pitch; attack at the top`);
  const defs=svg.append('defs');
  svg.append('rect').attr('width',720).attr('height',800).attr('rx',16).attr('fill','#192e25');
  BANDS.forEach((band,i)=>{svg.append('rect').attr('x',16).attr('y',i*200+16).attr('width',688).attr('height',168).attr('fill',i%2?'#20392e':'#1c3229');svg.append('text').attr('x',28).attr('y',i*200+40).attr('class','band-label').text({GK:'GOAL',DEF:'DEFENSE',MID:'MIDFIELD',FWD:'ATTACK'}[band]);});
  const markings=svg.append('g').attr('fill','none').attr('stroke','#62816d').attr('stroke-opacity',.5).attr('stroke-width',2);
  markings.append('rect').attr('x',18).attr('y',18).attr('width',684).attr('height',764);
  markings.append('path').attr('d','M18 400H702 M205 18V140H515V18 M280 18V67H440V18 M205 782V660H515V782 M280 782V733H440V782');
  markings.append('circle').attr('cx',360).attr('cy',400).attr('r',75);
  markings.append('circle').attr('cx',360).attr('cy',400).attr('r',3).attr('fill','#62816d');
  const players=svg.append('g').selectAll('g').data(nodes,d=>d.id).join('g').attr('class','pitch-player').attr('transform',d=>`translate(${d.x},${d.y})`).attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${d.name}, rating ${d.rating??'unavailable'}. ${editable?'Drag or use arrow keys to reposition; ':''}Enter for details.`);
  players.each(function(p){playerNode(d3.select(this),p,club,defs);});
  const move=(node,d,x,y)=>{Object.assign(d,boundPosition(x,y));d3.select(node).attr('transform',`translate(${d.x},${d.y})`);};
  const save=d=>{saved[d.id]={x:d.x,y:d.y};persist();};
  if(editable)players.call(d3.drag().clickDistance(4).on('start',function(){d3.select(this).raise().classed('dragging',true);}).on('drag',function(event,d){move(this,d,event.x,event.y);}).on('end',function(_,d){d3.select(this).classed('dragging',false);save(d);}));
  players.on('click',(_,d)=>onPlayer(d.id,teamId)).on('keydown',function(event,d){
   if(event.key==='Enter'||event.key===' '){event.preventDefault();onPlayer(d.id,teamId);return;}
   const offset={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];
   if(editable&&offset){event.preventDefault();move(this,d,d.x+offset[0],d.y+offset[1]);save(d);}
  });
  if(!nodes.length)status.text('No starters with known positions. Attach an official box score below to populate the pitch.');
  function bench(title,rows) {
   const section=body.append('section').attr('class','pitch-bench');
   section.append('h3').text(`${title} · ${rows.length}`);
   if(!rows.length){section.append('p').attr('class','muted').text('No players listed.');return;}
   const cards=section.append('div').attr('class','bench-grid').selectAll('button').data(rows).join('button').attr('class','bench-player').attr('aria-label',p=>`${p.name}, rating ${p.rating??'unavailable'}`).on('click',(_,p)=>onPlayer(p.id,teamId));
   cards.each(function(p){const icon=d3.select(this).append('svg').attr('viewBox','0 0 140 130').attr('aria-hidden','true');playerNode(icon.append('g').attr('transform','translate(70,47)'),p,club,icon.append('defs'));d3.select(this).append('span').text(`#${p.numberText??'—'} · ${p.position}`);});
  }
  bench('Substitutes',groups.bench);
  const unknown=[...groups.unassigned,...groups.starters.filter(p=>!category(p))];
  if(unknown.length)bench('Lineup or position unavailable',unknown);
 }
 render();
}
