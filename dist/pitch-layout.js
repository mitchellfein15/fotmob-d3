export const PITCH = {width:720,height:800,padding:64};
export const BANDS = ['FWD','MID','DEF','GK'];
export function category(player) {
 const raw=String(player.official?.position||player.position||player.role||'').toUpperCase();
 if(player.official?.goalkeeper||/^(GK|GOALKEEPER)$/.test(raw))return 'GK';
 if(/^(D|DF|DEF|DEFENDER)$/.test(raw))return 'DEF';
 if(/^(M|MF|MID|MIDFIELDER)$/.test(raw))return 'MID';
 if(/^(F|FW|FWD|FORWARD)$/.test(raw))return 'FWD';
 return null;
}
export function splitLineup(players) {
 const groups={starters:[],bench:[],unassigned:[]};
 for(const p of players) {
  const starter=p.official?.starter??(p.lineupKnown===false?undefined:p.inStartingLineup);
  groups[starter===true?'starters':starter===false?'bench':'unassigned'].push(p);
 }
 return groups;
}
export function boundPosition(x,y) {
 return {x:Math.max(PITCH.padding,Math.min(PITCH.width-PITCH.padding,x)),y:Math.max(60,Math.min(PITCH.height-66,y))};
}
export function tieredLayout(players,saved={}) {
 const lines=new Map(BANDS.map(role=>[role,players.filter(p=>category(p)===role).sort((a,b)=>String(a.id).localeCompare(String(b.id)))]));
 return BANDS.flatMap((role,line)=>lines.get(role).map((p,i,all)=>{
  const previous=saved[p.id];
  const defaults={x:PITCH.padding+(PITCH.width-2*PITCH.padding)*(i+1)/(all.length+1),y:100+line*200};
  return {...p,band:role,...(Number.isFinite(previous?.x)&&Number.isFinite(previous?.y)?boundPosition(previous.x,previous.y):defaults)};
 }));
}
export function lastName(player) {
 if(player.lastName)return player.lastName;
 const name=String(player.name||'Player').trim();
 return name.includes(',')?name.split(',')[0].trim():name.split(/\s+/).at(-1);
}
export const ratingColor=rating=>!Number.isFinite(rating)?'#64746c':rating>=7?'#7ed957':rating>=6?'#f3a846':'#ec6464';
