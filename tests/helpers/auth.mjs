export const TEST_PASSWORD='test-only-password-123';
export async function login(base){
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Matchroom-Request':'1'},body:JSON.stringify({password:TEST_PASSWORD})});
 if(response.status!==200)throw Error('Test sign-in failed: '+response.status);
 return response.headers.get('set-cookie').split(';')[0];
}
