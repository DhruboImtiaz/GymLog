import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../src/pages/Dashboard';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, afterEach, test, expect, vi } from 'vitest';

const mock = vi.hoisted(() => ({ user: { id: 'A' }, initial: null, listeners: new Set(), cloud: { days: [], measurements: [], _version: 'v0', _generation: '0' }, rpc: vi.fn(), getSession: vi.fn(), receipts: new Set(), version: 100 }));
vi.mock('../src/lib/supabaseClient.js', () => ({ supabase: {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: mock.user } })),
    getSession: mock.getSession,
    onAuthStateChange: fn => { mock.listeners.add(fn); return { data: { subscription: { unsubscribe: () => mock.listeners.delete(fn) } } }; },
    signOut: async () => { emit(null); return {}; }
  },
  rpc: mock.rpc
} }));
vi.mock('../src/context/ThemeContext',()=>({useTheme:()=>({theme:'dark',toggleTheme:()=>{}})}));
vi.mock('../src/context/SettingsContext',()=>({useSettings:()=>({setIsSettingsOpen:()=>{}})}));
vi.mock('../src/hooks/usePointerReorder',()=>({default:()=>{}}));
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { MigrationProvider, useMigration } from '../src/context/MigrationContext';
import { DataProvider, useGymLogData } from '../src/context/DataContext';
import { MigrationService } from '../src/lib/migrationService';
import { SupabaseService } from '../src/lib/repository';
import { fingerprint, prepareGymLogData, readMigrationState } from '../src/lib/syncOperations';

const guest = name => ({ days: [{ id: 'd', name: name || 'Push', createdAt: '2026-10-16', exercises: [{ id: 'e', name: 'Bench', sets: [{ id: 's', num: 1, reps: 5, weight: 50 }], history: [] }] }], measurements: [] });
let latest, renderer;
function Probe() { latest = { auth: useAuth(), migration: useMigration(), data: useGymLogData() }; return null; }
function emit(user) { mock.user = user; for (const fn of mock.listeners) fn(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null); }
async function mount(child = null) { await act(async () => { renderer = TestRenderer.create(<AuthProvider><MigrationProvider><DataProvider><Probe />{child}</DataProvider></MigrationProvider></AuthProvider>); }); }
async function settle(predicate) { await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 1)); }); expect(Boolean(predicate())).toBe(true); }, { timeout: 2000 }); }
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const values = new Map();
  vi.stubGlobal('localStorage', { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k), clear: () => values.clear() });
  vi.stubGlobal('window', new EventTarget());
  mock.receipts.clear(); mock.version=100;
  latest=null; renderer=null; mock.user={ id:'A' }; mock.listeners.clear();
  mock.cloud={days:[],measurements:[],_version:'v0',_generation:'0'};
  mock.getSession.mockReset().mockImplementation(async () => ({ data: { session: mock.user ? { user:mock.user } : null } }));
  mock.rpc.mockReset().mockImplementation(async (name,args) => {
    if (name==='get_gymlog_snapshot') return { data:structuredClone(mock.cloud),error:null };
    if (name==='apply_gymlog_migration') { mock.cloud={...structuredClone(args.payload),_version:'v1',_generation:'1'}; return {data:{success:true},error:null}; }
    if (name==='mutate_gymlog_data') {
      if(mock.receipts.has(args.operation_id)) return {data:{success:true,replayed:true},error:null};
      if(args.expected_version!==mock.cloud._version) return {error:{message:'Cloud data changed. Reopen the editor.',code:'40001'}};
      const p=args.payload;
      if(args.action==='create_day') mock.cloud.days.push({id:p.id,name:p.name,createdAt:p.createdAt,exercises:[]});
      if(args.action==='rename_day') mock.cloud.days.find(d=>d.id===p.id).name=p.name;
      mock.cloud._version='v'+(++mock.version); mock.receipts.add(args.operation_id);
    }
    return {data:{success:true},error:null};
  });
});
afterEach(async () => { if(renderer) await act(async () => renderer.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });

test('legacy in_progress becomes an actionable migration, not a permanent lock', async () => {
  localStorage.setItem('gymlog_data',JSON.stringify(guest()));
  localStorage.setItem('gymlog_migration_status_A','in_progress');
  await mount(); await settle(() => latest.migration.conflictType==='LocalOnly' && !latest.migration.loading);
  expect(latest.data.sourceMode).toBe('migration');
});
test('guest edits after logout are evaluated despite an earlier completed status', async () => {
  const original=guest(); localStorage.setItem('gymlog_data',JSON.stringify(original));
  await MigrationService.acknowledgeGuest('A',original,()=>true);
  mock.cloud={...original,_version:'v1',_generation:'1'};
  await mount(); await settle(() => latest.data.sourceMode==='cloud' && latest.data.data);
  await act(async () => emit(null)); await settle(() => latest.data.sourceMode==='guest');
  await act(async () => latest.data.createDay('New guest day'));
  await act(async () => emit({id:'A'}));
  await settle(() => latest.migration.conflictType==='Conflict' && !latest.migration.loading);
  expect(latest.data.sourceMode).toBe('migration');
});
test('double upload submits once, clears only the uploaded guest revision and unlocks cloud', async () => {
  localStorage.setItem('gymlog_data',JSON.stringify(guest()));
  await mount(); await settle(() => latest.migration.conflictType==='LocalOnly');
  const pending=deferred(); const defaultRPC=mock.rpc.getMockImplementation();
  mock.rpc.mockImplementation((name,args) => name==='apply_gymlog_migration' ? pending.promise.then(() => defaultRPC(name,args)) : defaultRPC(name,args));
  let first,second;
  await act(async () => { first=latest.migration.resolveMigration('upload'); second=latest.migration.resolveMigration('upload'); });
  await settle(() => mock.rpc.mock.calls.some(([name]) => name==='apply_gymlog_migration'));
  expect(mock.rpc.mock.calls.filter(([name]) => name==='apply_gymlog_migration')).toHaveLength(1);
  await act(async () => { pending.resolve(); await Promise.all([first,second]); });
  await settle(() => latest.data.sourceMode==='cloud' && latest.data.data);
  expect(localStorage.getItem('gymlog_data')).toBe(null);
  expect(localStorage.getItem('gymlog_pending_migration_A')).toBe(null);
});
test('lost upload response is resumable with the exact original operation ID', async () => {
  localStorage.setItem('gymlog_data',JSON.stringify(guest()));
  await mount(); await settle(() => latest.migration.conflictType==='LocalOnly');
  const defaultRPC=mock.rpc.getMockImplementation(); let lost=true;
  mock.rpc.mockImplementation(async (name,args) => {
    const result=await defaultRPC(name,args);
    if(name==='apply_gymlog_migration' && lost) { lost=false; throw new Error('response lost'); }
    return result;
  });
  await act(async () => { await latest.migration.resolveMigration('upload'); });
  await settle(() => latest.migration.conflictType==='Recovery' && !latest.migration.busy);
  const saved=JSON.parse(localStorage.getItem('gymlog_pending_migration_A'));
  await act(async () => { await latest.migration.resolveMigration('upload'); });
  const calls=mock.rpc.mock.calls.filter(([name]) => name==='apply_gymlog_migration');
  expect(calls).toHaveLength(2); expect(calls[1][1].operation_id).toBe(saved.id);
});
test('account A completion cannot acknowledge B or delete guest data after switching accounts', async () => {
  localStorage.setItem('gymlog_data',JSON.stringify(guest()));
  await mount(); await settle(() => latest.migration.conflictType==='LocalOnly');
  const pending=deferred(); const defaultRPC=mock.rpc.getMockImplementation();
  mock.rpc.mockImplementation((name,args) => name==='apply_gymlog_migration' ? pending.promise : defaultRPC(name,args));
  let action; await act(async () => { action=latest.migration.resolveMigration('upload'); });
  await settle(() => mock.rpc.mock.calls.some(([name]) => name==='apply_gymlog_migration'));
  await act(async () => emit({id:'B'}));
  await settle(() => latest.migration.migrationUserId==='B' && !latest.migration.loading);
  await act(async () => { pending.resolve({data:{success:true},error:null}); await action; });
  expect(localStorage.getItem('gymlog_migration_status_B')).toBe(null);
  expect(localStorage.getItem('gymlog_data')).not.toBe(null);
  expect(localStorage.getItem('gymlog_pending_migration_A')).not.toBe(null);
  expect(latest.migration.busy).toBe(false);
});
test('guest edits from another tab during upload survive completion and require a new decision', async () => {
  localStorage.setItem('gymlog_data',JSON.stringify(guest()));
  await mount(); await settle(() => latest.migration.conflictType==='LocalOnly');
  const pending=deferred(); const defaultRPC=mock.rpc.getMockImplementation();
  mock.rpc.mockImplementation((name,args) => name==='apply_gymlog_migration' ? pending.promise.then(() => defaultRPC(name,args)) : defaultRPC(name,args));
  let action; await act(async () => { action=latest.migration.resolveMigration('upload'); });
  await settle(() => mock.rpc.mock.calls.some(([name]) => name==='apply_gymlog_migration'));
  localStorage.setItem('gymlog_data',JSON.stringify(guest('New guest edit')));
  await act(async () => { pending.resolve(); await action; });
  await settle(() => latest.migration.conflictType==='Conflict');
  expect(JSON.parse(localStorage.getItem('gymlog_data')).days[0].name).toBe('New guest edit');
});
test('quota failure blocks upload before any network mutation', async () => {
  localStorage.setItem=()=>{ throw new Error('storage quota exceeded'); };
  await expect(MigrationService.runMigration({ localData:guest(), userId:'A', expectedVersion:'v0', isCurrent:()=>true })).rejects.toThrow('storage quota');
  expect(mock.rpc).not.toHaveBeenCalled();
});
test('malformed guest data fails validation before upload', async () => {
  await expect(MigrationService.runMigration({localData:{days:'bad',measurements:[]},userId:'A',expectedVersion:'v0',isCurrent:()=>true})).rejects.toThrow();
  expect(mock.rpc).not.toHaveBeenCalled();
});
test('repository rejects the wrong initiating account before sending RPC', async () => {
  mock.user={id:'B'};
  await expect(SupabaseService.saveSession('e','2026-10-16',guest().days[0].exercises[0].sets,'A','1')).rejects.toThrow('account changed');
  expect(mock.rpc).not.toHaveBeenCalled();
});
test('session retries from identical snapshots use the same ID', async () => {
  const sets=guest().days[0].exercises[0].sets;
  await SupabaseService.saveSession('e','2026-10-16',sets,'A','1');
  await SupabaseService.saveSession('e','2026-10-16',sets,'A','1');
  expect(mock.rpc.mock.calls[0][1].operation_id).toBe(mock.rpc.mock.calls[1][1].operation_id);
  expect(mock.rpc.mock.calls[0][1].sets[0].id).toBe('s');
  await SupabaseService.saveSession('e','2026-10-16',sets,'A','2');
  expect(mock.rpc.mock.calls[2][1].operation_id).not.toBe(mock.rpc.mock.calls[0][1].operation_id);
});
test('completion is scoped to a guest fingerprint, with deterministic equal-date ordering', async () => {
  const local=guest(); local.days[0].exercises[0].history=[{id:'b',date:'2026-10-16',sets:[]},{id:'a',date:'2026-10-16',sets:[]}];
  const cloud=structuredClone(local); cloud.days[0].exercises[0].history.reverse();
  expect(await MigrationService.determineConflict(local,cloud)).toBe('Matching');
  const hash=await fingerprint(prepareGymLogData(local));
  await MigrationService.acknowledgeGuest('A',local,()=>true);
  expect(readMigrationState('A',hash)).toBe('completed');
  expect(readMigrationState('B',hash)).toBe('pending');
  expect(readMigrationState('A','new-guest-revision')).toBe('pending');
});
test('stale initial session cannot overwrite a newer auth event', async () => {
  const initial=deferred(); mock.getSession.mockReturnValue(initial.promise);
  await mount(); await act(async () => emit({id:'B'}));
  await act(async () => { initial.resolve({data:{session:{user:{id:'A'}}}}); });
  expect(latest.auth.user.id).toBe('B'); expect(latest.auth.identityRef.current.userId).toBe('B');
});
test('double session submission returns success only after persistence and refetch', async () => {
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(); await settle(() => latest.data.sourceMode==='cloud' && latest.data.data);
  const pending=deferred(); const defaultRPC=mock.rpc.getMockImplementation();
  mock.rpc.mockImplementation((name,args)=>name==='save_gymlog_session'?pending.promise:defaultRPC(name,args));
  let first,second;
  await act(async () => { first=latest.data.saveSession('d','e',0); second=latest.data.saveSession('d','e',0); });
  await settle(() => mock.rpc.mock.calls.some(([name])=>name==='save_gymlog_session'));
  expect(await second).toBe(false); expect(latest.data.cloudBusy).toBe(true);
  await act(async () => { pending.resolve({data:{success:true},error:null}); expect(await first).toBe(true); });
  expect(latest.data.cloudBusy).toBe(false);
});

test('an A→B→A transition invalidates the original A completion', async () => {
  localStorage.setItem('gymlog_data',JSON.stringify(guest()));
  await mount(); await settle(() => latest.migration.conflictType==='LocalOnly');
  const pending=deferred(); const defaultRPC=mock.rpc.getMockImplementation();
  mock.rpc.mockImplementation((name,args) => name==='apply_gymlog_migration'?pending.promise:defaultRPC(name,args));
  let action; await act(async () => { action=latest.migration.resolveMigration('upload'); });
  await settle(() => mock.rpc.mock.calls.some(([name])=>name==='apply_gymlog_migration'));
  await act(async () => { emit({id:'B'}); emit({id:'A'}); });
  await settle(() => latest.migration.conflictType==='Recovery');
  await act(async () => { pending.resolve({data:{success:true},error:null}); await action; });
  expect(localStorage.getItem('gymlog_migration_status_A')).toBe(null);
  expect(localStorage.getItem('gymlog_pending_migration_A')).not.toBe(null);
  expect(localStorage.getItem('gymlog_data')).not.toBe(null);
});
test('guest restore ignores imported sync metadata and preserves existing recovery records', async () => {
  const { executeRestore }=await import('../src/utils/restore');
  localStorage.setItem('gymlog_pending_migration_A','existing recovery journal');
  window.location={reload:vi.fn()};
  executeRestore({metadata:{schemaVersion:1},data:{
    gymlog_data:JSON.stringify(guest()),
    gymlog_migration_status_B:'completed',
    gymlog_pending_migration_A:'imported journal'
  }});
  expect(localStorage.getItem('gymlog_pending_migration_A')).toBe('existing recovery journal');
  expect(localStorage.getItem('gymlog_migration_status_B')).toBe(null);
});
test('a failed cloud session reports failure and reconciles before retry is enabled', async () => {
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(); await settle(() => latest.data.sourceMode==='cloud' && latest.data.data);
  const defaultRPC=mock.rpc.getMockImplementation();
  mock.rpc.mockImplementation((name,args)=>name==='save_gymlog_session'?Promise.resolve({error:{message:'Workout changed',code:'40001'}}):defaultRPC(name,args));
  await act(async () => { expect(await latest.data.saveSession('d','e',0)).toBe(false); });
  expect(latest.data.cloudError).toBe('Workout changed');
  expect(latest.data.cloudBusy).toBe(false);
  expect(latest.data.data.days[0].exercises[0].sets).toHaveLength(1);
});

test('null or wrong-shaped guest subtrees are rejected before network writes', async () => {
  for (const field of ['sets','history']) {
    const invalid=guest(); invalid.days[0].exercises[0][field]=null;
    await expect(MigrationService.runMigration({localData:invalid,userId:'A',expectedVersion:'v0',isCurrent:()=>true})).rejects.toThrow();
  }
  const invalid=guest(); invalid.measurements=[{id:'m',name:'Weight',createdAt:'2026-10-16',entries:false}];
  await expect(MigrationService.runMigration({localData:invalid,userId:'A',expectedVersion:'v0',isCurrent:()=>true})).rejects.toThrow();
  expect(mock.rpc).not.toHaveBeenCalled();
});

test('focus and reconnect refresh remote changes without clearing loaded data',async()=>{
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  mock.cloud.days[0].name='Remote update'; mock.cloud._version='v2';
  await act(async()=>{ window.dispatchEvent(new Event('focus')); });
  await settle(()=>latest.data.data.days[0].name==='Remote update');
  mock.cloud.days[0].name='Reconnected'; mock.cloud._version='v3';
  await act(async()=>window.dispatchEvent(new Event('online')));
  await settle(()=>latest.data.data.days[0].name==='Reconnected');
});
test('visible devices poll for remote changes every thirty seconds',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  mock.cloud.days[0].name='Polled update';mock.cloud._version='v2';
  await act(async()=>{ await vi.advanceTimersByTimeAsync(30000); });
  await settle(()=>latest.data.data.days[0].name==='Polled update');
});
test('a read begun before a write cannot overwrite its newer refetch',async()=>{
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  const old=structuredClone(mock.cloud); const pending=deferred(); const base=mock.rpc.getMockImplementation(); let delay=true;
  mock.rpc.mockImplementation((name,args)=>{
    if(name==='get_gymlog_snapshot'&&delay){delay=false;return pending.promise;}
    return base(name,args);
  });
  let read; await act(async()=>{read=latest.data.retryCloud();});
  await settle(()=>latest.data.refreshing);
  await act(async()=>{expect(await latest.data.createDay('New day')).toBe(true);});
  expect(latest.data.data.days).toHaveLength(2);
  await act(async()=>{pending.resolve({data:old,error:null});await read;});
  expect(latest.data.data.days).toHaveLength(2);
});
test('overlapping refresh events share one request and a failed refresh keeps data visible',async()=>{
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  const pending=deferred(); const base=mock.rpc.getMockImplementation(); const before=mock.rpc.mock.calls.length;
  mock.rpc.mockImplementation((name,args)=>name==='get_gymlog_snapshot'?pending.promise:base(name,args));
  let a,b; await act(async()=>{a=latest.data.retryCloud();b=latest.data.retryCloud();});
  await settle(()=>latest.data.refreshing);
  expect(mock.rpc.mock.calls.slice(before).filter(([n])=>n==='get_gymlog_snapshot')).toHaveLength(1);
  await act(async()=>{pending.reject(new Error('offline'));await Promise.all([a,b]);});
  expect(latest.data.data.days[0].name).toBe('Push'); expect(latest.data.cloudStatus).toBe('stale');
});
test('a lost ordinary-create response blocks new writes and replays the original ID after reload',async()=>{
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  const base=mock.rpc.getMockImplementation();let lost=true;
  mock.rpc.mockImplementation(async(name,args)=>{
    const result=await base(name,args);
    if(name==='mutate_gymlog_data'&&lost){lost=false;throw new Error('response lost');}
    return result;
  });
  await act(async()=>{expect(await latest.data.createDay('Exactly once')).toBe(false);});
  const pending=latest.data.pendingWrite; expect(pending.action).toBe('create_day');
  await act(async()=>{expect(await latest.data.createDay('Another attempt')).toBe(false);});
  expect(mock.cloud.days).toHaveLength(1);
  await act(async()=>renderer.unmount()); renderer=null;
  await mount(); await settle(()=>latest.data.pendingWrite?.id===pending.id && latest.data.data);
  await act(async()=>{expect(await latest.data.retryPendingWrite()).toBe(true);});
  expect(latest.data.pendingWrite).toBe(null); expect(mock.cloud.days).toHaveLength(1);
  const calls=mock.rpc.mock.calls.filter(([n])=>n==='mutate_gymlog_data');
  expect(calls).toHaveLength(2);expect(calls[1][1].operation_id).toBe(calls[0][1].operation_id);
});
test('acknowledged writes with failed reads recover using refresh without another mutation',async()=>{
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  const base=mock.rpc.getMockImplementation();let failReads=false;
  mock.rpc.mockImplementation(async(name,args)=>{
    if(name==='get_gymlog_snapshot'&&failReads) throw new Error('read offline');
    const result=await base(name,args); if(name==='mutate_gymlog_data') failReads=true; return result;
  });
  await act(async()=>{expect(await latest.data.createDay('Saved')).toBe(true);});
  expect(latest.data.pendingWrite.phase).toBe('acknowledged'); expect(latest.data.cloudStatus).toBe('stale');
  failReads=false;
  await act(async()=>{await latest.data.retryCloud();});
  expect(latest.data.pendingWrite).toBe(null);expect(latest.data.data.days).toHaveLength(1);
  expect(mock.rpc.mock.calls.filter(([n])=>n==='mutate_gymlog_data')).toHaveLength(1);
});
test('storage quota blocks ordinary writes before the network and keeps displayed data intact',async()=>{
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  localStorage.setItem=()=>{throw new Error('quota exceeded');};
  await act(async()=>{expect(await latest.data.createDay('Not submitted')).toBe(false);});
  expect(mock.rpc.mock.calls.filter(([n])=>n==='mutate_gymlog_data')).toHaveLength(0);
  expect(latest.data.data.days).toHaveLength(0); expect(latest.data.cloudError).toMatch(/quota/);
});
test('an edit retains its original version even after a background refresh',async()=>{
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  const editVersion=latest.data.data._version;
  mock.cloud.days[0].name='Remote';mock.cloud._version='v2';
  await act(async()=>{await latest.data.retryCloud();});
  await act(async()=>{expect(await latest.data.renameDay('d','Old draft',editVersion)).toBe(false);});
  expect(mock.cloud.days[0].name).toBe('Remote'); expect(latest.data.pendingWrite).toBe(null);
  expect(latest.data.cloudError).toMatch(/Cloud data changed/);
});
test('recovery records and refreshes cannot cross accounts',async()=>{
  await mount(); await settle(()=>latest.data.data && latest.data.cloudStatus==='ready');
  const base=mock.rpc.getMockImplementation();mock.rpc.mockImplementation((name,args)=>name==='mutate_gymlog_data'?Promise.reject(new Error('offline')):base(name,args));
  await act(async()=>{await latest.data.createDay('Pending A');});expect(latest.data.pendingWrite.userId).toBe('A');
  await act(async()=>emit({id:'B'}));await settle(()=>latest.auth.user.id==='B'&&latest.data.cloudStatus==='ready');
  expect(latest.data.pendingWrite).toBe(null);
  expect([...Array(localStorage.length)].some((_,i)=>localStorage.key(i).startsWith('gymlog_pending_write_A_'))).toBe(true);
});

test('failed create forms retain drafts; recovery closes the matching form without another create',async()=>{
  await mount(<MemoryRouter><Dashboard/></MemoryRouter>); await settle(()=>latest.data.cloudStatus==='ready');
  const button=text=>renderer.root.findAllByType('button').find(n=>n.children.includes(text));
  await act(async()=>button('+ New Day').props.onClick());
  await act(async()=>renderer.root.findByType('input').props.onChange({target:{value:'Keep my draft'}}));
  const base=mock.rpc.getMockImplementation();let lost=true;
  mock.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='mutate_gymlog_data'&&lost){lost=false;throw new Error('lost response');}return result;});
  await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
  await settle(()=>latest.data.pendingWrite&&!latest.data.cloudBusy);
  expect(renderer.root.findByType('input').props.value).toBe('Keep my draft');
  await act(async()=>{await latest.data.retryPendingWrite();});
  expect(renderer.root.findAllByType('form')).toHaveLength(0);expect(mock.cloud.days).toHaveLength(1);
});
test('background refresh preserves an open rename draft and its original version',async()=>{
  mock.cloud={...guest(),_version:'v1',_generation:'1'};
  await mount(<MemoryRouter><Dashboard/></MemoryRouter>);await settle(()=>latest.data.cloudStatus==='ready');
  await act(async()=>renderer.root.findByProps({title:'Edit Day'}).props.onClick({stopPropagation(){}}));
  await act(async()=>renderer.root.findByType('input').props.onChange({target:{value:'My draft'}}));
  mock.cloud.days[0].name='Remote change';mock.cloud._version='v2';
  await act(async()=>{await latest.data.retryCloud();});
  expect(renderer.root.findByType('input').props.value).toBe('My draft');
  const save=renderer.root.findAllByType('button').find(n=>n.children.includes('Save'));
  await act(async()=>{await save.props.onClick();});
  expect(mock.cloud.days[0].name).toBe('Remote change');expect(renderer.root.findByType('input').props.value).toBe('My draft');
});
test('guest storage read failures remain actionable and quota failure never changes memory',async()=>{
  mock.user=null;
  const get=localStorage.getItem;localStorage.getItem=()=>{throw new Error('storage denied');};
  await mount();await settle(()=>latest.data.sourceMode==='guest'&&latest.data.cloudStatus==='error');
  expect(latest.data.cloudError).toMatch(/storage is unavailable/);
  localStorage.getItem=get;
  await act(async()=>{await latest.data.retryCloud();});
  expect(latest.data.data.days).toHaveLength(0);
  localStorage.setItem=()=>{throw new Error('quota');};
  await act(async()=>{expect(await latest.data.createDay('Unsaved')).toBe(false);});
  expect(latest.data.data.days).toHaveLength(0);expect(latest.data.cloudError).toMatch(/could not save/);
});
test('migration acknowledgement storage failures surface instead of unlocking cloud',async()=>{
  localStorage.setItem=()=>{throw new Error('storage quota');};
  await mount();await settle(()=>latest.migration.migrationState==='failed'&&!latest.migration.loading);
  expect(latest.migration.error).toMatch(/storage quota/);expect(latest.data.sourceMode).toBe('migration');
});
test('focus events during a write cannot cancel its recovery identity',async()=>{
  await mount();await settle(()=>latest.data.cloudStatus==='ready');
  const base=mock.rpc.getMockImplementation();const pending=deferred();
  mock.rpc.mockImplementation((name,args)=>name==='mutate_gymlog_data'?pending.promise.then(()=>base(name,args)):base(name,args));
  let write;await act(async()=>{write=latest.data.createDay('In progress');});await settle(()=>latest.data.pendingWrite);
  const id=latest.data.pendingWrite.id;
  await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));});
  expect(latest.data.pendingWrite.id).toBe(id);expect(latest.data.cloudBusy).toBe(true);
  await act(async()=>{pending.resolve();expect(await write).toBe(true);});
  expect(latest.data.pendingWrite).toBe(null);expect(mock.cloud.days).toHaveLength(1);
});

test('hidden and offline pages skip periodic refresh; becoming visible refreshes',async()=>{
  const documentTarget=new EventTarget();documentTarget.visibilityState='visible';vi.stubGlobal('document',documentTarget);
  vi.stubGlobal('navigator',{onLine:true});vi.useFakeTimers({toFake:['setInterval','clearInterval']});
  await mount();await settle(()=>latest.data.cloudStatus==='ready');
  const count=()=>mock.rpc.mock.calls.filter(([n])=>n==='get_gymlog_snapshot').length;
  const initial=count();documentTarget.visibilityState='hidden';
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});expect(count()).toBe(initial);
  documentTarget.visibilityState='visible';navigator.onLine=false;
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});expect(count()).toBe(initial);
  navigator.onLine=true;await act(async()=>documentTarget.dispatchEvent(new Event('visibilitychange')));
  await settle(()=>count()>initial);
});
test('unmounting during a cloud write preserves its recovery record for the next session',async()=>{
  await mount();await settle(()=>latest.data.cloudStatus==='ready');
  const base=mock.rpc.getMockImplementation();const pending=deferred();
  mock.rpc.mockImplementation((name,args)=>name==='mutate_gymlog_data'?pending.promise:base(name,args));
  let write;await act(async()=>{write=latest.data.createDay('Pending');});await settle(()=>latest.data.pendingWrite);
  const id=latest.data.pendingWrite.id;
  await act(async()=>renderer.unmount());renderer=null;
  pending.resolve({data:{success:true},error:null});expect(await write).toBe(false);
  expect(localStorage.getItem(`gymlog_pending_write_A_${id}`)).not.toBe(null);
});

test('a stale action immediately after an auth event cannot submit another account intent',async()=>{
  await mount();await settle(()=>latest.data.cloudStatus==='ready');
  const oldAction=latest.data.createDay;
  await act(async()=>{emit({id:'B'});expect(await oldAction('From the old screen')).toBe(false);});
  expect(mock.rpc.mock.calls.filter(([n])=>n==='mutate_gymlog_data')).toHaveLength(0);
  expect([...Array(localStorage.length)].some((_,i)=>localStorage.key(i).startsWith('gymlog_pending_write_B_'))).toBe(false);
});
