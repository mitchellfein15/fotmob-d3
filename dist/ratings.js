import {playersFor} from './model.js';
import {nameKey,parseTrackerData} from './tracker.js';
export {nameKey,parseTrackerData} from './tracker.js';

export const RATING_VERSION = 'Experimental v1';

// Points per event. Penalty weights are positive here and subtracted below.
export const RATING_WEIGHTS = {
 goal: 1.05,
 defenderGoal: 1.25,
 assist: 0.70,
 shotExcludingGoal: 0.10,
 shotOnTarget: 0.12,
 passing: 0.04,
 midfielderPassing: 0.055,
 progressivePass: 0.04,
 midfielderOrDefenderProgressivePass: 0.06,
 interceptedPass: 0.04,
 duelWon: 0.20,
 duelLost: 0.06,
 block: 0.16,
 setPiece: 0.03,
 yellowCard: 0.30,
 redCard: 1.20,
 save: 0.18,
 goalConceded: 0.30,
 cleanSheet: 0.60,
 workRate: 0.01, // Per tracker work-rate unit above the baseline.
 distanceCovered: 0.02, // Per kilometre.
 hardRunning: 0.0002, // Per metre; combined with sprinting below.
 sprinting: 0.0005, // Per metre.
};

// Maximum total points each category can add or deduct per match.
// Penalty caps are positive magnitudes; passing and duels have both bounds.
export const RATING_CAPS = {
 shotsExcludingGoals: 1.00,
 shotsOnTarget: 0.80,
 passingPenalty: 0.65,
 passingBonus: 0.85,
 progressivePasses: 0.75,
 interceptedPasses: 1.50,
 setPieces: 0.40,
 duelsPenalty: 0.65,
 duelsBonus: 0.80,
 defenderDuelsBonus: 2.0,
 blocks: 0.70,
 defenderBlocks: 0.80,
 discipline: 2.00,
 saves: 1.80,
 goalsConceded: 2.00,
 workRate: 0.30,
 distanceCovered: 0.30,
 highIntensityRunning: 0.30,
};

export const RATING_RULES = {
 baseRating: 6.0,
 minimumRating: 1.0,
 maximumRating: 10.0,
 expectedPassCompletion: 0.60, // 70%; passing points measure performance above/below this.
 cleanSheetMinimumMinutes: 60,
 workRateBaseline: 50.0,
};

const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
const value = n => Number.isFinite(n) && n >= 0 ? n : 0;

// Attached match rosters determine eligibility. Links are created by the
// importer using unambiguous normalized names within the mapped team.
// Preserve excluded XML identities and events in the source for review.
export function excludedPlayer(match,p) {
 const box = match.boxScore;
 if(!box)return false;
 return !box.links.some(l=>l.participantId===p.id &&
  box.players.some(o=>o.id===l.officialId && box.teamMapping[o.teamKey]===p.contenderId));
}

export function teamStatistics(match,id) {
 const comparison=match.boxScore?.comparisons?.find(c=>match.boxScore.teamMapping[c.teamKey]===id);
 const total=type=>match.events.filter(e=>e.action.type===type&&e.action.contender===id).length;
 return {shots:Math.max(total('shot'),value(comparison?.official.shots)),goals:Math.max(total('goal'),value(comparison?.official.goals))};
}

export function ratedPlayers(match,teamId) {
 const box=match.boxScore;
 const tracker=parseTrackerData(match.trackerData?.[teamId] ?? '');
 const rows=playersFor(match.events,match.participants,teamId).filter(p=>!excludedPlayer(match,{...p,contenderId:teamId}));
 const officialRows=box?.players.filter(p=>box.teamMapping[p.teamKey]===teamId)||[];
 for(const o of officialRows) {
  const link=box.links.find(l=>l.officialId===o.id);
  if(!rows.some(p=>p.id===link?.participantId)) rows.push({id:`official:${o.id}`,name:o.name,numberText:o.jersey,passes:0,completed:0,progressivePasses:0,passesIntercepted:0,duelsWon:0,duelsLost:0,shots:0,shotsOnTarget:0,setPiecesExecuted:0,blocks:0,cards:0,events:0,official:o});
 }
 // Do not assign one physical record to multiple same-name player identities.
 const trackerKey=p=>{
  const official=p.official||box?.players.find(o=>box.links.some(l=>l.officialId===o.id&&l.participantId===p.id));
  return tracker.has(nameKey(p.name))?nameKey(p.name):nameKey(official?.name);
 };
 const keyCounts=new Map();
 for(const p of rows){const key=trackerKey(p);keyCounts.set(key,(keyCounts.get(key)||0)+1);}
 return rows.map(p=>{
  const link=box?.links.find(l=>l.participantId===p.id);
  const o=p.official||box?.players.find(o=>o.id===link?.officialId);
  const key=trackerKey(p);
  const physicalStats=keyCounts.get(key)===1?tracker.get(key)??null:null;
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
  add('Goals',goals*(role==='DEF'?RATING_WEIGHTS.defenderGoal:RATING_WEIGHTS.goal));
  add('Assists',assists*RATING_WEIGHTS.assist);
  add('Shots excluding goals',Math.min(RATING_CAPS.shotsExcludingGoals,Math.max(0,shots-goals)*RATING_WEIGHTS.shotExcludingGoal));
  add('Shots on target',Math.min(RATING_CAPS.shotsOnTarget,p.shotsOnTarget*RATING_WEIGHTS.shotOnTarget));
  add('Passing',clamp((p.completed-p.passes*RATING_RULES.expectedPassCompletion)*(role==='MID'?RATING_WEIGHTS.midfielderPassing:RATING_WEIGHTS.passing),-RATING_CAPS.passingPenalty,RATING_CAPS.passingBonus));
  add('Progressive passes',Math.min(RATING_CAPS.progressivePasses,p.progressivePasses*(['MID','DEF'].includes(role)?RATING_WEIGHTS.midfielderOrDefenderProgressivePass:RATING_WEIGHTS.progressivePass)));
  add('Passes intercepted',-Math.min(RATING_CAPS.interceptedPasses,p.passesIntercepted*RATING_WEIGHTS.interceptedPass));
  add('Set pieces executed',Math.min(RATING_CAPS.setPieces,p.setPiecesExecuted*RATING_WEIGHTS.setPiece));
  add('Duels',clamp(p.duelsWon*RATING_WEIGHTS.duelWon-p.duelsLost*RATING_WEIGHTS.duelLost,-RATING_CAPS.duelsPenalty,role==='DEF'?RATING_CAPS.defenderDuelsBonus:RATING_CAPS.duelsBonus));
  add('Blocks',Math.min(role==='DEF'?RATING_CAPS.defenderBlocks:RATING_CAPS.blocks,p.blocks*RATING_WEIGHTS.block));
  add('Discipline',-Math.min(RATING_CAPS.discipline,count('yellow_card')*RATING_WEIGHTS.yellowCard+count('red_card')*RATING_WEIGHTS.redCard));
  if(role==='GK'&&o?.goalkeeper) {
   add('Saves',Math.min(RATING_CAPS.saves,value(o.goalkeeper.saves)*RATING_WEIGHTS.save));
   add('Goals conceded',-Math.min(RATING_CAPS.goalsConceded,value(o.goalkeeper.goalsAgainst)*RATING_WEIGHTS.goalConceded));
   if(o.goalkeeper.goalsAgainst===0&&minutes>=RATING_RULES.cleanSheetMinimumMinutes)add('Clean sheet',RATING_WEIGHTS.cleanSheet);
  }
  if(physicalStats) {
   add('Work rate bonus',Math.min(RATING_CAPS.workRate,Math.max(0,value(physicalStats.averageWorkRate)-RATING_RULES.workRateBaseline)*RATING_WEIGHTS.workRate));
   add('Distance covered',Math.min(RATING_CAPS.distanceCovered,value(physicalStats.totalDistance)*RATING_WEIGHTS.distanceCovered));
   add('High-intensity running',Math.min(RATING_CAPS.highIntensityRunning,value(physicalStats.hardRunning)*RATING_WEIGHTS.hardRunning+value(physicalStats.sprinting)*RATING_WEIGHTS.sprinting));
  }
  const rating=played?Math.round(clamp(RATING_RULES.baseRating+contributions.reduce((s,c)=>s+c.points,0),RATING_RULES.minimumRating,RATING_RULES.maximumRating)*10)/10:null;
  const baseCoverage=!played?'Did not play':minutes!==null&&minutes<15?'Brief appearance':o&&p.events>0?'XML + box score':o?'Box score only':'XML only';
  const coverage=played&&physicalStats?baseCoverage.replace(' only','')+' + tracker':baseCoverage;
  return {...p,official:o,physicalStats,goals,shots,assists,minutes,position,role,rating,contributions,coverage};
 }).sort((a,b)=>(b.rating??-1)-(a.rating??-1)||a.name.localeCompare(b.name));
}
