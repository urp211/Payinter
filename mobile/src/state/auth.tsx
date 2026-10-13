import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Profile, Session } from '../lib/models';
import { idb } from '../lib/idb';
import { apiBase } from '../lib/apiBase';

const KEYS = { session: 'payinter.session', profile: 'payinter.lastProfile', offlineOk: 'payinter.offlineOk' };

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  ready: boolean;
  signIn: (session: Session, profile: Profile) => void;
  setProfile: (p: Profile) => void;
  signOut: (keepSnapshot?: boolean) => Promise<void>;
  /** Enter with last-known data while the API is unreachable */
  continueOffline: () => void;
  offlineSession: boolean;
}

const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEYS.session) ?? 'null'); } catch { return null; }
}
function loadProfile(): Profile | null {
  try { return JSON.parse(localStorage.getItem(KEYS.profile) ?? 'null'); } catch { return null; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [offlineSession, setOfflineSession] = useState(false);

  useEffect(() => {
    const s = loadSession();
    const p = loadProfile();
    if (s && p) { setSession(s); setProfileState(p); }
    setReady(true);
  }, []);

  const signIn = useCallback((s: Session, p: Profile) => {
    setSession(s); setProfileState(p); setOfflineSession(false);
    localStorage.setItem(KEYS.session, JSON.stringify(s));
    localStorage.setItem(KEYS.profile, JSON.stringify(p));
  }, []);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    localStorage.setItem(KEYS.profile, JSON.stringify(p));
  }, []);

  const signOut = useCallback(async (keepSnapshot = false) => {
    const s = loadSession();
    if (s) {
      void fetch(`${apiBase()}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.accessToken}`, 'x-app-platform': 'web' },
        body: JSON.stringify({ refreshToken: s.refreshToken })
      }).catch(() => undefined);
    }
    localStorage.removeItem(KEYS.session);
    if (!keepSnapshot) {
      localStorage.removeItem(KEYS.profile);
      await idb.clear('cache');
    }
    await idb.clear('outbox');
    setSession(null); setProfileState(null); setOfflineSession(false);
  }, []);

  const continueOffline = useCallback(() => {
    const s = loadSession(); const p = loadProfile();
    if (s && p) { setSession(s); setProfileState(p); setOfflineSession(true); }
  }, []);

  const value = useMemo<AuthState>(() => ({
    session, profile, ready, signIn, setProfile, signOut, continueOffline, offlineSession
  }), [session, profile, ready, signIn, setProfile, signOut, continueOffline, offlineSession]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
