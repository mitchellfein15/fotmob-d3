// Use the same key when parsing tracker rows and looking up player names.
export const nameKey = s => String(s ?? '').toLowerCase().replace(/[^a-z]/g,'');

const columns = {
 'Sum Total Distance': 'totalDistance',
 'Average Work Rate': 'averageWorkRate',
 'Sum Hard Running': 'hardRunning',
 'Sum Hard Running Efforts': 'hardRunningEfforts',
 'Sum Sprinting': 'sprinting',
 'Sum Sprint Efforts': 'sprintEfforts',
 'Best Top Speed': 'topSpeed',
};

// Distance is expected in km; hard running and sprinting in metres.
// Work rate and top speed retain the tracker export's units.
export function parseTrackerData(rawTSV) {
 if(typeof rawTSV !== 'string')throw Error('Paste tracker data as tab-separated text.');
 const rows=rawTSV.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/)
  .map((text,index)=>({cells:text.split('\t').map(s=>s.trim()),line:index+1}))
  .filter(row=>row.cells.some(Boolean));
 const result=new Map();
 if(!rows.length)return result;
 const headers=rows.shift().cells;
 for(const label of ['Name',...Object.keys(columns)]) {
  if(headers.filter(h=>h===label).length!==1)throw Error(`Tracker header must contain exactly one "${label}" column.`);
 }
 for(const {cells,line} of rows) {
  if(cells.length!==headers.length)throw Error(`Tracker line ${line}: expected ${headers.length} tab-separated columns.`);
  const name=cells[headers.indexOf('Name')],key=nameKey(name);
  if(!key)throw Error(`Tracker line ${line}: missing player name.`);
  if(result.has(key))throw Error(`Tracker line ${line}: duplicate player name "${name}".`);
  const stats={name};
  for(const [label,field] of Object.entries(columns)) {
   const raw=cells[headers.indexOf(label)];
   if(!raw){stats[field]=null;continue;}
   // Accept ordinary decimals and thousands separators, but reject partial numbers.
   if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw))throw Error(`Tracker line ${line}: invalid ${label}.`);
   const number=Number(raw.replaceAll(',',''));
   if(!Number.isFinite(number)||(field.endsWith('Efforts')&&!Number.isSafeInteger(number)))throw Error(`Tracker line ${line}: invalid ${label}.`);
   stats[field]=number;
  }
  result.set(key,stats);
 }
 return result;
}
