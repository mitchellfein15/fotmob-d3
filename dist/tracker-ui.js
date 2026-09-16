import {api} from './import-ui.js';
import {parseTrackerData,nameKey} from './tracker.js';
import {ratedPlayers} from './ratings.js';

export function mountTracker(container,match,onLoad) {
 container.innerHTML='<h2>Tracker data</h2><p>Choose the team, then paste the tracker table including its header. Total distance must be in kilometres; hard running and sprinting in metres. Saving replaces this team’s tracker data. Clear the text and save to remove it.</p><label>Tracker team<select id="tracker-team"></select></label><label>Paste tab-separated tracker data<textarea id="tracker-tsv" rows="8" spellcheck="false"></textarea></label><button id="tracker-save">Save tracker data</button><p id="tracker-status" role="status" aria-live="polite"></p>';
 const select=container.querySelector('#tracker-team'),input=container.querySelector('#tracker-tsv'),button=container.querySelector('#tracker-save'),status=container.querySelector('#tracker-status');
 for(const team of match.contenders)select.add(new Option(team.teamName,team.id));
 function report(m,teamId) {
  const tracker=parseTrackerData(m.trackerData?.[teamId]??'');
  const linked=new Set(ratedPlayers(m,teamId).filter(p=>p.physicalStats).map(p=>nameKey(p.physicalStats.name)));
  const unmatched=[...tracker].filter(([key])=>!linked.has(key)).map(([,p])=>p.name);
  return tracker.size?`${linked.size} of ${tracker.size} tracker players matched.${unmatched.length?' Unmatched or ambiguous: '+unmatched.join(', ')+'. These rows add no rating points.':''}`:'No tracker data saved for this team.';
 }
 function change(){input.value=match.trackerData?.[select.value]??'';status.textContent=report(match,select.value);}
 select.onchange=change;change();
 button.onclick=async()=>{
  const teamId=select.value,tsv=input.value;
  button.disabled=true;select.disabled=true;input.disabled=true;status.textContent='Saving tracker data…';
  try {
   parseTrackerData(tsv);
   const updated=await api('tracker',{gameId:match.gameId,teamId,tsv});
   // Ignore the response if the user has switched matches or views meanwhile.
   if(!container.isConnected)return;
   onLoad(updated);
  }catch(e){if(container.isConnected)status.textContent=e.message;}
  finally{button.disabled=false;select.disabled=false;input.disabled=false;}
 };
}

export function trackerDetails(stats) {
 if(!stats)return '';
 const metrics=[['Total distance (km)',stats.totalDistance],['Average work rate',stats.averageWorkRate],['Hard running (m)',stats.hardRunning],['Hard running efforts',stats.hardRunningEfforts],['Sprinting (m)',stats.sprinting],['Sprint efforts',stats.sprintEfforts],['Top speed (tracker units)',stats.topSpeed]];
 return '<h3>Physical stats</h3><dl>'+metrics.map(([label,value])=>`<dt>${label}</dt><dd>${Number.isFinite(value)?value:'—'}</dd>`).join('')+'</dl>';
}
