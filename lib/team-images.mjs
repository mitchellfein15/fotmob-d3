export function validateTeamImage(value) {
 if(value===null)return null;
 if(typeof value!=='string'||value.length>2800000)throw Error('Choose an image up to 2 MB.');
 const parts=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!parts)throw Error('Choose a PNG, JPEG, or WebP image.');
 const bytes=Buffer.from(parts[2],'base64');
 if(bytes.length>2*1024*1024||bytes.toString('base64')!==parts[2])throw Error('Invalid image or image larger than 2 MB.');
 const valid=parts[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
  parts[1]==='jpeg'?bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
  bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)throw Error('The file contents do not match the image format.');
 return value;
}
