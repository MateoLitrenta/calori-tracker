// Serialized into the isolated browser fixture. The four views, ThemeProvider,
// requestAI and goal parsing/confirmation are product code. Intercept their
// HTTP boundary in memory; this origin has no credentials or real services.
export function installGlobalFixture() {
  const qa=window.__homeQA;
  // Preserve the shared fixture day while allowing reaction timestamps, timers
  // and message identifiers to advance normally across multiple interactions.
  const FixedDay=Date;
  const initialTime=FixedDay.now();
  const started=performance.now();
  class LocalClock extends FixedDay {
    static now(){return initialTime+Math.floor(performance.now()-started);}
    constructor(...args){super(...(args.length?args:[LocalClock.now()]));}
  }
  window.Date=LocalClock;
  const fixtureKey='calori-home-qa-fixtures-'+qa.phase;
  const goalKey='calori-global-goals-'+qa.phase;
  qa.profileWrites=[];
  qa.goalWrites=[];
  qa.authEvents=[];
  qa.files=new Map();
  qa.goals=JSON.parse(localStorage.getItem(goalKey)||'{}');
  qa.setProfile=patch=>{
    qa.profiles={...qa.profiles,[qa.account]:{...qa.profiles[qa.account],...patch}};
    localStorage.setItem(fixtureKey,JSON.stringify(qa.profiles));
    qa.store=qa.makeStore();
    qa.notify();
  };
  const simpleStore=qa.makeStore;
  qa.makeStore=()=>({
    ...simpleStore(),loading:!!qa.loading,
    updateProfile:async value=>{
      if(value.user_id!==qa.profiles[qa.account].user_id || qa.profileError) throw Error('Fallo de perfil simulado');
      qa.profileWrites.push(qa.account);
      qa.setProfile(value);
    },
    updateAvatarPath:async value=>qa.setProfile({avatar_path:value}),
    resetData:async()=>qa.setProfile({records:{}}),
    signOut:async()=>{qa.authEvents.push('sign-out');},
  });
  qa.setLoading=loading=>{qa.loading=loading;qa.store=qa.makeStore();qa.notify();};
  qa.store=qa.makeStore();
  const fetchLocal=window.fetch.bind(window);
  const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  window.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if (url.origin!==location.origin || !url.pathname.startsWith('/api/')) return fetchLocal(input,init);
    const owner=qa.account;
    if(url.pathname==='/api/ai/chat') {
      const body=JSON.parse(init.body);
      qa.aiCalls.push(body);
      qa.notify();
      if(qa.replyDelayMs) await new Promise(done=>setTimeout(done,qa.replyDelayMs));
      if(qa.aiError) return respond({},qa.aiError);
      if(qa.nextAI) {const next=qa.nextAI;qa.nextAI=null;return respond(next);}
      return respond(body.mode==='estimate'
        ?{estimated:true,calories:body.estimateType==='workout'?220:450,assumptions:['Estimación sintética de QA'],description:'Comida sintética'}
        :{reply:'Respuesta sintética de QA',actions:[],presentation:'none'});
    }
    if(url.pathname==='/api/coach/goals') {
      if(qa.goalError) return respond({},qa.goalError);
      const goals=qa.goals[owner]||[];
      if(init?.method!=='POST') return respond({goals,hasMore:false});
      const {proposal}=JSON.parse(init.body);
      const previous=goals.find(goal=>goal.id===proposal.id);
      if(previous?proposal.expectedVersion!==previous.version:proposal.operation!=='accept') return respond({},409);
      const {operation,expectedVersion,...values}=proposal;
      const now=new Date().toISOString();
      const goal={...values,createdAt:previous?.createdAt||now,updatedAt:now,
        status:operation==='cancel'?'cancelled':'active',version:(previous?.version||0)+1};
      qa.goals[owner]=[...goals.filter(item=>item.id!==goal.id),goal];
      qa.goalWrites.push({owner,operation});
      localStorage.setItem(goalKey,JSON.stringify(qa.goals));
      return respond({goal});
    }
    qa.externalRequests++;
    throw Error('Unknown QA API route');
  };
}

export const globalSupabase = `
const q=()=>window.__homeQA;
export const supabase={
  auth:{
    getSession:async()=>({data:{session:{access_token:'local-fixture',user:q().store.user}}}),
    updateUser:async()=>{q().authEvents.push('password-update');return {error:q().authError?Error('Fallo sintético'):null};},
  },
  storage:{from:()=>({
    createSignedUrl:async path=>({data:{signedUrl:q().files.has(path)?q().files.get(path)+'#signed-fixture':null},error:null}),
    upload:async(path,blob)=>{q().files.set(path,URL.createObjectURL(blob));return {error:null};},
    remove:async paths=>{for(const path of paths)q().files.delete(path);return {error:null};},
  })},
};`;
