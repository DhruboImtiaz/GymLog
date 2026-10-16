import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

export const A = '11111111-1111-4111-8111-111111111111';
export const B = '22222222-2222-4222-8222-222222222222';
export const guest = () => ({ days: [{ id: 'd', name: 'Push', createdAt: '2026-10-16', exercises: [{ id: 'e', name: 'Bench', sets: [{ id: 's', num: 1, reps: 5, weight: 50 }], history: [] }] }], measurements: [{ id: 'm', name: 'Weight', createdAt: '2026-10-16', entries: [{ id: 'en', date: '2026-10-16', value: 70, unit: 'kg' }] }] });
export const migrations = ['20260924_initial_gymlog_schema.sql','20260924_correct_gymlog_privileges.sql','20260925_add_history_sets_unique_constraint.sql','20260925_replace_gymlog_data_rpc.sql','20260925223000_scope_entity_ids.sql','20260925224500_scope_history_sets.sql','20261016091534_p1_atomic_sync.sql','20261016101518_p2_write_recovery.sql','20261016125242_explicit_sync_conflicts.sql'];

export async function nativePostgres() {
  const dir = await mkdtemp(join(tmpdir(), 'gymlog-pg-'));
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = new EmbeddedPostgres({ databaseDir: join(dir, 'data'), port, persistent: false,
    postgresFlags: ['-h', '127.0.0.1', '-k', dir], onLog: () => {}, onError: () => {} });
  const clients = [];
  try {
    await server.initialise();
    await server.start();
    const connect = async (userId) => {
      const client = server.getPgClient();
      await client.connect();
      clients.push(client);
      await client.query("SET statement_timeout='10s'; SET lock_timeout='5s';");
      if (userId) {
        await client.query('SET ROLE authenticated');
        await client.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
      }
      client.exec = sql => client.query(sql);
      return client;
    };
    const db = await connect();
    return { db, connect, async close() {
      await Promise.all(clients.map(client => client.end()));
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    } };
  } catch (error) {
    await server.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function initialize(db) {
  await db.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    INSERT INTO auth.users VALUES ('${A}'),('${B}');`);
  for (const name of migrations) await db.query(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
}
export async function snapshot(client, userId = A) {
  return (await client.query('select public.get_gymlog_snapshot($1) as doc', [userId])).rows[0].doc;
}
export async function seed(client, payload = guest(), userId = A) {
  return client.query('select public.apply_gymlog_migration($1,$2,$3,$4::jsonb,true)', [userId, crypto.randomUUID(), (await snapshot(client,userId))._version, JSON.stringify(payload)]);
}
