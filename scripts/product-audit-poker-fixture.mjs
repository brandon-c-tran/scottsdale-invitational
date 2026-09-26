// Advance only the disposable UI-audit authority to poker setup.
// This preserves prior UI-earned stacks; it does not fake a client snapshot.
import assert from 'node:assert/strict';
const ws = new WebSocket('ws://127.0.0.1:5187/ws');
const deviceId = `audit-fixture-${crypto.randomUUID()}`;
let token, sequence = 0;
const pending = new Map();
const first = new Promise(resolve => {
  ws.onmessage = ({data}) => {
    const msg = JSON.parse(data);
    if (msg.type === 'state') resolve(msg);
    if (msg.type === 'ack') pending.get(msg.actionId)?.(msg);
  };
});
await new Promise((resolve,reject) => {ws.onopen=resolve;ws.onerror=reject;});
ws.send(JSON.stringify({type:'hello',deviceId}));
const initial = await first;
assert.equal(initial.environment, 'local');
function send(type,payload={}) {
  return new Promise((resolve,reject) => {
    const actionId=`fixture-${++sequence}`;
    const timeout=setTimeout(()=>reject(new Error(`${type} timed out`)),6000);
    pending.set(actionId,msg=>{clearTimeout(timeout);pending.delete(actionId);resolve(msg);});
    ws.send(JSON.stringify({deviceId,gmToken:token,actionId,type,payload}));
  });
}
const auth=await send('gmUnlock',{pin:'2468'});
assert(auth.ok,auth.error);token=auth.extra.gmToken;
const setup=await send('pokerSetup');
assert(setup.ok,setup.error);
console.log('Isolated poker setup acknowledged; prior UI-earned chips retained.',JSON.stringify({version:setup.version,...setup.extra}));
ws.close();
