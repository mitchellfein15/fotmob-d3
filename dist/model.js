// Assume metre-based coordinates normalized so each team attacks toward +x.
// Forward advancement (not total pass length) must be at least 10 metres.
function isProgressivePass(action) {
  const from = action.fromPosition, to = action.toPosition;
  return action.outcome === 'successful' &&
    Number.isFinite(from?.x) && Number.isFinite(from?.y) &&
    Number.isFinite(to?.x) && Number.isFinite(to?.y) && to.x - from.x >= 10;
}

export function playersFor(events, participants, contenderId) {
  const roster = new Map(participants.filter(p=>p.type==='player' && p.contenderId===contenderId).map(p=>[p.id,p]));
  const fields = [['fromParticipant','fromContender'],['participant','contender'],['successfulParticipant','successfulContender'],['unsuccessfulParticipant','unsuccessfulContender'],['toParticipant','toContender'],['toParticipant','contender']];
  for (const {action:a} of events) for (const [p,c] of fields) if (a[p] && a[c]===contenderId && !roster.has(a[p])) roster.set(a[p],{id:a[p],name:`Unmapped player · ${a[p].slice(0,6)}`,numberText:'—',unknown:true});
  return [...roster.values()].map(p=>{
    const s={...p,passes:0,completed:0,progressivePasses:0,passesIntercepted:0,duelsWon:0,duelsLost:0,shots:0,shotsOnTarget:0,setPiecesExecuted:0,blocks:0,cards:0,events:0};
    for(const {action:a} of events) {
      if (['participant','fromParticipant','toParticipant','successfulParticipant','unsuccessfulParticipant','blockedBy'].some(k=>a[k]===p.id)) s.events++;
      if(a.type==='pass' && (a.fromParticipant ?? a.participant)===p.id) {
        s.passes++;
        if(a.outcome==='successful') s.completed++;
        if(isProgressivePass(a)) s.progressivePasses++;
        if(a.outcome==='intercepted') s.passesIntercepted++;
      }
      if(a.type==='duel') {if(a.successfulParticipant===p.id)s.duelsWon++;if(a.unsuccessfulParticipant===p.id)s.duelsLost++;}
      if(a.type==='shot') {
        if(a.participant===p.id) {
          s.shots++;
          if(a.outcome==='goal' || a.outcome==='saved') s.shotsOnTarget++;
        }
        if(a.blockedBy===p.id)s.blocks++;
      }
      if(['corner','cross'].includes(a.type) && (a.fromParticipant ?? a.participant)===p.id) s.setPiecesExecuted++;
      if(['yellow_card','red_card'].includes(a.type) && a.participant===p.id)s.cards++;
    }
    return s;
  }).sort((a,b)=>Number(b.inStartingLineup??false)-Number(a.inStartingLineup??false) || b.events-a.events || a.name.localeCompare(b.name));
}
