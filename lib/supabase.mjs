import {createClient} from '@supabase/supabase-js';

let client;
export function getSupabase() {
 if(client)return client;
 const url=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.');
 client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 return client;
}

export function storageError(error) {
 return Object.assign(new Error('Supabase storage operation failed.',{cause:error}),{code:'STORAGE_ERROR'});
}
