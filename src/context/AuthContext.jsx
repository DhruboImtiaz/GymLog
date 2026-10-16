import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const identityRef = useRef({ userId: null, epoch: 0 });
  const [identityEpoch, setIdentityEpoch] = useState(0);

  useEffect(() => {
    let active = true;
    let authEvents = 0;
    const applySession = session => {
      if (!active) return;
      const userId = session?.user?.id || null;
      if (identityRef.current.userId !== userId) {
        identityRef.current = { userId, epoch: identityRef.current.epoch + 1 };
        setIdentityEpoch(identityRef.current.epoch);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEvents++;
      applySession(session);
    });
    const initialEvents = authEvents;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (authEvents === initialEvents) applySession(session);
    }).catch(() => { if (active && authEvents === initialEvents) applySession(null); });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email) => {
    // In a SPA, redirecting to the current origin will hit the React Router
    // This requires configuring the redirect URL in the Supabase Dashboard
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const value = {
    session,
    user,
    identityRef,
    identityEpoch,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
