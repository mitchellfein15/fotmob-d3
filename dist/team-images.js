import {api} from './import-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function crestContent(team) {
 const initials=String(team?.teamName||'Team').split(/\s+/).map(s=>s[0]).join('').slice(0,3);
 return team?.crestUrl?`<img src="${esc(team.crestUrl)}" alt="${esc(team.teamName)} crest">`:esc(initials);
}
export function mountTeamImages(container,match,onSave) {
 container.innerHTML='<h2>Team images</h2><p>Choose a PNG, JPEG, or WebP image (up to 2 MB) for each team in this match. Images appear on match cards, headers, and lineup badges.</p>';
 for(const team of match.contenders){
  const form=document.createElement('form');form.className='team-image-editor';
  form.innerHTML=`<span class="crest">${crestContent(team)}</span><label>${esc(team.teamName)}<input type="file" accept="image/png,image/jpeg,image/webp" required></label><button type="submit" disabled>Save image</button><button type="button" class="remove-image" ${team.crestUrl?'':'disabled'}>Remove image</button><p role="status" aria-live="polite"></p>`;
  container.append(form);
  const input=form.querySelector('input'),save=form.querySelector('[type=submit]'),remove=form.querySelector('.remove-image'),status=form.querySelector('[role=status]'),preview=form.querySelector('.crest');
  let selected=null,version=0;
  input.onchange=async()=>{
   const revision=++version,file=input.files[0];selected=null;save.disabled=true;status.textContent='';preview.innerHTML=crestContent(team);
   if(!file)return;
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){status.textContent='Choose a PNG, JPEG, or WebP image up to 2 MB.';return;}
   try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this image.'));reader.readAsDataURL(file);});
    const image=new Image();image.src=data;await image.decode();
    if(revision!==version)return;
    selected=data;preview.replaceChildren(image);image.alt=team.teamName+' crest preview';save.disabled=false;status.textContent='Preview ready. Save image to publish it.';
   }catch{if(revision===version)status.textContent='Could not open this image. Choose another file.';}
  };
  async function persist(crestUrl){
   input.disabled=save.disabled=remove.disabled=true;status.textContent='Saving…';
   try{const updated=await api('team-image',{gameId:match.gameId,teamId:team.id,crestUrl});await onSave(updated);}
   catch(e){status.textContent=e.message;input.disabled=false;save.disabled=!selected;remove.disabled=!team.crestUrl;}
  }
  form.onsubmit=e=>{e.preventDefault();if(selected)persist(selected);};
  remove.onclick=()=>persist(null);
 }
}
