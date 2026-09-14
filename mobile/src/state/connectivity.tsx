import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { healthUrl } from '../lib/apiBase';

export interface Connectivity {
  /** browser reports network */
  online: boolean;
  /** API health probe succeeded recently */
  serverUp: boolean;
  /** app is fully usable against the API */
  live: boolean;
  lastProbeAt: number;
  probe: () => Promise<boolean>;
}

const Ctx = createContext<Connectivity>(null as never);
export const useConnectivity = () => useContext(Ctx);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [serverUp, setServerUp] = useState<boolean>(navigator.onLine);
  const [lastProbeAt, setLastProbeAt] = useState<number>(0);

  const probe = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine) { setServerUp(false); return false; }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${healthUrl()}?t=${Date.now()}`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      const ok = res.ok;
      setServerUp(ok);
      setLastProbeAt(Date.now());
      return ok;
    } catch {
      setServerUp(false);
      setLastProbeAt(Date.now());
      return false;
    }
  }, []);

  useEffect(() => {
    const onOnline = () => { setOnline(true); void probe(); };
    const onOffline = () => { setOnline(false); setServerUp(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(() => { if (navigator.onLine) void probe(); }, 15_000);
    void probe();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, [probe]);

  return (
    <Ctx.Provider value={{ online, serverUp, live: online && serverUp, lastProbeAt, probe }}>
      {children}
    </Ctx.Provider>
  );
}
