import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from './api';

interface AuthState {
  loading: boolean;
  needsSetup: boolean;
  user: api.User | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; needsSetup: boolean; user: api.User | null }>(
    { loading: true, needsSetup: false, user: null });

  const refresh = useCallback(async () => {
    const s = await api.authStatus();
    setState({ loading: false, needsSetup: s.needsSetup, user: s.user });
  }, []);

  useEffect(() => { refresh().catch(() => setState((s) => ({ ...s, loading: false }))); }, [refresh]);

  const signOut = useCallback(async () => { await api.logout(); await refresh(); }, [refresh]);

  return <Ctx.Provider value={{ ...state, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
