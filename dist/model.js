export const GAME = 'f840de60-f2a1-47cb-91fd-0147d1a48e46';
export function mergeRecords(current, incoming) {
  const map = new Map(current.map(x => [x.id,x]));
  for (const item of incoming) {
    const old = map.get(item.id);
    if (!old || (item.timeModified ?? 0) >= (old.timeModified ?? 0)) map.set(item.id,item);
  }
  return [...map.values()];
}
export function validate(payload, kind, contenders) {
  if (!payload || !Array.isArray(payload.content) || !payload.content.length) throw Error('Choose a JSON response with a non-empty content array.');
  const ids = new Set(contenders.map(c=>c.id));
  for (const row of payload.content) {
    if (typeof row.id !== 'string') throw Error('Every record must have an ID.');
    if (kind === 'events' && (row.gameId !== (contenders[0]?.gameId || GAME) || typeof row.action?.type !== 'string' || !Number.isFinite(row.timestamp))) throw Error('Events must belong to this match and include an action and timestamp.');
    if (kind === 'participants' && (!ids.has(row.contenderId) || typeof row.name !== 'string' || !['player','coach'].includes(row.type))) throw Error('Participants must belong to one of this match’s contenders and include a name and type.');
  }
  return payload.content;
}
export function playersFor(events, participants, contenderId) {
  const roster = new Map(participants.filter(p=>p.type==='player' && p.contenderId===contenderId).map(p=>[p.id,p]));
  const fields = [['fromParticipant','fromContender'],['participant','contender'],['successfulParticipant','successfulContender'],['unsuccessfulParticipant','unsuccessfulContender'],['toParticipant','contender']];
  for (const {action:a} of events) for (const [p,c] of fields) if (a[p] && a[c]===contenderId && !roster.has(a[p])) roster.set(a[p],{id:a[p],name:`Unmapped player · ${a[p].slice(0,6)}`,numberText:'—',unknown:true});
  return [...roster.values()].map(p=>{
    const s={...p,passes:0,completed:0,duelsWon:0,duelsLost:0,shots:0,blocks:0,cards:0,events:0};
    for(const {action:a} of events) {
      if (['participant','fromParticipant','toParticipant','successfulParticipant','unsuccessfulParticipant','blockedBy'].some(k=>a[k]===p.id)) s.events++;
      if(a.type==='pass' && a.fromParticipant===p.id) {s.passes++; if(a.outcome==='successful') s.completed++;}
      if(a.type==='duel') {if(a.successfulParticipant===p.id)s.duelsWon++;if(a.unsuccessfulParticipant===p.id)s.duelsLost++;}
      if(a.type==='shot') {if(a.participant===p.id)s.shots++;if(a.blockedBy===p.id)s.blocks++;}
      if(['yellow_card','red_card'].includes(a.type) && a.participant===p.id)s.cards++;
    }
    return s;
  }).sort((a,b)=>Number(b.inStartingLineup??false)-Number(a.inStartingLineup??false) || b.events-a.events || a.name.localeCompare(b.name));
}
