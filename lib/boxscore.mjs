import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {stableId} from './identity.mjs';

export const normalizeName=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).sort().join(' ');
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
const displayName=s=>s.includes(',')?s.split(',').slice(1).join(' ').trim()+' '+s.split(',')[0].trim():s;
const clock=s=>{if(!/^\d{1,3}:\d{2}$/.test(s)||Number(s.split(':')[1])>=60)throw Error('Invalid box-score clock: '+s);return Number(s.split(':')[0])*60+Number(s.split(':')[1]);};
const number=s=>{if(!/^\d+$/.test(s))return null;return Number(s);};
export function boxScoreUrl(value) {
 const u=new URL(value);
 const pretty=u.pathname.match(/^\/sports\/mens-soccer\/stats\/\d{4}\/[^/]+\/boxscore\/(\d+)\/?$/);
 const legacy=u.pathname==='/boxscore.aspx'&&/^\d+$/.test(u.searchParams.get('id')||'')&&u.searchParams.get('path')==='msoc';
 if(u.protocol!=='https:'||u.port||u.username||u.password||!['athletics.case.edu','woosterathletics.com'].includes(u.hostname)||(!pretty&&!legacy))throw Error('Use a men’s soccer box-score link from athletics.case.edu or woosterathletics.com (a /sports/mens-soccer/stats/…/boxscore/… or boxscore.aspx link).');
 return `https://${u.hostname}/boxscore.aspx?id=${pretty?pretty[1]:u.searchParams.get('id')}&path=msoc`;
}
export async function fetchBoxScore(value,{fetcher=fetch}={}) {
 const url=boxScoreUrl(value);
 let response;
 try {response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{accept:'text/html'}});}
 catch {throw Error('Could not reach the athletics website. Use a saved HTML copy of the box score or check local network access.');}
 if(!response.ok){await response.body?.cancel();throw Error(`Athletics website returned HTTP ${response.status}. Use the direct box-score link or a saved HTML copy.`);}
 if(!response.headers.get('content-type')?.includes('text/html')){await response.body?.cancel();throw Error('The link did not return an HTML box score.');}
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error('Box-score page exceeds 8 MB.');chunks.push(chunk);}
 return {html:Buffer.concat(chunks).toString('utf8'),url};
}
export function parseBoxScore(html,sourceUrl) {
 if(typeof html!=='string'||Buffer.byteLength(html)>8*1024*1024)throw Error('Choose an HTML box score under 8 MB.');
 const url=boxScoreUrl(sourceUrl),$=load(html),teams=[],players=[],warnings=[];
 const tables=$('#individual-stats table').filter((_,t)=>/ - Player Stats$/i.test(tidy($(t).find('caption').text())));
 if(tables.length!==2)throw Error('Expected two SIDEARM soccer player tables. Save the complete box-score webpage as HTML, not a PDF or screenshot.');
 tables.each((teamIndex,table)=>{
  const t=$(table),key=tidy(t.find('caption').text()).replace(/ - Player Stats$/i,'');
  const team={key,label:key,side:teamIndex===0?'away':'home',totals:{}};teams.push(team);
  const headers=t.find('thead tr').last().children().map((_,c)=>tidy($(c).text()).toUpperCase()).get();
  if(headers.join('|')!=='POS|#|PLAYER|SH|SOG|G|A|MIN')throw Error('Unrecognized soccer player columns. Import stopped.');
  let starter=null;
  t.find('tbody tr').each((_,tr)=>{
   const cells=$(tr).children();
   if(cells.length===1){const title=tidy(cells.text()).toLowerCase();starter=title==='starters'?true:title==='substitutes'?false:null;return;}
   if(cells.length!==8||starter===null)throw Error('Unrecognized roster row or lineup group.');
   const nameCell=cells.eq(2).clone();nameCell.find('.mobile-jersey-number').remove();
   const sourceName=tidy(nameCell.text()),name=displayName(sourceName),jersey=tidy(cells.eq(1).text());
   if(!sourceName||!/^\d+$/.test(jersey))throw Error('A box-score player is missing a name or jersey number.');
   const id=stableId(key+'|'+normalizeName(name));
   if(players.some(p=>p.id===id))throw Error('Ambiguous duplicate player name within a team.');
   const stat=i=>number(tidy(cells.eq(i).text()));
   players.push({id,teamKey:key,name,sourceName,jersey,position:tidy(cells.eq(0).text()).toUpperCase()||null,starter,publishedMinutes:stat(7),stats:{shots:stat(3),shotsOnGoal:stat(4),goals:stat(5),assists:stat(6)},goalkeeper:null,stints:[],derivedSeconds:null});
  });
  const foot=t.find('tfoot tr').last();
  for(const [field,label] of Object.entries({shots:'SH',shotsOnGoal:'SOG',goals:'G',assists:'A'})) {
   const total=number(tidy(foot.find(`[data-label="${label}"]`).text()));
   if(total===null)throw Error('Missing official team totals.');team.totals[field]=total;
   const vals=players.filter(p=>p.teamKey===key).map(p=>p.stats[field]);
   if(vals.some(v=>v===null)||vals.reduce((a,b)=>a+b,0)!==total)warnings.push(`${key}: published ${field} total does not reconcile with player rows.`);
  }
  const goalie=t.nextAll('table').first();
  goalie.find('tbody tr').each((_,tr)=>{
   const c=$(tr).children();if(c.length!==6)return;
   const p=players.find(p=>p.teamKey===key&&normalizeName(p.name)===normalizeName(tidy(c.eq(2).text())));
   if(!p)throw Error('A goalkeeper could not be matched to the roster.');
   p.goalkeeper={seconds:clock(tidy(c.eq(3).text())),goalsAgainst:number(tidy(c.eq(4).text())),saves:number(tidy(c.eq(5).text()))};
  });
 });
 const dateText=tidy($('dt').filter((_,n)=>/^Date:$/i.test(tidy($(n).text()))).next('dd').text());
 const dateMatch=dateText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 if(!dateMatch)throw Error('The box score has no recognizable match date.');
 const date=`${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;
 if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Invalid box-score date.');
 const periods=[];
 $('#play-by-play section[id^="period-"]').each((_,section)=>{
  const period=Number($(section).attr('id').replace('period-','')),plays=[];
  $(section).find('table tbody tr').each((_,tr)=>{
   const cells=$(tr).children('td');if(!cells.length)return;
   const time=tidy(cells.eq(0).text());if(!time)return;
   const mobile=cells.filter('[aria-hidden="true"]').last();
   const description=tidy(mobile.length?mobile.text():cells.slice(1).filter((_,c)=>$(c).attr('aria-hidden')!=='true').text());
   plays.push({time,seconds:time==='--'?null:clock(time),description});
  });
  periods.push({period,plays});
 });
 periods.sort((a,b)=>a.period-b.period);
 const result={source:'sidearm-boxscore',sourceUrl:url,sourceHash:createHash('sha256').update(html).digest('hex'),fetchedAt:new Date().toISOString(),date,teams,players,periods,warnings,timingComplete:false};
 reconstructStints(result);
 return result;
}

export function reconstructStints(box) {
 const issues=[],allSubs=[],players=box.players;
 for(const p of players){p.stints=[];p.derivedSeconds=null;}
 const resolve=(team,name)=>players.find(p=>p.teamKey===team&&normalizeName(p.name)===normalizeName(name));
 let previousEnd=0;
 if(!box.periods.length)issues.push('No play-by-play periods were found.');
 for(const [index,period] of box.periods.entries()) {
  if(period.plays.some(p=>p.seconds===null))issues.push(`Period ${period.period}: a play has no published clock; reconstructed playing time requires manual review.`);
  if(period.plays.some(p=>/red card|second yellow|eject|dismiss/i.test(p.description)))issues.push(`Period ${period.period}: dismissal timing requires manual review.`);
  const endPlay=period.plays.find(p=>/^End of period/i.test(p.description));
  const start=index===0?0:period.plays.find(p=>/^Start of .*period/i.test(p.description))?.seconds;
  const end=endPlay?.seconds;
  if(period.period!==index+1||start!==previousEnd||!Number.isFinite(end)||end<=start){issues.push(`Period ${period.period}: missing or inconsistent boundaries.`);continue;}
  previousEnd=end;period.start=start;period.end=end;
  if(period.plays.some((p,i)=>p.seconds<start||p.seconds>end||(i>0&&p.seconds<period.plays[i-1].seconds)))issues.push(`Period ${period.period}: invalid clock order.`);
  for(const team of box.teams) {
   let lineup;
   if(index===0)lineup=players.filter(p=>p.teamKey===team.key&&p.starter);
   else {
    const announcement=period.plays.find(p=>p.seconds===start&&p.description.startsWith(`FOR ${team.key}:`));
    if(announcement) {
     const names=announcement.description.slice(announcement.description.indexOf(':')+1).replace(/^\s*,?\s*#/,'').replace(/\.$/,'').split(/,\s*#/).map(s=>s.replace(/^\S+\s+/,''));
     lineup=names.map(n=>resolve(team.key,n));
    }
   }
   if(!lineup||lineup.length!==11||lineup.some(p=>!p)||new Set(lineup.map(p=>p.id)).size!==11){issues.push(`${team.key}, period ${period.period}: an explicit 11-player starting lineup is missing or ambiguous.`);continue;}
   const active=new Map(lineup.map(p=>[p.id,start]));
   const seen=new Set();
   for(const play of period.plays) {
    if(!play.description.startsWith(`${team.key} substitution:`))continue;
    const parts=play.description.slice(play.description.indexOf(':')+1).trim().replace(/\.$/,'').split(' for ');
    const incoming=resolve(team.key,parts[0]),outgoing=resolve(team.key,parts[1]);
    const key=JSON.stringify([play.seconds,parts]);
    if(seen.has(key)){issues.push(`${team.key}: repeated substitution at ${play.time}.`);continue;}seen.add(key);
    const sub={teamKey:team.key,period:period.period,seconds:play.seconds,time:play.time,incomingId:incoming?.id??null,outgoingId:outgoing?.id??null,description:play.description,coveredByPeriodLineup:index>0&&play.seconds===start};allSubs.push(sub);
    // The second-half lineup already describes the result of halftime changes.
    if(sub.coveredByPeriodLineup){if(!incoming||!outgoing||!active.has(incoming.id)||active.has(outgoing.id))issues.push(`${team.key}: halftime substitution conflicts with the period lineup.`);continue;}
    if(!incoming||!outgoing||incoming.id===outgoing.id||!active.has(outgoing.id)||active.has(incoming.id)){issues.push(`${team.key}: inconsistent substitution at ${play.time}.`);continue;}
    outgoing.stints.push({period:period.period,start:active.get(outgoing.id),end:play.seconds});active.delete(outgoing.id);active.set(incoming.id,play.seconds);
   }
   for(const [id,since] of active)players.find(p=>p.id===id).stints.push({period:period.period,start:since,end});
  }
 }
 if(box.periods.length<2)issues.push('Fewer than two periods are present.');
 box.durationSeconds=previousEnd||null;box.substitutions=allSubs;box.timingComplete=issues.length===0;
 for(const p of players) {
  if(box.timingComplete) {
   p.derivedSeconds=p.stints.reduce((sum,s)=>sum+s.end-s.start,0);
   if(p.goalkeeper&&p.goalkeeper.seconds!==p.derivedSeconds)issues.push(`${p.name}: goalkeeper clock disagrees with reconstructed time.`);
   if(p.publishedMinutes!==null&&Math.abs(p.publishedMinutes*60-p.derivedSeconds)>60)box.warnings.push(`${p.name}: published minutes differ from reconstructed time by more than one minute.`);
  }
 }
 if(issues.length){box.timingComplete=false;for(const p of players){p.derivedSeconds=null;p.stints=[];}box.warnings.push(...issues);}
 box.warnings.push('Published integer minutes are kept separately from reconstructed clock time. Positions are roster labels, not verified roles for each stint.');
}

export function previewBoxScore(match,box,teamMapping) {
 const mapping=teamMapping||Object.fromEntries(box.teams.map(t=>{
  const scored=match.contenders.map(c=>({id:c.id,score:box.players.filter(p=>p.teamKey===t.key&&match.participants.some(q=>q.contenderId===c.id&&normalizeName(q.name)===normalizeName(p.name))).length})).sort((a,b)=>b.score-a.score);
  return [t.key,scored[0]?.score>0&&scored[0].score>scored[1]?.score?scored[0].id:''];
 }));
 if(new Set(Object.values(mapping)).size!==2||box.teams.some(t=>!match.contenders.some(c=>c.id===mapping[t.key])))throw Error('Both official teams must map to different teams in the selected XML match.');
 const links=box.players.map(p=>{
  const candidates=match.participants.filter(q=>q.contenderId===mapping[p.teamKey]&&normalizeName(q.name)===normalizeName(p.name));
  const q=candidates.length===1?candidates[0]:null;
  return {officialId:p.id,participantId:q?.id??null,name:p.name,teamKey:p.teamKey,officialJersey:p.jersey,xmlJersey:q?.numberText??null,status:candidates.length>1?'ambiguous':q?String(q.numberText)!==p.jersey?'jersey-difference':'matched':'official-only'};
 });
 const unmatchedXml=match.participants.filter(p=>!links.some(l=>l.participantId===p.id)).map(p=>({id:p.id,name:p.name,team:match.contenders.find(c=>c.id===p.contenderId)?.teamName,number:p.numberText}));
 const comparisons=box.teams.map(t=>{
  const events=match.events.filter(e=>e.action.contender===mapping[t.key]);
  return {teamKey:t.key,xmlTeam:match.contenders.find(c=>c.id===mapping[t.key]).teamName,official:t.totals,xml:{shots:events.filter(e=>e.action.type==='shot').length,goals:events.filter(e=>e.action.type==='goal').length}};
 });
 return {boxScore:box,teamMapping:mapping,links,unmatchedXml,comparisons,warnings:['The XML has no verified match date. Confirm the date, opponents, and result before attaching this box score.','Official statistics remain separate from Spiideo events; matching a roster does not reassign conflicting XML events.']};
}
