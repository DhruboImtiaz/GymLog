// js/auth.js — Supabase Authentication methods
import { supabase } from './supabase.js';
import { clearCache, clearAllDrafts } from './cache.js';
import { toast, setBtnLoading } from './helpers.js';
import { fetchAllData } from './db.js';

let currentUser = null;

export function getUser() {
  return currentUser;
}

/** Initial auth check on app load */
export async function initAuth(onAuthenticated, onUnauthenticated) {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    
    if (data.session) {
      currentUser = data.session.user;
      await onAuthenticated();
    } else {
      onUnauthenticated();
    }
  } catch (err) {
    console.error('Auth init error:', err);
    toast('Error checking login status');
    onUnauthenticated();
  }
}

/** Login */
export async function signIn(email, password, btnElement, onSuccess) {
  setBtnLoading(btnElement, true);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    await onSuccess();
  } catch (err) {
    toast(err.message || 'Login failed');
  } finally {
    setBtnLoading(btnElement, false);
  }
}

/** Register */
export async function signUp(email, password, fullName, btnElement, onSuccess) {
  setBtnLoading(btnElement, true);
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (error) throw error;

    // Sometimes signup doesn't immediately log in if email confirmation is required by Supabase settings.
    if (data.session) {
      currentUser = data.user;
      await onSuccess();
    } else {
      toast('Registration successful! Please check your email to confirm (if required).');
      // If no session, we likely need them to confirm email or just log in manually.
    }
  } catch (err) {
    toast(err.message || 'Registration failed');
  } finally {
    setBtnLoading(btnElement, false);
  }
}

/** Logout */
export async function signOut(onSuccess) {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (err) {
    console.error('Signout error:', err);
  } finally {
    currentUser = null;
    clearCache();
    clearAllDrafts();
    onSuccess();
  }
}

/** Listen for auth changes (optional, but good for multi-tab sync) */
export function onAuthStateChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      currentUser = session.user;
    } else {
      currentUser = null;
    }
    callback(event, session);
  });
}
