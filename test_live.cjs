const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length > 0) {
    env[key.trim()] = rest.join('=').trim();
  }
});

const url = env['VITE_SUPABASE_URL'];
const key = env['VITE_SUPABASE_PUBLISHABLE_KEY'];
const emailA = env['SUPABASE_TEST_USER_A_EMAIL'];
const passA = env['SUPABASE_TEST_USER_A_PASSWORD'];
const emailB = env['SUPABASE_TEST_USER_B_EMAIL'];
const passB = env['SUPABASE_TEST_USER_B_PASSWORD'];

const supabase = createClient(url, key);
const supabaseB = createClient(url, key);
const supabaseAnon = createClient(url, key); // No session will be created

async function run() {
  console.log('--- STARTING LIVE TESTS ---');

  // 1. Authenticate test users
  console.log('Authenticating User A...');
  const { data: dataA, error: errA } = await supabase.auth.signInWithPassword({ email: emailA, password: passA });
  if (errA || !dataA.session) {
    console.error('Failed to sign in User A:', errA || 'No session');
    return;
  }
  
  console.log('Authenticating User B...');
  const { data: dataB, error: errB } = await supabaseB.auth.signInWithPassword({ email: emailB, password: passB });
  if (errB || !dataB.session) {
    console.error('Failed to sign in User B:', errB || 'No session');
    return;
  }

  const userA = dataA.user;
  const userB = dataB.user;

  let defectFound = false;

  const assertFail = (label, error) => {
    if (!error) {
      console.error(`DEFECT: ${label} succeeded when it should have failed.`);
      defectFound = true;
    } else {
      console.log(`PASS: ${label} blocked. (Error: ${error.message})`);
    }
  };

  const assertPass = (label, error) => {
    if (error) {
      console.error(`DEFECT: ${label} failed when it should have succeeded. Error: ${error.message}`);
      defectFound = true;
    } else {
      console.log(`PASS: ${label} succeeded.`);
    }
  };

  // 2. User A legitimate operations
  console.log('\n--- User A Legitimate Operations ---');
  const dayId = 'day_' + Date.now();
  const exId = 'ex_' + Date.now();
  const setId = 'set_' + Date.now();
  const histId = 'hist_' + Date.now();
  const measId = 'meas_' + Date.now();
  const entryId = 'entry_' + Date.now();

  let res = await supabase.from('workout_days').insert({ id: dayId, user_id: userA.id, name: 'Leg Day', position: 1 });
  assertPass('Insert workout_days', res.error);

  res = await supabase.from('exercises').insert({ id: exId, day_id: dayId, user_id: userA.id, name: 'Squat', position: 1 });
  assertPass('Insert exercises', res.error);

  res = await supabase.from('active_sets').insert({ id: setId, exercise_id: exId, user_id: userA.id, set_number: 1, reps: 10, weight: 100 });
  assertPass('Insert active_sets', res.error);

  res = await supabase.from('workout_history').insert({ id: histId, exercise_id: exId, user_id: userA.id, log_date: '2026-09-24' });
  assertPass('Insert workout_history', res.error);

  res = await supabase.from('workout_history_sets').insert({ history_id: histId, user_id: userA.id, set_number: 1, reps: 10, weight: 100 }).select('id');
  assertPass('Insert workout_history_sets', res.error);
  const histSetId = res.data?.[0]?.id;

  res = await supabase.from('measurements').insert({ id: measId, user_id: userA.id, name: 'Weight', position: 1 });
  assertPass('Insert measurements', res.error);

  res = await supabase.from('measurement_entries').insert({ id: entryId, measurement_id: measId, user_id: userA.id, log_date: '2026-09-24', value: 80, unit: 'kg' });
  assertPass('Insert measurement_entries', res.error);

  res = await supabase.from('workout_days').select('*');
  if (res.data?.length === 1) console.log('PASS: Select workout_days retrieved data.');
  else { console.error('DEFECT: Select workout_days failed to retrieve data.'); defectFound = true; }

  res = await supabase.from('workout_days').update({ name: 'Updated Leg Day' }).eq('id', dayId);
  assertPass('Update workout_days', res.error);

  // 3. Cross-User Security Tests (User B)
  console.log('\n--- Cross-User Security Tests (User B) ---');
  
  res = await supabaseB.from('workout_days').select('*');
  if (res.data?.length === 0) console.log('PASS: User B select User A data blocked (empty array).');
  else { console.error('DEFECT: User B could select User A data.'); defectFound = true; }

  res = await supabaseB.from('workout_days').update({ name: 'Hacked' }).eq('id', dayId);
  let check = await supabase.from('workout_days').select('name').eq('id', dayId).single();
  if (check.data?.name !== 'Hacked') console.log('PASS: User B update User A data blocked (RLS ignored update).');
  else { console.error(`DEFECT: User B updated User A data. name was ${check.data?.name}`); defectFound = true; }

  await supabaseB.from('workout_days').delete().eq('id', dayId);
  check = await supabase.from('workout_days').select('id').eq('id', dayId);
  if (check.data?.length === 1) console.log('PASS: User B delete User A data blocked.');
  else { console.error('DEFECT: User B deleted User A data.'); defectFound = true; }

  res = await supabaseB.from('exercises').insert({ id: 'hacked_ex', day_id: dayId, user_id: userB.id, name: 'Hacked Ex', position: 1 });
  assertFail('User B insert child under User A parent (day_id)', res.error);

  res = await supabaseB.from('active_sets').insert({ id: 'hacked_set', exercise_id: exId, user_id: userB.id, set_number: 1, reps: 1, weight: 1 });
  assertFail('User B insert child under User A parent (exercise_id)', res.error);
  
  res = await supabaseB.from('workout_history').insert({ id: 'hacked_hist', exercise_id: exId, user_id: userB.id, log_date: '2026-09-24' });
  assertFail('User B insert history under User A parent (exercise_id)', res.error);
  
  res = await supabaseB.from('workout_history_sets').insert({ history_id: histId, user_id: userB.id, set_number: 1, reps: 1, weight: 1 });
  assertFail('User B insert history set under User A parent (history_id)', res.error);

  res = await supabaseB.from('measurement_entries').insert({ id: 'hacked_meas_ent', measurement_id: measId, user_id: userB.id, log_date: '2026-09-24', value: 80, unit: 'kg' });
  assertFail('User B insert measurement entry under User A parent (measurement_id)', res.error);

  res = await supabaseB.from('workout_days').insert({ id: 'day_b_fake_A', user_id: userA.id, name: 'B Day fake', position: 2 });
  assertFail('User B insert pretending to be User A', res.error);

  // Cross-user Update Tests
  // Attempting to change user_id
  const bDayId = 'day_b_' + Date.now();
  await supabaseB.from('workout_days').insert({ id: bDayId, user_id: userB.id, name: 'B Day', position: 1 });
  res = await supabaseB.from('workout_days').update({ user_id: userA.id }).eq('id', bDayId);
  assertFail('User B update user_id to User A', res.error);

  // Attempting to change child record's parent_id to another user's parent
  const bExId = 'ex_b_' + Date.now();
  await supabaseB.from('exercises').insert({ id: bExId, day_id: bDayId, user_id: userB.id, name: 'B Ex', position: 1 });
  res = await supabaseB.from('exercises').update({ day_id: dayId }).eq('id', bExId);
  assertFail('User B update parent_id to User A parent', res.error);


  // 4. Anonymous Access
  console.log('\n--- Anonymous Access ---');
  res = await supabaseAnon.from('workout_days').select('*');
  if (res.data?.length === 0 || res.error) console.log('PASS: Anon select blocked.');
  else { console.error('DEFECT: Anon could select data.'); defectFound = true; }

  res = await supabaseAnon.from('workout_days').insert({ id: 'anon_day', user_id: userA.id, name: 'Anon', position: 1 });
  assertFail('Anon insert user-owned data', res.error);
  
  res = await supabaseAnon.from('workout_days').update({ name: 'Anon Update' }).eq('id', dayId);
  assertFail('Anon update user-owned data', res.error);
  
  res = await supabaseAnon.from('workout_days').delete().eq('id', dayId);
  assertFail('Anon delete user-owned data', res.error);


  // 5. Constraints Tests (User A)
  console.log('\n--- Constraints Tests (User A) ---');
  res = await supabase.from('active_sets').insert({ id: 'set_neg', exercise_id: exId, user_id: userA.id, set_number: 1, reps: 0, weight: 10 });
  assertFail('Insert reps <= 0', res.error);

  res = await supabase.from('active_sets').insert({ id: 'set_neg2', exercise_id: exId, user_id: userA.id, set_number: 1, reps: 10, weight: -5 });
  assertFail('Insert weight < 0', res.error);
  
  res = await supabase.from('active_sets').insert({ id: 'set_neg3', exercise_id: exId, user_id: userA.id, set_number: 0, reps: 10, weight: 10 });
  assertFail('Insert set_number <= 0', res.error);
  
  res = await supabase.from('workout_days').insert({ id: 'day_neg', user_id: userA.id, name: 'Neg', position: -1 });
  assertFail('Insert position < 0', res.error);
  
  res = await supabase.from('workout_days').insert({ id: 'day_null', user_id: userA.id, position: 2 });
  assertFail('Insert missing required fields', res.error);

  res = await supabase.from('exercises').insert({ id: 'ex_inv', day_id: 'nonexistent', user_id: userA.id, name: 'Inv', position: 1 });
  assertFail('Insert invalid parent combination', res.error);


  // 6. Cascade Tests
  console.log('\n--- Cascade Tests ---');
  // First, verify records exist
  let verifyCheck = await supabase.from('exercises').select('*').eq('id', exId);
  if (verifyCheck.data?.length !== 1) { console.error('DEFECT: Exercise not found before cascade test.'); defectFound = true; }
  
  await supabase.from('workout_days').delete().eq('id', dayId);
  let childCheck = await supabase.from('exercises').select('*').eq('id', exId);
  if (childCheck.data?.length === 0) console.log('PASS: Cascade delete workout_days -> exercises.');
  else { console.error('DEFECT: Cascade delete exercises failed.'); defectFound = true; }

  childCheck = await supabase.from('active_sets').select('*').eq('id', setId);
  if (childCheck.data?.length === 0) console.log('PASS: Cascade delete exercises -> active_sets.');
  else { console.error('DEFECT: Cascade delete active_sets failed.'); defectFound = true; }
  
  childCheck = await supabase.from('workout_history').select('*').eq('id', histId);
  if (childCheck.data?.length === 0) console.log('PASS: Cascade delete exercises -> workout_history.');
  else { console.error('DEFECT: Cascade delete workout_history failed.'); defectFound = true; }
  
  childCheck = await supabase.from('workout_history_sets').select('*').eq('id', histSetId);
  if (childCheck.data?.length === 0) console.log('PASS: Cascade delete workout_history -> history_sets.');
  else { console.error('DEFECT: Cascade delete workout_history_sets failed.'); defectFound = true; }

  await supabase.from('measurements').delete().eq('id', measId);
  childCheck = await supabase.from('measurement_entries').select('*').eq('id', entryId);
  if (childCheck.data?.length === 0) console.log('PASS: Cascade delete measurements -> entries.');
  else { console.error('DEFECT: Cascade delete measurement_entries failed.'); defectFound = true; }

  // 7. Cleanup
  console.log('\n--- Cleanup ---');
  await supabase.from('workout_days').delete().neq('id', 'noop');
  await supabase.from('measurements').delete().neq('id', 'noop');
  await supabaseB.from('workout_days').delete().neq('id', 'noop');
  console.log('PASS: Temporary records removed.');

  if (defectFound) {
    console.error('\n!!! DEFECTS FOUND DURING LIVE TESTS !!!');
    process.exit(1);
  } else {
    console.log('\nALL TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  }
}

run();
