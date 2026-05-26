// js/db.js — All Supabase Data operations
import { supabase } from './supabase.js';
import { getCache, updateCache, setCache } from './cache.js';
import { getUser } from './auth.js';

// ── Fetch All Data (On Login) ────────────────────────────────

export async function fetchAllData() {
  const user = getUser();
  if (!user) throw new Error("Not logged in");

  // Fetch all tables in parallel
  const [daysRes, exRes, sessRes, setsRes, measRes, entriesRes] = await Promise.all([
    supabase.from('workout_days').select('*').order('created_at', { ascending: true }),
    supabase.from('exercises').select('*').order('created_at', { ascending: true }),
    supabase.from('workout_sessions').select('*').order('workout_date', { ascending: false }),
    supabase.from('workout_sets').select('*').order('set_number', { ascending: true }),
    supabase.from('measurements').select('*').order('created_at', { ascending: true }),
    supabase.from('measurement_entries').select('*').order('entry_date', { ascending: false })
  ]);

  if (daysRes.error) throw daysRes.error;

  // Reassemble the nested structure for the UI
  const days = daysRes.data.map(d => ({
    id: d.id,
    name: d.name,
    exercises: exRes.data.filter(e => e.day_id === d.id).map(e => ({
      id: e.id,
      name: e.name,
      history: sessRes.data.filter(s => s.exercise_id === e.id).map(s => ({
        date: s.workout_date,
        sets: setsRes.data.filter(st => st.session_id === s.id).map(st => ({
          num: st.set_number,
          reps: parseFloat(st.reps),
          weight: parseFloat(st.weight)
        }))
      }))
    }))
  }));

  const measurements = measRes.data.map(m => ({
    id: m.id,
    name: m.name,
    entries: entriesRes.data.filter(e => e.measurement_id === m.id).map(e => ({
      id: e.id,
      date: e.entry_date,
      val: parseFloat(e.value),
      unit: e.unit
    }))
  }));

  setCache({ days, measurements });
}

// ── Workout Days ─────────────────────────────────────────────

export async function createDay(name) {
  const { data, error } = await supabase.from('workout_days').insert([{ name, user_id: getUser().id }]).select().single();
  if (error) throw error;
  updateCache(c => c.days.push({ id: data.id, name: data.name, exercises: [] }));
  return data;
}

export async function renameDay(dayId, name) {
  const { error } = await supabase.from('workout_days').update({ name }).eq('id', dayId);
  if (error) throw error;
  updateCache(c => {
    const d = c.days.find(x => x.id === dayId);
    if (d) d.name = name;
  });
}

export async function deleteDay(dayId) {
  const { error } = await supabase.from('workout_days').delete().eq('id', dayId);
  if (error) throw error;
  updateCache(c => {
    c.days = c.days.filter(x => x.id !== dayId);
  });
}

// ── Exercises ────────────────────────────────────────────────

export async function createExercise(dayId, name) {
  const { data, error } = await supabase.from('exercises').insert([{ day_id: dayId, name, user_id: getUser().id }]).select().single();
  if (error) throw error;
  updateCache(c => {
    const d = c.days.find(x => x.id === dayId);
    if (d) d.exercises.push({ id: data.id, name: data.name, history: [] });
  });
  return data;
}

export async function renameExercise(exerciseId, name) {
  const { error } = await supabase.from('exercises').update({ name }).eq('id', exerciseId);
  if (error) throw error;
  updateCache(c => {
    c.days.forEach(d => {
      const e = d.exercises.find(x => x.id === exerciseId);
      if (e) e.name = name;
    });
  });
}

export async function deleteExercise(exerciseId) {
  const { error } = await supabase.from('exercises').delete().eq('id', exerciseId);
  if (error) throw error;
  updateCache(c => {
    c.days.forEach(d => {
      d.exercises = d.exercises.filter(x => x.id !== exerciseId);
    });
  });
}

// ── Sessions & Sets (Saving a workout) ───────────────────────

export async function saveSession(exerciseId, setsArray, dateStr) {
  if (setsArray.length === 0) return;
  const user = getUser();
  
  // 1. Create session
  const { data: sessionData, error: sessionErr } = await supabase.from('workout_sessions').insert([{
    exercise_id: exerciseId,
    user_id: user.id,
    workout_date: dateStr
  }]).select().single();
  if (sessionErr) throw sessionErr;

  // 2. Create sets
  const setsToInsert = setsArray.map((s, i) => ({
    session_id: sessionData.id,
    set_number: i + 1,
    reps: s.reps,
    weight: s.weight
  }));
  const { error: setsErr } = await supabase.from('workout_sets').insert(setsToInsert);
  if (setsErr) throw setsErr;

  // 3. Update cache
  updateCache(c => {
    for (const d of c.days) {
      const e = d.exercises.find(x => x.id === exerciseId);
      if (e) {
        // Find existing session for this date to append to, or create new
        let hist = e.history.find(h => h.date === dateStr);
        if (!hist) {
          hist = { date: dateStr, sets: [] };
          e.history.push(hist);
          e.history.sort((a,b) => new Date(b.date) - new Date(a.date));
        }
        hist.sets.push(...setsArray.map((s, i) => ({ num: hist.sets.length + i + 1, reps: s.reps, weight: s.weight })));
        break;
      }
    }
  });
}

// ── Measurements ─────────────────────────────────────────────

export async function createMeasurement(name) {
  const { data, error } = await supabase.from('measurements').insert([{ name, user_id: getUser().id }]).select().single();
  if (error) throw error;
  updateCache(c => c.measurements.push({ id: data.id, name: data.name, entries: [] }));
  return data;
}

export async function renameMeasurement(measId, name) {
  const { error } = await supabase.from('measurements').update({ name }).eq('id', measId);
  if (error) throw error;
  updateCache(c => {
    const m = c.measurements.find(x => x.id === measId);
    if (m) m.name = name;
  });
}

export async function deleteMeasurement(measId) {
  const { error } = await supabase.from('measurements').delete().eq('id', measId);
  if (error) throw error;
  updateCache(c => {
    c.measurements = c.measurements.filter(x => x.id !== measId);
  });
}

export async function addMeasurementEntry(measId, value, unit, dateStr) {
  const { data, error } = await supabase.from('measurement_entries').insert([{
    measurement_id: measId,
    user_id: getUser().id,
    value: value,
    unit: unit,
    entry_date: dateStr
  }]).select().single();
  if (error) throw error;

  updateCache(c => {
    const m = c.measurements.find(x => x.id === measId);
    if (m) {
      m.entries.push({ id: data.id, date: data.entry_date, val: parseFloat(data.value), unit: data.unit });
      m.entries.sort((a,b) => new Date(b.date) - new Date(a.date));
    }
  });
}

export async function deleteMeasurementEntry(entryId) {
  const { error } = await supabase.from('measurement_entries').delete().eq('id', entryId);
  if (error) throw error;
  updateCache(c => {
    c.measurements.forEach(m => {
      m.entries = m.entries.filter(e => e.id !== entryId);
    });
  });
}
