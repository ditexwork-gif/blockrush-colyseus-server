import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
// A fresh Colyseus transport per suite avoids reusing a shut-down WebSocket server.
for(const file of (await readdir('test')).filter(name=>name.endsWith('.test.ts')).sort()){
 const result=spawnSync(process.execPath,['node_modules/mocha/bin/mocha.js','-r','tsx','test/'+file,'--exit','--timeout','15000'],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
