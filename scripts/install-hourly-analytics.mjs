import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const moduleSource = readFileSync(new URL('../server/hourly-analytics.mjs', import.meta.url), 'utf8').replace('export function', 'function');
const code = `const {DatabaseSync,backup}=require('node:sqlite');
const db=new DatabaseSync(process.env.DATABASE_PATH||'/data/boo.sqlite');
db.exec('PRAGMA busy_timeout=5000');
${moduleSource}
(async()=>{try {
require('node:fs').mkdirSync('/data/backups',{recursive:true});
const path='/data/backups/before-hourly-analytics-'+Date.now()+'.sqlite';
await backup(db,path);
installHourlyAnalytics(db);
console.log(JSON.stringify({backup:path,metadata:db.prepare('SELECT * FROM analytics_metadata').all()}));
} finally {db.close();}})().catch(error=>{console.error(error);process.exitCode=1});`;
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
execFileSync('fly', ['ssh','console','-a','helloween','--machine','867657ae710308','-C',`node -e ${quote(code)}`], {stdio:'inherit',timeout:90000});
