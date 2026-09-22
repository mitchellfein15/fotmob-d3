import {DOMParser} from '@xmldom/xmldom';
import {stableId} from './identity.mjs';

const children=(node,name)=>Array.from(node.childNodes??[]).filter(n=>n.nodeType===1&&(!name||n.nodeName===name));
const text=(node,name,required=true)=>{
  const found=children(node,name);
  if(found.length>1||(required&&found.length!==1)) throw Error(`Invalid XML: expected one ${name}.`);
  if(found[0]&&children(found[0]).length) throw Error(`Invalid XML: nested ${name}.`);
  return found[0]?.textContent.trim()??'';
};
const playerRoles={player:['participant','team'],fromPlayer:['fromParticipant','fromTeam'],toPlayer:['toParticipant','toTeam'],successfulPlayer:['successfulParticipant','successfulTeam'],unsuccessfulPlayer:['unsuccessfulParticipant','unsuccessfulTeam']};
const teamRoles={team:'contender',fromTeam:'fromContender',toTeam:'toContender',successfulTeam:'successfulContender',unsuccessfulTeam:'unsuccessfulContender'};
const canonicalKey=r=>JSON.stringify([r.type,r.start,r.end,Object.entries(r.fields).sort(([a],[b])=>a.localeCompare(b))]);

export function importXml(xml,filename='match.xml') {
  if(typeof xml!=='string'||!xml.trim()) throw Error('Choose a Spiideo XML export.');
  if(Buffer.byteLength(xml)>20*1024*1024) throw Error('XML exports must be under 20 MB.');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('XML document types and entity declarations are not supported.');
  let doc;
  try {doc=new DOMParser({onError:()=>{throw Error('Malformed XML.');}}).parseFromString(xml,'application/xml');}
  catch {throw Error('The XML is malformed. Export the tags again from Spiideo.');}
  const root=doc.documentElement;
  if(root?.nodeName!=='file'||children(root).length!==1||children(root)[0].nodeName!=='ALL_INSTANCES') throw Error('Expected a Spiideo tag export containing file / ALL_INSTANCES.');
  const nodes=children(children(root)[0]);
  if(!nodes.length||nodes.length>100000||nodes.some(n=>n.nodeName!=='instance')) throw Error('The export has no instances or an unsupported structure.');
  const ids=new Set();let skippedTags=0;
  const rows=nodes.flatMap(node=>{
    const id=text(node,'ID'),code=text(node,'code');
    if(!id||ids.has(id)) throw Error('The export contains missing or repeated instance IDs.');
    ids.add(id);
    // Manual coach tags may have no event-type label or several coaching labels.
    const eventLabels=children(node,'label').filter(label=>!text(label,'group',false));
    if(eventLabels.length!==1||!text(eventLabels[0],'text',false)) {skippedTags++;return [];}
    const startText=text(node,'start'),endText=text(node,'end'),start=Number(startText),end=Number(endText);
    if(!startText||!endText||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start) throw Error(`Invalid clip range in instance ${id}.`);
    const fields={};let type;
    for(const label of children(node,'label')) {
      const value=text(label,'text'),group=text(label,'group',false);
      if(group) {if(Object.hasOwn(fields,group)||['__proto__','prototype','constructor'].includes(group)) throw Error(`Unsupported label group in instance ${id}.`);fields[group]=value;}
      else type=value;
    }
    if(!type) throw Error(`Missing event type in instance ${id}.`);
    return [{id,code,type,start,end,fields}];
  });
  // Spiideo emits separate player/team lanes for the same event. Only the
  // action lane (code == ungrouped event label) carries the complete event.
  const actionRows=rows.filter(r=>r.code===r.type);
  if(!actionRows.length) throw Error('No action rows found in this XML export.');
  const lanes=new Map();
  const laneKey=r=>JSON.stringify([r.type,r.start,r.end]);
  for(const r of actionRows){const key=laneKey(r);if(!lanes.has(key))lanes.set(key,[]);lanes.get(key).push(r);}
  const unique=new Map();let duplicates=0;
  for(const row of actionRows) {
    const key=canonicalKey(row);
    if(unique.has(key)){unique.get(key).sourceIds.push(row.id);duplicates++;}
    else unique.set(key,{...row,sourceIds:[row.id]});
  }
  // Unfamiliar coach tags do not prevent importing the action lanes.
  for(const row of rows.filter(r=>r.code!==r.type)) {
    if(!(lanes.get(laneKey(row))||[]).some(a=>Object.entries(row.fields).every(([k,v])=>a.fields[k]===v)&&Object.values(a.fields).includes(row.code)))
      skippedTags++;
  }
  const clean=[...unique.values()];
  // The UUID in an export filename is not assumed to be a Spiideo game ID.
  // A content identity makes reimports idempotent, including renamed files.
  const id=stableId([...unique.keys()].sort().join('\n'));
  const teamNames=[...new Set(clean.flatMap(r=>Object.keys(teamRoles).map(k=>r.fields[k]).filter(Boolean)))].sort();
  if(teamNames.length!==2) throw Error(`Expected two teams; found ${teamNames.length}.`);
  const contenders=teamNames.map(name=>({id:stableId(id+'|team|'+name),gameId:id,teamName:name,shortName:name,type:'unknown'}));
  const teamMap=new Map(contenders.map(c=>[c.teamName,c.id]));
  const people=new Map(),warnings=[];
  function person(label,team) {
    if(!label||!teamMap.has(team)) return null;
    const key=team+'|'+label;
    if(!people.has(key)) {const match=label.match(/^(\d+)\s+(.+)$/);people.set(key,{id:stableId(id+'|player|'+key),contenderId:teamMap.get(team),type:'player',name:match?match[2]:label,numberText:match?.[1]??'—',sourceLabel:label,lineupKnown:false});}
    return people.get(key).id;
  }
  for(const r of clean) for(const [label,[,team]] of Object.entries(playerRoles)) person(r.fields[label],r.fields[team]||r.fields.team);
  let unresolved=0;
  const events=clean.map(r=>{
    const action={type:r.type};
    for(const [key,value] of Object.entries(r.fields)) {
      if(teamRoles[key]) action[teamRoles[key]]=teamMap.get(value);
      else if(playerRoles[key]) {
        const [target,team]=playerRoles[key];
        const pid=person(value,r.fields[team]||r.fields.team);
        if(pid)action[target]=pid;else unresolved++;
      } else if(['blockedBy','assistedBy'].includes(key)) {
        const expectedTeam=key==='assistedBy'?r.fields.team:teamNames.find(t=>t!==r.fields.team);
        const known=people.get(expectedTeam+'|'+value);
        if(known)action[key]=known.id;else unresolved++;
      } else if(/Position$|^position$/.test(key)) {
        const point=value.match(/^Point\(x=([-+\d.eE]+),\s*y=([-+\d.eE]+)\)$/);
        if(point&&Number.isFinite(Number(point[1]))&&Number.isFinite(Number(point[2])))action[key]={x:Number(point[1]),y:Number(point[2])};
        else throw Error(`Invalid coordinate in instance ${r.id}.`);
      } else if(key==='phase') action.phase=value;
      else if(key==='homeTeamIsLeft') action[key]=value==='true';
      else action[key]=['outcome','shotType','duelType'].includes(key)?value.toLowerCase():value;
    }
    return {id:stableId(id+'|event|'+canonicalKey(r)),gameId:id,timestamp:r.start,clipStart:r.start,clipEnd:r.end,sourceIds:r.sourceIds,sourceLabels:r.fields,action};
  }).sort((a,b)=>a.timestamp-b.timestamp);
  const conflicts=[...new Set([...people.values()].filter(p=>[...people.values()].some(q=>q.id!==p.id&&q.sourceLabel===p.sourceLabel)).map(p=>p.sourceLabel))];
  if(conflicts.length)warnings.push(`Player labels appear under both teams: ${conflicts.join(', ')}. Team assignments are retained as exported and need review.`);
  warnings.push('Players are derived from event labels; full rosters, starting lineups, and home/away assignments are not provided.');
  warnings.push('Times are video clip ranges, not verified action times or match minutes.');
  warnings.push('Export completeness and totals have not been checked against Spiideo.');
  if(duplicates)warnings.push(`${duplicates} identical action rows collapsed; their source IDs and original XML are retained for review.`);
  if(skippedTags)warnings.push(`${skippedTags} unrecognized tags skipped; the original XML is retained for review.`);
  if(unresolved)warnings.push(`${unresolved} player references could not be assigned to a team and remain in source labels.`);
  const counts={instances:nodes.length,actionRows:actionRows.length,representations:nodes.length-actionRows.length-skippedTags,duplicateRows:duplicates,events:events.length,participants:people.size,skippedTags};
  const totals=contenders.map(c=>{
    const passes=events.filter(e=>e.action.type==='pass'&&e.action.fromContender===c.id);
    return {team:c.teamName,passes:passes.length,completed:passes.filter(e=>e.action.outcome==='successful').length,shots:events.filter(e=>e.action.type==='shot'&&e.action.contender===c.id).length,goals:events.filter(e=>e.action.type==='goal'&&e.action.contender===c.id).length};
  });
  return {gameId:id,importedAt:new Date().toISOString(),source:'spiideo-xml',sourceFilename:String(filename).split(/[\\/]/).pop().slice(0,255),coverage:'xml-export',processingVerified:false,contenders,participants:[...people.values()],events,counts,totals,warnings,raw:{xml}};
}
