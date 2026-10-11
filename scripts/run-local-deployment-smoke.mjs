// Uses the prepared source, without touching Colyseus Cloud or any Site.
import {boot} from '@colyseus/testing';
import {spawn} from 'node:child_process';
import app from '../src/app.config.ts';
const previous=process.env.DEV_SESSION_SECRET,secret='local-only-deployment-smoke-fixture-32-bytes';process.env.DEV_SESSION_SECRET=secret;
const server=await boot(app);
try{
 const child=spawn(process.execPath,['scripts/deployment-smoke.mjs'],{env:{...process.env,BLOCKRIFT_SMOKE_ENDPOINT:server.sdk.getHttpEndpoint('/').replace(/\/$/,'')},stdio:['pipe','inherit','inherit']});
 child.stdin.end(JSON.stringify({bypass:'',localTokenSecret:secret})+'\n');
 process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(Number.isInteger(code)?code:2)));
}finally{await server.shutdown();if(previous===undefined)delete process.env.DEV_SESSION_SECRET;else process.env.DEV_SESSION_SECRET=previous;}
