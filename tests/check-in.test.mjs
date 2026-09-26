import test from "node:test";
import assert from "node:assert/strict";
import { createCheckInSubmission } from "../src/features/check-in/submission.js";
import { savePlayerProfile } from "../src/features/profile/savePlayerProfile.js";

test("check-in waits for acknowledgement and ignores duplicate taps", async () => {
  const submit = createCheckInSubmission();
  let resolveSave, writes=0, advances=0;
  const save=()=>{ writes++; return new Promise(resolve=>{resolveSave=resolve;}); };
  const first=submit(save,()=>advances++);
  const duplicate=submit(save,()=>advances++);
  await Promise.resolve();
  assert.equal(writes,1);
  assert.equal(advances,0);
  assert.equal(first,duplicate);
  resolveSave({ok:true});
  await first;
  assert.equal(advances,1);
});

test("rejected and failed saves remain on the form and can be retried", async () => {
  const submit=createCheckInSubmission(); let advances=0;
  assert.equal((await submit(()=>({ok:false,error:"Number taken"}),()=>advances++)).error,"Number taken");
  assert.equal((await submit(()=>Promise.reject(new Error("offline")),()=>advances++)).ok,false);
  assert.equal(advances,0);
  await submit(()=>({ok:true}),()=>advances++);
  assert.equal(advances,1);
});

test("check-in requires an explicit success acknowledgement", async () => {
  const submit=createCheckInSubmission(); let advances=0;
  for (const response of [undefined, null, {}, {ok:"true"}]) {
    const result=await submit(()=>response,()=>advances++);
    assert.equal(result.ok,false);
    assert.match(result.error,/Try again/);
  }
  assert.equal(advances,0);
  const rejection={ok:false,error:"Number taken",extra:{player:"Brandon"}};
  assert.deepEqual(await submit(()=>rejection,()=>advances++),rejection);
  const thrown=await submit(()=>{throw new Error("offline");},()=>advances++);
  assert.equal(thrown.ok,false);
  await submit(()=>({ok:true}),()=>advances++);
  assert.equal(advances,1);
});

test("check-in stays guarded while asynchronous advancement finishes", async () => {
  const submit=createCheckInSubmission();
  let resolveAdvance, writes=0;
  const advancing=new Promise(resolve=>{resolveAdvance=resolve;});
  let beganAdvance;
  const started=new Promise(resolve=>{beganAdvance=resolve;});
  const first=submit(()=>{writes++;return {ok:true};},()=>{beganAdvance();return advancing;});
  await started;
  const duplicate=submit(()=>{writes++;return {ok:true};},()=>{});
  assert.equal(first,duplicate);
  assert.equal(writes,1);
  resolveAdvance();
  await first;
  await submit(()=>{writes++;return {ok:true};},()=>{});
  assert.equal(writes,2);
});

test("an advancement error does not relabel an acknowledged save as a failed write", async () => {
  const submit=createCheckInSubmission();
  const error=new Error("navigation failed");
  await assert.rejects(submit(()=>({ok:true}),()=>{throw error;}),error);
  assert.equal((await submit(()=>({ok:true}),()=>{})).ok,true);
});

test("profile save waits for its photo and surfaces photo failure", async () => {
  let uploaded=false;
  const result=await savePlayerProfile({player:"Brandon",profile:{display:"Brandon",photo:"test-photo"},
    save:async()=>({ok:true}), upload:async()=>{uploaded=true;return {ok:false,error:"Upload failed"};}});
  assert.equal(uploaded,true);
  assert.deepEqual(result,{ok:false,error:"Upload failed",profileSaved:true});
  uploaded=false;
  const rejected=await savePlayerProfile({player:"Brandon",profile:{photo:"test-photo"},
    save:async()=>({ok:false,error:"Not your profile"}),upload:async()=>{uploaded=true;}});
  assert.equal(uploaded,false);
  assert.equal(rejected.error,"Not your profile");
});

test("profile save acknowledges fields before uploading and waits for the photo", async () => {
  let resolveSave, resolveUpload, settled=false;
  const calls=[];
  const profile=Object.freeze({display:"Brandon",num:7,photo:"test-photo"});
  const saved={ok:true,version:12};
  const operation=savePlayerProfile({player:"Brandon",profile,
    save:(player,fields)=>{
      calls.push(["save",player,fields]);
      return new Promise(resolve=>{resolveSave=resolve;});
    },
    upload:(player,photo)=>{
      calls.push(["upload",player,photo]);
      return new Promise(resolve=>{resolveUpload=resolve;});
    }}).then(result=>{settled=true;return result;});
  assert.deepEqual(calls,[["save","Brandon",{display:"Brandon",num:7}]]);
  resolveSave(saved);
  await Promise.resolve();
  assert.deepEqual(calls[1],["upload","Brandon","test-photo"]);
  assert.equal(settled,false);
  resolveUpload({ok:true});
  assert.equal(await operation,saved);
  assert.equal(profile.photo,"test-photo");
});

test("profile save returns recoverable errors for missing acknowledgements and thrown writes", async () => {
  const profile={display:"Brandon",photo:"test-photo"};
  let uploads=0;
  for (const save of [()=>undefined,()=>({}),()=>{throw new Error("offline");},
    ()=>Promise.reject(new Error("offline"))]) {
    const result=await savePlayerProfile({player:"Brandon",profile,save,
      upload:()=>{uploads++;return {ok:true};}});
    assert.equal(result.ok,false);
    assert.match(result.error,/Try again/);
    assert.equal(result.profileSaved,undefined);
  }
  assert.equal(uploads,0);
  for (const upload of [()=>undefined,()=>{throw new Error("network failed");},
    ()=>Promise.reject(new Error("network failed"))]) {
    const result=await savePlayerProfile({player:"Brandon",profile,
      save:()=>({ok:true}),upload});
    assert.deepEqual(result,{ok:false,error:"Couldn't save your photo. Try again.",profileSaved:true});
  }
});

test("profile save without a new photo returns the field acknowledgement", async () => {
  const saved={ok:true,version:8};
  const result=await savePlayerProfile({player:"Brandon",profile:{display:"Brandon"},
    save:()=>saved,upload:()=>assert.fail("No photo should upload")});
  assert.equal(result,saved);
});

test("check-in retains a failed photo draft and advances only after a successful retry", async () => {
  const submit=createCheckInSubmission();
  const profile=Object.freeze({display:"Brandon",photo:"test-photo"});
  let advances=0,writes=0,uploads=0;
  const save=()=>savePlayerProfile({player:"Brandon",profile,
    save:()=>{writes++;return {ok:true};},
    upload:()=>{uploads++;return uploads===1 ? {ok:false,error:"Upload failed"} : {ok:true};}});
  const failed=await submit(save,()=>advances++);
  assert.equal(failed.profileSaved,true);
  assert.equal(advances,0);
  assert.equal(profile.photo,"test-photo");
  assert.equal((await submit(save,()=>advances++)).ok,true);
  assert.equal(advances,1);
  assert.equal(writes,2);
  assert.equal(uploads,2);
});
