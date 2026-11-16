// Pure rules. No client-provided puzzle, clock, identity, or score is trusted.
export function puzzle(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day).toISOString().slice(0,10)!==day) throw new Error('Invalid day');
  let seed=2166136261; for(const c of day) seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
  const rotation=seed%4, mirror=(seed>>>2)%2;
  const transform=n=>{let x=n%4,y=Math.floor(n/4);if(mirror)x=3-x;for(let i=0;i<rotation;i++) [x,y]=[3-y,x];return y*4+x;};
  // A connected serpentine route guarantees a solution every day. Three fixed
  // landmarks along it, transformed by the day seed, define the rescue order.
  const snake=[0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12].map(transform);
  return {day,id:`route-v1:${day}`,size:4,start:snake[0],finish:snake[15],rescues:[snake[3],snake[8],snake[12]]};
}
export function initial(day){return {puzzleId:puzzle(day).id,path:[],revision:0,resets:0};}
export function evaluate(p,path){
  if(!Array.isArray(path)||path.length>16)throw new Error('Route must contain at most 16 cells');
  let rescued=0;const seen=new Set();
  for(let i=0;i<path.length;i++){
    const n=path[i];if(!Number.isInteger(n)||n<0||n>15)throw new Error('Cell out of bounds');
    if(seen.has(n))throw new Error('A route cannot revisit a cell');
    if(i===0&&n!==p.start)throw new Error('Start at the ambulance');
    if(i>0&&Math.abs(n%4-path[i-1]%4)+Math.abs(Math.floor(n/4)-Math.floor(path[i-1]/4))!==1)throw new Error('Move one square horizontally or vertically');
    if(p.rescues.includes(n)){if(n!==p.rescues[rescued])throw new Error('Rescue patients in numbered order');rescued++;}
    if(n===p.finish&&(rescued!==3||i!==path.length-1))throw new Error('Reach hospital only after all rescues');
    seen.add(n);
  }
  const won=path.at(-1)===p.finish&&rescued===3;
  return {rescued,won,score:won?1000-(path.length-1)*25:0};
}
export function apply(p,state,action){
  if(action.revision!==state.revision)throw new Error('Stale route; refresh and try again');
  let path;
  if(action.type==='reset')path=[];
  else if(action.type==='move'){
    if(evaluate(p,state.path).won)throw new Error('Route finished; reset to play again');
    path=[...state.path,action.cell];
  }else throw new Error('Unknown action');
  evaluate(p,path);
  return {...state,path,revision:state.revision+1,resets:state.resets+(action.type==='reset'?1:0)};
}
export function view(p,state){return {puzzle:p,state,...evaluate(p,state.path)};}
