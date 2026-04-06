import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  username: string;
  emailAlias: string;
  fullName: string;
  needsAliasSetup: boolean;
  needsProfileRecovery: boolean;
  signUp: (email: string, password: string, alias: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createAlias: (alias: string) => Promise<{ error: any }>;
  recoverProfile: (username: string, fullName: string, alias: string) => Promise<{ error: any }>;
  forceRefresh: () => Promise<void>;
  deleteAccount: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [emailAlias, setEmailAlias] = useState('');
  const [fullName, setFullName] = useState('');
  const [needsAliasSetup, setNeedsAliasSetup] = useState(false);
  const [needsProfileRecovery, setNeedsProfileRecovery] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const validateUserExists = async (): Promise<boolean> => {
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) {
        console.warn('[validateUserExists] User not found in auth or auth check failed');
        return false;
      }
      return true;
    } catch (err) {
      console.error('[validateUserExists] Error validating user existence:', err);
      return true;
    }
  };

  const fetchProfile = async (userId: string) => {
    console.log('[fetchProfile] Fetching profile for id:', userId);

    if (isSigningUp) {
      console.log('[fetchProfile] Skipping fetchProfile during signup - will be handled by signUp');
      return;
    }

    setProfileLoading(true);

    try {
      const userExists = await validateUserExists();
      if (!userExists) {
        console.warn('[fetchProfile] User was deleted - signing out');
        setUser(null);
        setSession(null);
        setUsername('');
        setEmailAlias('');
        setFullName('');
        setNeedsAliasSetup(false);
        setNeedsProfileRecovery(false);
        await supabase.auth.signOut();
        setProfileLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, email_alias, username, full_name, plan, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[fetchProfile] Profile fetch error:', error);
        setProfileLoading(false);
        return;
      }

      if (data) {
        console.log('[fetchProfile] PROFILE DATA:', data);
        console.log('[fetchProfile] email_alias value:', data.email_alias, 'type:', typeof data.email_alias);
        console.log('[fetchProfile] username value:', data.username, 'type:', typeof data.username);

        setUsername(data.username || '');
        setEmailAlias(data.email_alias || '');
        setFullName(data.full_name || '');
        setNeedsProfileRecovery(false);

        if (!data.email_alias) {
          console.log('[fetchProfile] User profile exists but has no alias - needs setup');
          setNeedsAliasSetup(true);
        } else {
          setNeedsAliasSetup(false);
        }

        console.log('[fetchProfile] State set - username:', data.username || '', 'emailAlias:', data.email_alias || '');
      } else {
        console.error('[fetchProfile] No profile found for authenticated user:', userId);
        setUsername('');
        setEmailAlias('');
        setFullName('');
        setNeedsAliasSetup(false);
        setNeedsProfileRecovery(false);
      }
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('[Auth] Session retrieved:', session?.user?.id);

      if (session?.user) {
        try {
          const { data: { user: authUser }, error } = await supabase.auth.getUser();
          if (error || !authUser) {
            console.warn('[Auth] Session exists but user not found in auth - clearing stale session');
            setSession(null);
            setUser(null);
            setUsername('');
            setEmailAlias('');
            setNeedsAliasSetup(false);
            setNeedsProfileRecovery(false);
            await supabase.auth.signOut();
            setLoading(false);
            return;
          }

          setSession(session);
          setUser(authUser);
          console.log('[Auth] Session validated, calling fetchProfile for user:', authUser.id);
          await fetchProfile(authUser.id);
        } catch (err) {
          console.error('[Auth] Error validating session:', err);
          setSession(null);
          setUser(null);
          setUsername('');
          setEmailAlias('');
          setNeedsAliasSetup(false);
          setNeedsProfileRecovery(false);
        }
      } else {
        console.log('[Auth] No session user found');
        setSession(null);
        setUser(null);
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        console.log('[onAuthStateChange] Auth state changed, event:', _event, 'user:', session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          console.log('[onAuthStateChange] Auth state change - calling fetchProfile for user:', session.user.id);
          await fetchProfile(session.user.id);
        } else {
          console.log('[onAuthStateChange] Auth state change - no user, clearing profile data');
          setUsername('');
          setEmailAlias('');
          setFullName('');
          setNeedsAliasSetup(false);
          setNeedsProfileRecovery(false);
        }

        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, alias: string, fullName: string) => {
    try {
      console.log('[signUp] Starting new account creation for email:', email);
      setIsSigningUp(true);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        console.error('[signUp] Auth signup error:', error.message);
        return { error };
      }

      if (!data.user) {
        console.error('[signUp] Auth signup returned no user');
        return { error: new Error('User creation failed') };
      }

      console.log('[signUp] Auth user created:', data.user.id);

      const displayName = fullName || data.user.email?.split('@')[0] || 'user';
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          email: data.user.email,
          username: displayName,
          email_alias: alias,
          full_name: displayName,
          plan: 'free',
        });

      if (profileError) {
        console.error('[signUp] Profile creation error:', profileError);
        console.log('[signUp] Cleaning up orphaned auth user');
        await supabase.auth.admin?.deleteUser(data.user.id).catch(() => {});
        return { error: new Error('Failed to create account profile') };
      }

      console.log('[signUp] Profile created successfully');

      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select('id, email, email_alias, username, full_name, plan, created_at')
        .eq('id', data.user.id)
        .maybeSingle();

      if (fetchError || !profileData) {
        console.error('[signUp] Profile verification error:', fetchError);
        return { error: new Error('Failed to verify new account') };
      }

      setUsername(profileData.username || '');
      setEmailAlias(profileData.email_alias || '');
      setFullName(profileData.full_name || '');
      setNeedsProfileRecovery(false);
      setNeedsAliasSetup(!profileData.email_alias);

      console.log('[signUp] Account created successfully');
      setIsSigningUp(false);
      return { error: null };
    } catch (err: any) {
      console.error('[signUp] Unexpected signup error:', err);
      setIsSigningUp(false);
      return { error: err };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log('[signIn] Attempting sign-in for email:', email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('[signIn] Auth error:', error.message);
        return { error };
      }

      if (!data.user) {
        console.error('[signIn] Auth returned no user');
        return { error: new Error('Sign-in failed') };
      }

      console.log('[signIn] Auth successful for user:', data.user.id);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, email_alias, username, full_name, plan, created_at')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[signIn] Profile fetch error:', profileError);
        await supabase.auth.signOut();
        return { error: new Error('Failed to load profile') };
      }

      if (!profileData) {
        console.error('[signIn] No profile found for authenticated user - signing out');
        setNeedsProfileRecovery(false);
        setNeedsAliasSetup(false);
        await supabase.auth.signOut();
        return { error: new Error('Account profile is missing. Please contact support or recreate your account.') };
      }

      setUsername(profileData.username || '');
      setEmailAlias(profileData.email_alias || '');
      setFullName(profileData.full_name || '');
      setNeedsProfileRecovery(false);

      if (!profileData.email_alias) {
        console.log('[signIn] Profile exists but missing alias - needs setup');
        setNeedsAliasSetup(true);
      } else {
        setNeedsAliasSetup(false);
      }

      return { error: null };
    } catch (err: any) {
      console.error('[signIn] Unexpected error:', err);
      return { error: err };
    }
  };

  const forceRefresh = async () => {
    console.log('[forceRefresh] Force refresh triggered');
    const { data: { user: authUser }, error } = await supabase.auth.getUser();

    if (error || !authUser) {
      console.log('[forceRefresh] No valid user on force refresh - signing out');
      setUser(null);
      setSession(null);
      setUsername('');
      setEmailAlias('');
      setFullName('');
      setNeedsAliasSetup(false);
      setNeedsProfileRecovery(false);
      await supabase.auth.signOut();
      return;
    }

    console.log('[forceRefresh] Force refresh - fetching profile for user:', authUser.id);
    await fetchProfile(authUser.id);
  };

  const recoverProfile = async (username: string, fullName: string, alias: string) => {
    if (!user) {
      return { error: new Error('No authenticated user') };
    }

    try {
      console.log('[recoverProfile] Creating profile for authenticated user:', user.id);

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email || '',
          username: username || 'user',
          full_name: fullName || '',
          email_alias: alias || null,
          plan: 'free',
        });

      if (insertError) {
        console.error('[recoverProfile] Profile insert error:', insertError);
        return { error: new Error('Failed to recover profile') };
      }

      console.log('[recoverProfile] Profile created');

      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select('id, email, email_alias, username, full_name, plan, created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError || !profileData) {
        console.error('[recoverProfile] Profile verification error:', fetchError);
        return { error: new Error('Failed to verify recovered profile') };
      }

      setUsername(profileData.username || '');
      setEmailAlias(profileData.email_alias || '');
      setFullName(profileData.full_name || '');
      setNeedsProfileRecovery(false);

      if (!profileData.email_alias) {
        setNeedsAliasSetup(true);
      } else {
        setNeedsAliasSetup(false);
      }

      console.log('[recoverProfile] Profile recovered successfully');
      return { error: null };
    } catch (err: any) {
      console.error('[recoverProfile] Unexpected error:', err);
      return { error: err };
    }
  };

  const createAlias = async (alias: string) => {
    if (!user) {
      return { error: new Error('No authenticated user') };
    }

    console.log('[createAlias] Setting alias for authenticated user:', user.id);

    const { error } = await supabase
      .from('profiles')
      .update({
        email_alias: alias,
      })
      .eq('id', user.id);

    if (error) {
      console.error('[createAlias] Alias update error:', error);
      return { error };
    }

    const { data: profileData, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, email_alias, username, full_name, plan, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError || !profileData) {
      console.error('[createAlias] Profile fetch error:', fetchError);
      return { error: fetchError || new Error('Failed to verify alias') };
    }

    setEmailAlias(profileData.email_alias || '');
    setFullName(profileData.full_name || '');
    setNeedsAliasSetup(false);

    console.log('[createAlias] Alias set successfully');
    return { error: null };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    setUsername('');
    setEmailAlias('');
    setFullName('');
    setNeedsAliasSetup(false);
    setNeedsProfileRecovery(false);
    localStorage.removeItem('isScanning');
    localStorage.removeItem('scanningSource');
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
    if (!user || !session) {
      return { error: new Error('No authenticated user') };
    }

    try {
      console.log('[deleteAccount] Starting account deletion for user:', user.id);

      const { data, error: invokeError } = await supabase.functions.invoke(
        'delete-account',
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            userId: user.id,
            accessToken: session.access_token,
          },
        }
      );

      if (invokeError) {
        console.error('[deleteAccount] Delete account edge function error:', invokeError);
        let errorMessage = 'Failed to delete account';
        const errorResponse = (invokeError as any)?.context;

        if (errorResponse && typeof errorResponse.json === 'function') {
          try {
            const errorBody = await errorResponse.json();
            errorMessage = errorBody?.details || errorBody?.error || errorMessage;
          } catch (parseError) {
            console.error('[deleteAccount] Failed to parse edge function error response:', parseError);
          }
        } else if (invokeError instanceof Error && invokeError.message) {
          errorMessage = invokeError.message;
        }

        return { error: new Error(errorMessage) };
      }

      if (!data?.success) {
        console.error('[deleteAccount] Delete account returned unsuccessful response:', data);
        return {
          error: new Error(data?.details || data?.error || 'Failed to delete account'),
        };
      }

      console.log('[deleteAccount] Delete account success:', data);
      await signOut();
      return { error: null };
    } catch (err: any) {
      console.error('[deleteAccount] Unexpected delete account error:', err);
      const errorMessage = err?.message || 'Network error - please check your connection and try again';
      return { error: new Error(errorMessage) };
    }
  };

  const value = {
    user,
    session,
    loading,
    profileLoading,
    username,
    emailAlias,
    fullName,
    needsAliasSetup,
    needsProfileRecovery,
    signUp,
    signIn,
    signOut,
    createAlias,
    recoverProfile,
    forceRefresh,
    deleteAccount,
  };

  // Debug: log whenever context value changes
  useEffect(() => {
    console.log('[AuthContext] Value updated - username:', username, 'emailAlias:', emailAlias);
  }, [username, emailAlias]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
