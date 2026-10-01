import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, BUILTIN_EVENTS, ROSTER, makeBracket, resolveSlot, bracketChampion, teamLabel, defaultQaParticipants, resolveCurrentContest, allEventsOf } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { withLegacyEvents } from "./support/legacy-events.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const blocked=names=>names.map(name=>`export const ${name}=()=>{throw new Error("Transport must not run in a ChipCounter test");};`).join("\n");
const compiled=await build({
  stdin:{contents:'export { ChipCounter, ResultSheet } from "./src/App.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";',resolveDir:root,loader:"jsx"},
  bundle:true,platform:"node",format:"cjs",external:["react"],loader:{".css":"empty"},write:false,logLevel:"silent",
  plugins:[{name:"isolated-counter",setup(builder){
    builder.onLoad({filter:/[\\/]src[\\/]lib[\\/]client\.js$/},()=>({loader:"js",contents:blocked([
      "useTournament","dispatch","uploadPhoto","downloadSnapshot","localGet","localSet","getDeviceId","setGmToken","hasGmToken",
      "spotifyStatus","spotifyPlayer","spotifySearch","spotifyAuthorize","spotifyDisconnect","spotifyPlay","spotifyPause","spotifyDevice","spotifyAutoWinSongs","songPreview", "songSnippet", "spotifyRetry",
    ])}));
    builder.onLoad({filter:/[\\/]features[\\/]check-in[\\/]install\.js$/},()=>({loader:"js",contents:
      `export const installEvt=null;\n${blocked(["onInstallReady","firstOnboardStep","isStandalone","isIOS"])}`}));
  }}],
});
const componentModule=new Module(fileURLToPath(new URL("chip-counter-ui.cjs",import.meta.url)));
componentModule.filename=componentModule.id;
componentModule.paths=Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text,componentModule.filename);
const {ChipCounter,ResultSheet,PlayerIdentityProvider}=componentModule.exports;

/* Persistent, isolated hook state lets these tests inspect the actual element
   tree after async acknowledgements. The component and ActionButton are both
   real production functions; no JSX, handler, or counter calculation is copied.
   It deliberately batches visible updates until render(), so old handlers can
   also exercise the gap between a tap and React committing disabled controls.
   Browser checks cover DOM events, focus, and layout separately. */
function counter(props={}) {
  const instances=new Map();
  let tree;
  const dispatcher=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  const renderNode=(node,path="root")=>{
    if(Array.isArray(node))return node.map((child,index)=>renderNode(child,`${path}.${index}`));
    if(!React.isValidElement(node))return node;
    if(typeof node.type==="function"){
      const instance=instances.get(path)||{cells:[]};instances.set(path,instance);let cursor=0;
      const previous=dispatcher.current;
      dispatcher.current={
        useState(initial){const index=cursor++;
          if(!instance.cells[index])instance.cells[index]={value:typeof initial==="function"?initial():initial};
          const cell=instance.cells[index];
          return [cell.value,next=>{cell.value=typeof next==="function"?next(cell.value):next;}];},
        useRef(initial){const index=cursor++;
          if(!instance.cells[index])instance.cells[index]={value:{current:initial}};
          return instance.cells[index].value;},
        useId(){const index=cursor++;
          if(!instance.cells[index])instance.cells[index]={value:`test:${path}:${index}`};
          return instance.cells[index].value;},
      };
      let rendered;
      try{rendered=node.type(node.props);}finally{dispatcher.current=previous;}
      return renderNode(rendered,`${path}.render`);
    }
    return {...node,props:{...node.props,children:renderNode(node.props.children,`${path}.children`)}};
  };
  const all=(node,match,out=[])=>{
    if(Array.isArray(node)){for(const child of node)all(child,match,out);return out;}
    if(!React.isValidElement(node))return out;
    if(match(node))out.push(node);
    all(node.props.children,match,out);return out;
  };
  const text=node=>Array.isArray(node)?node.map(text).join(""):
    React.isValidElement(node)?text(node.props.children):typeof node==="string"||typeof node==="number"?String(node):"";
  const view={
    render(){tree=renderNode(React.createElement(ChipCounter,{start:0,onDone:()=>({ok:true}),...props}));return view;},
    find(match){const found=all(tree,match)[0];assert.ok(found,"Expected a rendered control");return found;},
    input(value){return view.find(node=>node.type==="input"&&node.props["aria-label"]===`Number of ${value} chips`);},
    button(name){return view.find(node=>node.type==="button"&&(node.props["aria-label"]||text(node.props.children))===name);},
    change(value,count){const input=view.input(value);assert.equal(!!input.props.disabled,false);input.props.onChange({target:{value:String(count)}});return view.render();},
    click(name){const button=view.button(name);assert.equal(!!button.props.disabled,false);button.props.onClick();return view.render();},
    total(){return text(view.find(node=>node.props.className==="fd-chip-count-total"));},
    errors(){return all(tree,node=>node.props.role==="alert").map(text);},
    controls(){return all(tree,node=>node.type==="button"||node.type==="input");},
    async settled(){await new Promise(resolve=>setImmediate(resolve));return view.render();},
  };
  return view.render();
}

test("numeric denomination entries update the actual total and submit it",async()=>{
  const saved=[],view=counter({start:1725,onDone:total=>{saved.push(total);return {ok:true};}});
  assert.deepEqual([1000,500,100,25].map(value=>view.input(value).props.value),[1,1,2,1]);
  assert.equal(view.total(),"Total1,725");
  view.change(1000,2).change(500,3).change(100,4).change(25,5);
  assert.equal(view.total(),"Total4,025");
  view.click("Save count");
  assert.deepEqual(saved,[4025]);
  await view.settled();
  assert.deepEqual(view.errors(),[]);
});

test("blank counts mean zero, invalid numeric text is ignored, and decrement never goes negative",()=>{
  const view=counter({start:125});
  view.change(100,"");
  assert.equal(view.total(),"Total25");
  assert.equal(view.button("Remove one 100 chip").props.disabled,true);
  for(const invalid of ["-1","1.5","1e2","abc"]){view.change(25,invalid);assert.equal(view.total(),"Total25");}
  view.click("Remove one 25 chip");
  assert.equal(view.total(),"Total0");
  assert.equal(view.button("Remove one 25 chip").props.disabled,true);
  view.click("Add one 500 chip");
  assert.equal(view.total(),"Total500");
});

test("failed asynchronous saves retain counts and error; acknowledged retry sends the unchanged total",async()=>{
  let acknowledge;
  const saved=[],view=counter({onDone:total=>{saved.push(total);return new Promise(resolve=>{acknowledge=resolve;});}});
  view.change(100,8).change(25,3).click("Save count");
  assert.equal(view.total(),"Total875");
  assert.ok(view.controls().every(control=>control.props.disabled===true));
  acknowledge({ok:false,error:"Connection failed"});await view.settled();
  assert.deepEqual(view.errors(),["Connection failed"]);
  assert.equal(view.input(100).props.value,"8");assert.equal(view.input(25).props.value,"3");
  view.click("Save count");
  assert.deepEqual(view.errors(),[]);assert.deepEqual(saved,[875,875]);
  acknowledge({ok:true});await view.settled();
  assert.deepEqual(view.errors(),[]);assert.equal(view.total(),"Total875");
  assert.equal(!!view.button("Save count").props.disabled,false);
});

test("pending save ignores repeated taps and edits captured before the disabled controls render",async()=>{
  let acknowledge;
  const saved=[],view=counter({start:500,onDone:total=>{saved.push(total);return new Promise(resolve=>{acknowledge=resolve;});}});
  const staleSave=view.button("Save count").props.onClick;
  const staleEdit=view.input(100).props.onChange;
  const staleAdd=view.button("Add one 1000 chip").props.onClick;
  staleSave();staleSave();staleEdit({target:{value:"9"}});staleAdd();view.render();
  assert.deepEqual(saved,[500]);
  assert.equal(view.total(),"Total500");
  assert.ok(view.controls().every(control=>control.props.disabled===true));
  acknowledge({ok:true});await view.settled();
  assert.equal(view.total(),"Total500");
});

test("missing success acknowledgements and thrown saves preserve the draft and expose retry",async()=>{
  for(const response of [undefined,null,{}, {ok:"true"}]){
    let attempts=0;
    const view=counter({start:625,onDone:()=>++attempts===1?response:{ok:true}});
    view.click("Save count");await view.settled();
    assert.equal(view.total(),"Total625");
    assert.match(view.errors()[0]||"",/not saved|Try again/i);
    view.click("Save count");await view.settled();
    assert.deepEqual(view.errors(),[]);assert.equal(attempts,2);
  }
  const view=counter({start:725,onDone:()=>{throw new Error("Offline");}});
  view.click("Save count");await view.settled();
  assert.equal(view.total(),"Total725");assert.deepEqual(view.errors(),["Offline"]);
  assert.equal(!!view.button("Save count").props.disabled,false);
});

function finishedBracket(id,patch={}) {
  const state=structuredClone(EMPTY_STATE),ev={...BUILTIN_EVENTS.find(event=>event.id===id),...patch};
  const size=ev.teamCfg.bracket,playersPerTeam=ev.teamCfg.size;
  state.draws[id]={id:"test-finished-draw",teams:Array.from({length:size},(_,index)=>({players:ROSTER.slice(index*playersPerTeam,(index+1)*playersPerTeam)}))};
  state.brackets[id]=makeBracket(size);
  for(const round of state.brackets[id].rounds)for(const match of round)match.winner=resolveSlot(state.brackets[id],match.a);
  state.eventOps[id]={contest:{id:"test-final",revision:5,phase:"awaiting-result"},resultEntryAt:1};
  return {state,ev};
}

function resultControls(state,ev,select=[]) {
  const buttons=new Map(),saved=[];
  const createElement=React.createElement;
  const text=node=>Array.isArray(node)?node.map(text).join(""):
    React.isValidElement(node)?text(node.props.children):typeof node==="string"||typeof node==="number"?String(node):"";
  let selection=0,html;
  React.createElement=(type,props,...children)=>{
    // Select in the owning ResultSheet render, before PlayerChip expands.
    const choice=select[selection];
    // {enabled:label} taps an enabled action button (a component) in the same owning render.
    const matches=typeof type==="function" ? props?.name===choice
        || (!!choice?.enabled && !props?.disabled && text(children)===choice.enabled)
      : type==="button" && (typeof choice==="string" ? text(children)===choice
        : choice?.buttonPrefix && text(children).startsWith(choice.buttonPrefix));
    if(selection<select.length&&matches&&props?.onClick){selection++;props.onClick();}
    if(type==="button")buttons.set(props?.["aria-label"]||text(children),{...props,text:text(children)});
    return createElement(type,props,...children);
  };
  try{html=renderToStaticMarkup(createElement(PlayerIdentityProvider,{profiles:state.profiles},
    createElement(ResultSheet,{state,ev,onClose:()=>{},save:slots=>{saved.push(structuredClone(slots));return {ok:true};}})));}
  finally{React.createElement=createElement;}
  assert.equal(selection,select.length,"Requested player choices should render");
  return {html,buttons,saved,post(){const button=buttons.get("Post official result");assert.ok(button);assert.equal(!!button.disabled,false);button.onClick();}};
}

test("a completed first-place-only bracket displays its winner without asking the host to pick again",()=>{
  /* every slate bracket pays three places now; an event's own `pays` table can still pay 1st only */
  const {state,ev}=finishedBracket("die",{pays:[400,0,0]}),winner=state.draws[ev.id].teams[bracketChampion(state.brackets[ev.id])].players;
  const view=resultControls(state,ev);
  assert.match(view.html,/fd-result-winner/);
  for(const player of winner)assert.ok(view.html.includes(player));
  assert.doesNotMatch(view.html,/<fieldset|Pick by player/);
  assert.deepEqual([...view.buttons.keys()],["Close","Post official result"]);
  view.post();assert.deepEqual(view.saved[0][0],winner);
});

test("higher-award brackets retain lower-place selection while the winning team stays fixed",()=>{
  const {state,ev}=finishedBracket("volley"),br=state.brackets[ev.id],draw=state.draws[ev.id];
  const champion=bracketChampion(br),winner=draw.teams[champion];
  const final=br.rounds.at(-1)[0],runner=resolveSlot(br,final.b);
  const view=resultControls(state,ev);
  assert.match(view.html,/<fieldset/);
  assert.ok([...view.buttons.keys()].some(name=>name.startsWith("Runners-up")));
  assert.ok(!view.buttons.has(teamLabel(state,winner)),"Known winner must not appear as a mutable team choice");
  view.post();assert.deepEqual(view.saved[0][0],winner.players);assert.deepEqual(view.saved[0][1],draw.teams[runner].players);
});

test("sequenced free-for-all first place replaces the prior selection with one player",()=>{
  const state=structuredClone(EMPTY_STATE),ev=BUILTIN_EVENTS.find(event=>event.id==="putt");
  state.eventOps[ev.id]={contest:{id:"test-ffa",revision:1,phase:"awaiting-result"},resultEntryAt:1};
  /* Long Putt pays 2nd and 3rd too, so posting 1st alone goes through Leave empty */
  const view=resultControls(state,ev,[ROSTER[0],ROSTER[1],{enabled:"Post official result"},{enabled:"Leave empty"}]);
  assert.doesNotMatch(view.html,/fd-result-winner/);
  assert.equal(view.buttons.get(ROSTER[0])["aria-pressed"],false);
  assert.equal(view.buttons.get(ROSTER[1])["aria-pressed"],true);
  assert.deepEqual(view.saved,[[[ROSTER[1]],[],[]]]);
});

const twoTeamResult=(state,ev,expected)=>{
  const gm={isGm:true,player:ROSTER[0]};
  assert.equal(applyAction(state,"announceAndDraw",{evId:ev.id,players:defaultQaParticipants(ev)},gm).ok,true);
  const contest=resolveCurrentContest(state,ev);
  assert.equal(applyAction(state,"lockAndStart",{evId:ev.id,contestId:contest.id,contestRevision:contest.revision},gm).ok,true);
  assert.equal(applyAction(state,"beginResultEntry",{evId:ev.id},gm).ok,true);
  const teams=state.draws[ev.id].teams;
  assert.equal(teams.length,2);
  assert.doesNotMatch(resultControls(state,ev).html,/Pick by player|Runners-up|Winners</,"no places to fill");
  const view=resultControls(state,ev,[teamLabel(state,teams[1])]);
  view.post();
  assert.deepEqual(view.saved[0],expected(teams));
  const saved=applyAction(state,"saveResult",{evId:ev.id,slots:view.saved[0]},gm);
  assert.equal(saved.ok,true,saved.error);
};

test("a two-team game's result is one tap on the winning team; the other team is 2nd",()=>{
  /* Flip Cup (legacy): two even teams, 2nd pays */
  const state=withLegacyEvents(structuredClone(EMPTY_STATE),["flip"]),ev=allEventsOf(state).find(event=>event.id==="flip");
  twoTeamResult(state,ev,teams=>[teams[1].players,teams[0].players,[]]);
});

test("5v5 is one tap on the winning side and pays winners only, so the other side takes no place",()=>{
  const state=structuredClone(EMPTY_STATE),ev=BUILTIN_EVENTS.find(event=>event.id==="bball5");
  twoTeamResult(state,ev,teams=>[teams[1].players,[],[]]);
});
