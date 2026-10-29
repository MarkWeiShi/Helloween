import {spawn} from 'node:child_process';
import {startBrowserApp} from '../tests/helpers/nginx.mjs';
const app=await startBrowserApp();
try {
 const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,PLAYWRIGHT_TEST_BASE_URL:app.origin,WD_ACCEPTANCE_ORIGIN:app.origin,LOCALIZATION_BASE_URL:app.origin},
 });
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}finally{await app.stop();}
