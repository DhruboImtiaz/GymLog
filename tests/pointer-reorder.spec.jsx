import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {test,expect,vi} from 'vitest';
import usePointerReorder from '../src/hooks/usePointerReorder';

function fixture(){
  const makeHandle=()=>{const events=new Map();return {events,addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:(n,fn)=>{if(events.get(n)===fn)events.delete(n);},setPointerCapture(){},releasePointerCapture(){}};};
  const handles=[makeHandle(),makeHandle()];
  const cards=handles.map((h,i)=>({style:{},classList:{contains:n=>n==='card',add(){},remove(){}},querySelector:()=>h,getBoundingClientRect:()=>({top:i*50}),offsetHeight:40}));
  return {handles,container:{children:cards,getBoundingClientRect:()=>({top:0})}};
}
function Probe({container,items,save}){usePointerReorder({current:container},items,save);return null;}

test('refresh and unmount remove drag listeners and cancel pending stale ordering',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
  const f=fixture();const save=vi.fn();let renderer;
  try{
    await act(async()=>{renderer=TestRenderer.create(<Probe container={f.container} items={[{id:'a'},{id:'b'}]} save={save}/>);});
    await act(async()=>vi.advanceTimersByTime(50));
    const h=f.handles[0];h.events.get('pointerdown')({clientY:0,pointerId:1,button:0,pointerType:'mouse',preventDefault(){},stopPropagation(){}});
    h.events.get('pointermove')({clientY:80});h.events.get('pointerup')({pointerId:1});
    await act(async()=>renderer.update(<Probe container={f.container} items={[{id:'b'},{id:'a'}]} save={save}/>));
    await act(async()=>vi.advanceTimersByTime(500));
    expect(save).not.toHaveBeenCalled();
    h.events.get('pointerdown')({clientY:0,pointerId:2,button:0,pointerType:'mouse',preventDefault(){},stopPropagation(){}});
    expect(h.events.has('pointermove')).toBe(true);
    await act(async()=>renderer.unmount());renderer=null;
    expect(h.events.size).toBe(0);
  }finally{if(renderer)await act(async()=>renderer.unmount());vi.useRealTimers();}
});
