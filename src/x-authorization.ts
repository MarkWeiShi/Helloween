import {api} from './api';

// Open synchronously in the publish gesture; only this window can complete the flow.
export function openXAuthorization() {
 const popup=window.open('about:blank','_blank','popup,width=520,height=720');
 if(!popup)throw Error('Allow the X authorization window, then try again. Nothing was published.');
 let cancel:()=>void=()=>popup.close();
 return {
  close(){cancel();},
  async authorize(stillActive:()=>boolean) {
   return new Promise<void>((resolve,reject)=>{
    let done=false,checking=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearInterval(timer);window.removeEventListener('message',onMessage);popup.close();error?reject(error):resolve();};
    cancel=()=>finish(Error('X authorization was not completed. Nothing was published.'));
    const onMessage=async(event:MessageEvent)=>{
     if(event.origin!==location.origin || event.source!==popup || event.data?.type!=='boo:x-authorized' || checking)return;
     checking=true;
     if(event.data.success!==true){cancel();return;}
     try{const status=await api<{connected:boolean}>('/social/x/status');if(!stillActive() || !status.connected)throw Error('X publishing authorization is unavailable. Nothing was published.');finish();}
     catch(error){finish(error as Error);}
    };
    const started=Date.now();
    const timer=setInterval(()=>{if(!stillActive() || Date.now()-started>120000 || (popup.closed && !checking))cancel();},400);
    window.addEventListener('message',onMessage);
    void api<{url:string}>('/auth/start',{provider:'x',popup:true}).then(result=>{if(!done)popup.location.href=result.url;}).catch(error=>finish(error));
   });
  },
 };
}
