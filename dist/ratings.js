import {playersFor} from './model.js';

export const RATING_VERSION = 'Experimental v1';
const nameKey = s => String(s).toLowerCase().replace(/[^a-z]/g,'');
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
const value = n => Number.isFinite(n) && n >= 0 ? n : 0;

// Keep source records intact. These two confirmed wrong-team identities are
// excluded from the derived player view, without transferring their events.
export function excludedPlayer(match,p) {
 const confirmed = ['alexeby','aydinsumer'].includes(nameKey(p.name));
 const box = match.boxScore;
 return confirmed && /wooster/i.test(match.contenders.find(c=>c.id===p.contenderId)?.teamName || '') &&
  box?.players.some(o=>nameKey(o.name)===nameKey(p.name) && box.teamMapping[o.teamKey]!==p.contenderId);
}

export function teamStatistics(match,id) {
 const comparison=match.boxScore?.comparisons?.find(c=>match.boxScore.teamMapping[c.teamKey]===id);
 const total=type=>match.events.filter(e=>e.action.type===type&&e.action.contender===id).length;
 return {shots:Math.max(total('shot'),value(comparison?.official.shots)),goals:Math.max(total('goal'),value(comparison?.official.goals))};
}

export function ratedPlayers(match,teamId) {
 const box=match.boxScore;
 const rows=playersFor(match.events,match.participants,teamId).filter(p=>!excludedPlayer(match,p));
 const officialRows=box?.players.filter(p=>box.teamMapping[p.teamKey]===teamId)||[];
 for(const o of officialRows) {
  const link=box.links.find(l=>l.officialId===o.id);
  if(!rows.some(p=>p.id===link?.participantId)) rows.push({id:`official:${o.id}`,name:o.name,numberText:o.jersey,passes:0,completed:0,duelsWon:0,duelsLost:0,shots:0,blocks:0,cards:0,events:0,official:o});
 }
 return rows.map(p=>{
  const link=box?.links.find(l=>l.participantId===p.id);
  const o=p.official||box?.players.find(o=>o.id===link?.officialId);
  const count=type=>match.events.filter(e=>e.action.type===type&&e.action.participant===p.id).length;
  const goals=Math.max(count('goal'),value(o?.stats.goals));
  const shots=Math.max(p.shots,value(o?.stats.shots),goals);
  const assists=value(o?.stats.assists);
  const minutes=Number.isFinite(o?.derivedSeconds)?o.derivedSeconds/60:Number.isFinite(o?.goalkeeper?.seconds)?o.goalkeeper.seconds/60:Number.isFinite(o?.publishedMinutes)?o.publishedMinutes:null;
  const position=o?.goalkeeper?'GK':o?.position||'Unknown';
  const role=/GK|GOAL/i.test(position)?'GK':/DEF|^D$|^DF$/.test(position)?'DEF':/FWD|FOR|^F$|^FW$/.test(position)?'FWD':/MID|^M$|^MF$/.test(position)?'MID':'Unknown';
  const played=p.events>0||goals>0||shots>0||assists>0||minutes>0||o?.starter;
  const contributions=[];
  const add=(label,points)=>{if(points)contributions.push({label,points});};
  add('Goals',goals*(role==='DEF'?1.25:1.05));
  add('Assists',assists*.7);
  add('Shots excluding goals',Math.min(1,Math.max(0,shots-goals)*.10));
  add('Passing',clamp((p.completed-p.passes*.7)*(role==='MID'?.055:.04),-.65,.85));
  add('Duels',clamp(p.duelsWon*.09-p.duelsLost*.06,-.65,role==='DEF'?1.1:.8));
  add('Blocks',Math.min(role==='DEF'?.8:.5,p.blocks*.16));
  add('Discipline',-Math.min(2,count('yellow_card')*.3+count('red_card')*1.2));
  if(role==='GK'&&o?.goalkeeper) {
   add('Saves',Math.min(1.8,value(o.goalkeeper.saves)*.18));
   add('Goals conceded',-Math.min(2,value(o.goalkeeper.goalsAgainst)*.3));
   if(o.goalkeeper.goalsAgainst===0&&minutes>=60)add('Clean sheet',.6);
  }
  const rating=played?Math.round(clamp(6+contributions.reduce((s,c)=>s+c.points,0),1,10)*10)/10:null;
  const coverage=!played?'Did not play':minutes!==null&&minutes<15?'Brief appearance':o&&p.events>0?'XML + box score':o?'Box score only':'XML only';
  return {...p,official:o,goals,shots,assists,minutes,position,role,rating,contributions,coverage};
 }).sort((a,b)=>(b.rating??-1)-(a.rating??-1)||a.name.localeCompare(b.name));
}
