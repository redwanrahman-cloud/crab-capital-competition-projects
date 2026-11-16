'use strict';
let state;
const $ = id => document.getElementById(id);
function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
function clear(id) { $(id).replaceChildren(); return $(id); }
function message(text, error=false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function api(path, data) {
  const result = await fetch(path, data ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)} : {});
  const value = await result.json(); if (!result.ok) throw Error(value.error || 'Local operation failed'); return value;
}
async function load() { state = await api('/api/state'); render(); }
function render() {
  const sources = clear('sources');
  for (const s of state.sources) {
    const card = el('article'); card.append(el('h3', `Source ${s.id} · revision ${s.number}`), el('p', s.text), el('code', s.current));
    const label = el('label', 'New synthetic source text'); const input = el('textarea'); input.value = s.text; input.maxLength=8000; input.rows=4; label.append(input); card.append(label);
    const btn = el('button', 'Save new revision');
    btn.onclick = async () => { btn.disabled = true; try { const result = await api('/api/revise', {source:s.id,text:input.value,expected:s.current}); await load(); message(result.duplicate ? 'Exact duplicate: the current revision was retained.' : 'New revision saved. Original text and judgments preserved. Follow its impact below.'); } catch (e) { message(e.message,true); btn.disabled=false; } };
    card.append(btn);
    if (s.id === 'A') { const demo = el('button', 'Try synthetic change: 12 → 24 ms', 'secondary'); demo.onclick = () => {input.value='Synthetic cache evaluation: median latency was 24 ms.'; input.focus(); message('Example placed in the editor. Save new revision to apply it.');}; card.append(demo); }
    sources.append(card);
  }
  const paths = clear('paths');
  $('impact-summary').textContent = state.impact.length ? `${new Set(state.impact.map(x=>x.affected)).size} claim(s) / decision(s) linked to changed source evidence. Review status is shown on each card below.` : 'No source change detected. Try revising source A to see C1 → C2 → D1 and C1 → D2. D3 is the unrelated control.';
  for (const p of state.impact) {
    const item = el('article', undefined, 'path');
    const trail = [p.direct_claim];
    function route(id, seen=new Set()) { if (seen.has(id)) return null; if (id===p.direct_claim) return [id]; seen.add(id); for(const dep of state.dependencies.filter(d=>d.dependent===id)) {const r=route(dep.claim,new Set(seen)); if(r)return [...r,id];} return null; }
    item.append(el('strong', `Source ${p.source} changed → ${(route(p.affected)||trail).join(' → ')}`), el('p', `Affected ${p.kind}: ${p.affected}. Exact revision transition:`), el('code', `${p.prior_revision} → ${p.current_revision}`));
    const old = state.revisions.find(r=>r.id===p.prior_revision), now = state.revisions.find(r=>r.id===p.current_revision);
    item.append(el('p', `BEFORE: ${old.text}`), el('p', `AFTER: ${now.text}`)); paths.append(item);
  }
  $('query').textContent = state.impact_query;
  const nodes = clear('nodes');
  for (const n of state.nodes) {
    const card=el('article'); card.append(el('span',n.status,n.status.startsWith('Needs')?'badge warn':'badge'),el('h3',`${n.id} · ${n.kind}`),el('p',n.text),el('p',n.judgment,'muted'));
    const deps = state.dependencies.filter(d=>d.dependent===n.id).map(d=>d.claim);
    if(deps.length)card.append(el('p',`Depends on: ${deps.join(', ')}`));
    const label=el('label','Your review note'); const note=el('textarea'); note.rows=2;note.maxLength=2000;label.append(note);card.append(label);
    const button=el('button','Record human review'); button.onclick=async()=>{button.disabled=true;try{await api('/api/review',{target:n.id,baseline:state.baseline,note:note.value});await load();message(`Human review saved for ${n.id}, bound to current revisions.`);}catch(e){message(e.message,true);button.disabled=false;}};card.append(button);nodes.append(card);
  }
  const evidence=clear('evidence');
  for(const e of state.evidence){const card=el('article');card.append(el('h3',`Source ${e.source} ${e.relationship.toLowerCase()} ${e.claim}`),el('blockquote',e.quote),el('code',`${e.revision} · chars [${e.start}, ${e.end})`));evidence.append(card);}
  const history=clear('history');for(const r of state.revisions){const card=el('article');card.append(el('h3',`Source ${r.source} · revision ${r.number}`),el('p',r.text),el('code',r.id));history.append(card);}
  const reviews=clear('reviews'); if(!state.reviews.length)reviews.append(el('p','No human reviews recorded yet.'));
  for(const r of state.reviews){const card=el('article');card.append(el('strong',`${r.target} · ${r.time} · ${r.baseline===state.baseline?'current revisions':'historical revisions'}`),el('p',r.note),el('code',`Revision-set fingerprint: ${r.baseline}`));
    if(r.revisions){const detail=el('details');detail.append(el('summary','Exact source revisions acknowledged'));
      for(const binding of r.revisions){const revision=state.revisions.find(x=>x.id===binding.revision);detail.append(el('code',`Source ${binding.source}: ${binding.revision}`),el('p',revision ? revision.text : 'Revision text unavailable.'));}card.append(detail);
    }else{card.append(el('p','Legacy acknowledgment: exact revision IDs were not recorded. Only its original fingerprint is retained.','muted'));}reviews.append(card);}
}
load().then(()=>message('Local Relate graph opened. All example content is synthetic.')).catch(e=>message(e.message,true));
