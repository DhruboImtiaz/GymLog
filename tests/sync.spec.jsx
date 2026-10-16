import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, afterEach, test, expect, vi } from 'vitest';

const mock = vi.hoisted(() => ({ user: { id: 'A' }, initial: null, listeners: new Set(), cloud: { days: [], measurements: [], _version: 'v0' }, rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/lib/supabaseClient.js', () => ({ supabase: {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: mock.user } })),
    getSession: mock.getSession,
    onAuthStateChange: fn => { mock.listeners.add(fn); return { data: { subscription: { unsubscribe: () => mock.listeners.delete(fn) } } }; },
    signOut: async () => { emit(null); return {}; }
  },
  rpc: mock.rpc
} }));
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
async function mount() { await act(async () => { renderer = TestRenderer.create(<AuthProvider><MigrationProvider><DataProvider><Probe /></DataProvider></MigrationProvider></AuthProvider>); }); }
async function settle(predicate) { await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 1)); }); expect(Boolean(predicate())).toBe(true); }, { timeout: 2000 }); }
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const values = new Map();
  vi.stubGlobal('localStorage', { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k), clear: () => values.clear() });
  vi.stubGlobal('window', new EventTarget());
  latest=null; renderer=null; mock.user={ id:'A' }; mock.listeners.clear();
  mock.cloud={days:[],measurements:[],_version:'v0'};
  mock.getSession.mockReset().mockImplementation(async () => ({ data: { session: mock.user ? { user:mock.user } : null } }));
  mock.rpc.mockReset().mockImplementation(async (name,args) => {
    if (name==='get_gymlog_snapshot') return { data:structuredClone(mock.cloud),error:null };
    if (name==='apply_gymlog_migration') { mock.cloud={...structuredClone(args.payload),_version:'v1'}; return {data:{success:true},error:null}; }
    return {data:{success:true},error:null};
  });
});
afterEach(async () => { if(renderer) await act(async () => renderer.unmount()); vi.unstubAllGlobals(); });

test('legacy in_progress becomes an actionable migration, not a permanent lock', async () => {
  localStorage.setItem('gymlog_data',JSON.stringify(guest()));
  localStorage.setItem('gymlog_migration_status_A','in_progress');
  await mount(); await settle(() => latest.migration.conflictType==='LocalOnly' && !latest.migration.loading);
  expect(latest.data.sourceMode).toBe('migration');
});
test('guest edits after logout are evaluated despite an earlier completed status', async () => {
  const original=guest(); localStorage.setItem('gymlog_data',JSON.stringify(original));
  await MigrationService.acknowledgeGuest('A',original,()=>true);
  mock.cloud={...original,_version:'v1'};
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
  await expect(SupabaseService.saveSession('e','2026-10-16',guest().days[0].exercises[0].sets,'A')).rejects.toThrow('account changed');
  expect(mock.rpc).not.toHaveBeenCalled();
});
test('session retries from identical snapshots use the same ID', async () => {
  const sets=guest().days[0].exercises[0].sets;
  await SupabaseService.saveSession('e','2026-10-16',sets,'A');
  await SupabaseService.saveSession('e','2026-10-16',sets,'A');
  expect(mock.rpc.mock.calls[0][1].operation_id).toBe(mock.rpc.mock.calls[1][1].operation_id);
  expect(mock.rpc.mock.calls[0][1].sets[0].id).toBe('s');
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
  mock.cloud={...guest(),_version:'v1'};
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
  mock.cloud={...guest(),_version:'v1'};
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
