import {api} from './import-ui.js';
import {parseTrackerData,nameKey} from './tracker.js';
import {ratedPlayers} from './ratings.js';

export function mountTracker(container,match,onLoad,state={drafts:{}}) {
 state.drafts??={};
 if(!match.contenders.some(t=>t.id===state.teamId))state.teamId=match.contenders[0]?.id;
 container.innerHTML='<h2>Tracker data</h2><p>Choose the team, then paste the tracker table including its header. Total distance must be in kilometres; hard running and sprinting in metres. Drafts are kept separately for each team while this page is open. Saving replaces only the selected team’s data. Clear its text and save to remove it.</p><div class="admin-summary"><span>Paste TSV · km / metres as published</span></div><label>Tracker team<select id="tracker-team"></select></label><label>Paste tab-separated tracker data<textarea id="tracker-tsv" rows="8" spellcheck="false" aria-describedby="tracker-status"></textarea></label><button id="tracker-save" type="button">Save tracker data</button><p id="tracker-status" role="status" aria-live="polite"></p>';
 const select=container.querySelector('#tracker-team'),input=container.querySelector('#tracker-tsv'),button=container.querySelector('#tracker-save'),status=container.querySelector('#tracker-status');
 const alive=()=>container.isConnected&&container.querySelector('#tracker-save')===button;
 for(const team of match.contenders)select.add(new Option(team.teamName,team.id));
 select.value=state.teamId;
 const teamName=()=>match.contenders.find(t=>t.id===state.teamId)?.teamName||'team';
 function report(m,teamId) {
  const tracker=parseTrackerData(m.trackerData?.[teamId]??'');
  const linked=new Set(ratedPlayers(m,teamId).filter(p=>p.physicalStats).map(p=>nameKey(p.physicalStats.name)));
  const unmatched=[...tracker].filter(([key])=>!linked.has(key)).map(([,p])=>p.name);
  return tracker.size?`${linked.size} of ${tracker.size} tracker players matched.${unmatched.length?' Unmatched or ambiguous: '+unmatched.join(', ')+'. These rows add no rating points.':''}`:'No tracker rows.';
 }
 function update() {
  const changed=input.value!==(match.trackerData?.[state.teamId]??'');
  button.textContent=`${input.value.trim()?'Save tracker data for':'Remove tracker data for'} ${teamName()}`;
  try {
   const summary=report({...match,trackerData:{...match.trackerData,[state.teamId]:input.value}},state.teamId);
   button.disabled=!changed;
   status.textContent=`${state.message||(changed?`Unsaved draft for ${teamName()}.`:`Saved data for ${teamName()}.`)} ${summary}`;
  }catch(e){button.disabled=true;status.textContent=`${teamName()}: ${e.message}`;}
 }
 function change(){input.value=state.drafts[state.teamId]??match.trackerData?.[state.teamId]??'';update();}
 select.onchange=()=>{state.drafts[state.teamId]=input.value;state.teamId=select.value;state.message='';change();};
 input.oninput=()=>{state.drafts[state.teamId]=input.value;state.message='';update();};
 change();
 button.onclick=async()=>{
  if(button.disabled)return;
  const teamId=state.teamId,tsv=input.value,name=teamName();
  state.drafts[teamId]=tsv;
  button.disabled=true;select.disabled=true;input.disabled=true;status.textContent=`Saving tracker data for ${name}…`;
  try {
   parseTrackerData(tsv);
   const updated=await api('tracker',{gameId:match.gameId,teamId,tsv});
   // Ignore the response if the user has switched matches or views meanwhile.
   if(!alive())return;
   delete state.drafts[teamId];
   state.message=tsv.trim()?`Tracker data saved for ${name}.`:`Tracker data removed for ${name}.`;
   onLoad(updated);
  }catch(e){if(alive())status.textContent=`Could not save tracker data for ${name}: ${e.message}`;}
  finally{if(alive()){button.disabled=false;select.disabled=false;input.disabled=false;}}
 };
}

export function trackerDetails(stats) {
 if(!stats)return '';
 const metrics=[['Total distance (km)',stats.totalDistance],['Average work rate',stats.averageWorkRate],['Hard running (m)',stats.hardRunning],['Hard running efforts',stats.hardRunningEfforts],['Sprinting (m)',stats.sprinting],['Sprint efforts',stats.sprintEfforts],['Top speed (tracker units)',stats.topSpeed]];
 return '<h3>Physical stats</h3><dl>'+metrics.map(([label,value])=>`<dt>${label}</dt><dd>${Number.isFinite(value)?value:'—'}</dd>`).join('')+'</dl>';
}
