import {api,escape as e} from './api';
import {t} from './i18n';
export async function showAccount(modal:(markup:string)=>void,onDone:()=>void) {
 const config=await api<{enabled:boolean;providers:string[]}>('/auth/config');
 modal(`<div class="account-panel"><span class="account-ghost" aria-hidden="true">👻</span><h2>${e(t('Keep every little Boo'))}</h2><p>${e(t('Sign in to save your ghost links and listen again on any device.'))}</p>${config.enabled?`<div class="account-providers">${config.providers.map(p=>`<button class="button secondary full" data-login-provider="${e(p)}">${e(t('Continue with'))} ${e(p.charAt(0).toUpperCase()+p.slice(1))}</button>`).join('')}</div><form data-email-login><label>${e(t('Email'))}<input name="email" type="email" autocomplete="email" required maxlength="254"></label><button class="button primary full" type="submit">${e(t('Send sign-in code'))}</button></form><form data-code-login hidden><label>${e(t('Email code'))}<input name="code" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6,8}"></label><button class="button primary full" type="submit">${e(t('Verify and continue'))}</button></form>`:`<p role="status">${e(t('Sign-in is temporarily unavailable. Please try again later.'))}</p>`}<p data-auth-status role="status" aria-live="polite"></p></div>`);
 const root=document.querySelector<HTMLElement>('.account-panel')!;let state='';
 const status=root.querySelector<HTMLElement>('[data-auth-status]')!;
 async function act(button:HTMLButtonElement,run:()=>Promise<void>) {button.disabled=true;status.textContent='';try{await run();}catch(error){status.textContent=(error as Error).message;}finally{button.disabled=false;}}
 root.querySelectorAll<HTMLButtonElement>('[data-login-provider]').forEach(button=>button.onclick=()=>void act(button,async()=>{const data=await api('/auth/start',{provider:button.dataset.loginProvider});location.assign(data.url);}));
 const emailForm=root.querySelector<HTMLFormElement>('[data-email-login]'),codeForm=root.querySelector<HTMLFormElement>('[data-code-login]');
 if(emailForm&&codeForm){
 emailForm.onsubmit=event=>{event.preventDefault();void act(emailForm.querySelector('button')!,async()=>{const data=await api('/auth/start',{provider:'email',email:new FormData(emailForm).get('email')});state=data.state;emailForm.hidden=true;codeForm.hidden=false;codeForm.querySelector('input')!.focus();status.textContent=t('Check your email for the sign-in code.');});};
 codeForm.onsubmit=event=>{event.preventDefault();void act(codeForm.querySelector('button')!,async()=>{try{await api('/auth/verify',{state,code:new FormData(codeForm).get('code')});onDone();}catch(error){codeForm.hidden=true;emailForm.hidden=false;throw error;}});};
 }
}
