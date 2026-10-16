import { beforeEach,afterEach,test,expect,vi } from 'vitest';
import { getGymLogData,getTheme,getFontSize } from '../src/storage/storage';
import { executeRestore } from '../src/utils/restore';
const guest=name=>({days:[{id:'d',name,createdAt:'2026-10-16',exercises:[]}],measurements:[]});
beforeEach(()=>{
  const values=new Map();
  vi.stubGlobal('localStorage',{get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)});
  vi.stubGlobal('window',{location:{reload:vi.fn()}});
});
afterEach(()=>vi.unstubAllGlobals());
test('wrong-shaped guest arrays are preserved and reported as malformed',()=>{
  const raw=JSON.stringify({days:null,measurements:[]});localStorage.setItem('gymlog_data',raw);
  expect(getGymLogData()).toBe(null);expect(localStorage.getItem('gymlog_data')).toBe(raw);
});
test('invalid backups fail before replacing existing guest data',()=>{
  const original=JSON.stringify(guest('Original'));localStorage.setItem('gymlog_data',original);
  expect(()=>executeRestore({metadata:{schemaVersion:1},data:{gymlog_data:JSON.stringify({days:[],measurements:false})}})).toThrow();
  expect(localStorage.getItem('gymlog_data')).toBe(original);expect(window.location.reload).not.toHaveBeenCalled();
});
test('quota failure restoring the dataset leaves the old atomic value untouched',()=>{
  const original=JSON.stringify(guest('Original'));localStorage.setItem('gymlog_data',original);
  localStorage.setItem=()=>{throw new Error('quota');};
  expect(()=>executeRestore({metadata:{schemaVersion:1},data:{gymlog_data:JSON.stringify(guest('Replacement'))}})).toThrow(/existing data is unchanged/);
  expect(localStorage.getItem('gymlog_data')).toBe(original);
});
test('a settings failure after restore reports the true partial outcome',()=>{
  localStorage.setItem('gymlog_data',JSON.stringify(guest('Original')));
  const set=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k==='gymlog_theme')throw new Error('quota');set(k,v);};
  expect(()=>executeRestore({metadata:{schemaVersion:1},data:{gymlog_data:JSON.stringify(guest('Restored')),gymlog_theme:'dark'}})).toThrow(/Workout data was restored/);
  expect(getGymLogData().days[0].name).toBe('Restored');expect(window.location.reload).not.toHaveBeenCalled();
});
test('blocked preference reads use defaults without crashing the app',()=>{
  localStorage.getItem=()=>{throw new Error('denied');};
  expect(getTheme()).toBe('dark');expect(getFontSize()).toBe(16);
});
