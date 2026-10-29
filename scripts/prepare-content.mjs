import {prepareContent} from './lib/public-content.mjs';
const {release,snapshot}=prepareContent();
console.log(JSON.stringify({release,contentVersion:snapshot.contentVersion}));
