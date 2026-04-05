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
  signUp: (email: string, password: string, alias: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createAlias: (alias: string) => Promise<{ error: any }>;
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

  const validateUserExists = async (): Promise<boolean> => {
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) {
        console.warn('User not found in auth or auth check failed');
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error validating user existence:', err);
      return true;
    }
  };

  const recoverProfile = async (userId: string) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      console.log('Recovering profile for user:', userId);
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: authUser.email || '',
          username: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'user',
          full_name: authUser.user_metadata?.full_name || '',
          email_alias: null,
          plan: 'free',
        });

      if (error) {
        console.error('Profile recovery error:', error);
        return;
      }

      console.log('Profile recovered successfully');
      setNeedsAliasSetup(true);
      setUsername(authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'user');
      setFullName(authUser.user_metadata?.full_name || '');
      setEmailAlias('');
    } catch (err) {
      console.error('Unexpected error during profile recovery:', err);
    }
  };

  const fetchProfile = async (userId: string) => {
    console.log('Fetching profile for id:', userId);
    setProfileLoading(true);

    try {
      const userExists = await validateUserExists();
      if (!userExists) {
        console.warn('User was deleted - signing out');
        setUser(null);
        setSession(null);
        setUsername('');
        setEmailAlias('');
        setFullName('');
        setNeedsAliasSetup(false);
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
        console.error('Profile fetch error:', error);
        setProfileLoading(false);
        return;
      }

      if (data) {
        console.log('PROFILE DATA:', data);
        console.log('email_alias value:', data.email_alias, 'type:', typeof data.email_alias);
        console.log('username value:', data.username, 'type:', typeof data.username);

        setUsername(data.username || '');
        setEmailAlias(data.email_alias || '');
        setFullName(data.full_name || '');

        if (!data.email_alias) {
          console.log('User profile exists but has no alias - needs setup');
          setNeedsAliasSetup(true);
        } else {
          setNeedsAliasSetup(false);
        }

        console.log('State set - username:', data.username || '', 'emailAlias:', data.email_alias || '');
      } else {
        console.warn('No profile found for user:', userId, '- attempting to recover');
        await recoverProfile(userId);
      }
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('Session retrieved:', session?.user?.id);

      if (session?.user) {
        try {
          const { data: { user: authUser }, error } = await supabase.auth.getUser();
          if (error || !authUser) {
            console.warn('Session exists but user not found in auth - clearing stale session');
            setSession(null);
            setUser(null);
            setUsername('');
            setEmailAlias('');
            setNeedsAliasSetup(false);
            await supabase.auth.signOut();
            setLoading(false);
            return;
          }

          setSession(session);
          setUser(authUser);
          console.log('Session validated, calling fetchProfile for user:', authUser.id);
          await fetchProfile(authUser.id);
        } catch (err) {
          console.error('Error validating session:', err);
          setSession(null);
          setUser(null);
          setUsername('');
          setEmailAlias('');
          setNeedsAliasSetup(false);
        }
      } else {
        console.log('No session user found');
        setSession(null);
        setUser(null);
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        console.log('Auth state changed, event:', _event, 'user:', session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          console.log('Auth state change - calling fetchProfile for user:', session.user.id);
          await fetchProfile(session.user.id);
        } else {
          console.log('Auth state change - no user, clearing profile data');
          setUsername('');
          setEmailAlias('');
          setFullName('');
          setNeedsAliasSetup(false);
        }

        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, alias: string, fullName: string) => {
    try {
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
        console.error('Signup auth error:', error.message);
        return { error };
      }

      if (!data.user) {
        return { error: new Error('User creation failed') };
      }

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
        console.error('Profile creation error:', profileError);
        return { error: profileError };
      }

      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select('id, email, email_alias, username, full_name, plan, created_at')
        .eq('id', data.user.id)
        .maybeSingle();

      if (fetchError || !profileData) {
        console.error('Profile fetch error:', fetchError);
        return { error: fetchError || new Error('Profile verification failed') };
      }

      setUsername(profileData.username || '');
      setEmailAlias(profileData.email_alias || '');
      setFullName(profileData.full_name || '');
      setNeedsAliasSetup(false);

      return { error: null };
    } catch (err: any) {
      console.error('Unexpected signup error:', err);
      return { error: err };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign-in auth error:', error.message);
        return { error };
      }

      if (data.user) {
        console.log('Sign-in successful for user:', data.user.id);
        await fetchProfile(data.user.id);
      }

      return { error: null };
    } catch (err: any) {
      console.error('Unexpected sign-in error:', err);
      return { error: err };
    }
  };

  const forceRefresh = async () => {
    console.log('Force refresh triggered');
    const { data: { user: authUser }, error } = await supabase.auth.getUser();

    if (error || !authUser) {
      console.log('No valid user on force refresh - signing out');
      setUser(null);
      setSession(null);
      setUsername('');
      setEmailAlias('');
      setFullName('');
      setNeedsAliasSetup(false);
      await supabase.auth.signOut();
      return;
    }

    console.log('Force refresh - fetching profile for user:', authUser.id);
    await fetchProfile(authUser.id);
  };

  const createAlias = async (alias: string) => {
    if (!user) {
      return { error: new Error('No authenticated user') };
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        email_alias: alias,
      })
      .eq('id', user.id);

    if (error) {
      console.error('Alias creation error:', error);
      return { error };
    }

    const { data: profileData, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, email_alias, username, full_name, plan, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError || !profileData) {
      console.error('Profile fetch error:', fetchError);
      return { error: fetchError || new Error('Failed to verify alias') };
    }

    setEmailAlias(profileData.email_alias || '');
    setFullName(profileData.full_name || '');
    setNeedsAliasSetup(false);

    return { error: null };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    setUsername('');
    setEmailAlias('');
    setFullName('');
    setNeedsAliasSetup(false);
    localStorage.removeItem('isScanning');
    localStorage.removeItem('scanningSource');
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
    if (!user || !session) {
      return { error: new Error('No authenticated user') };
    }

    try {
      console.log('Starting account deletion for user:', user.id);

      const { data, error: invokeError } = await supabase.functions.invoke(
        'delete-account',
        {
          body: { userId: user.id },
        }
      );

      if (invokeError) {
        console.error('Delete account edge function error:', invokeError);
        console.log('Falling back to profile deletion...');

        const { error: deleteProfileError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', user.id);

        if (deleteProfileError) {
          console.error('Profile deletion error:', deleteProfileError);
          return { error: new Error('Failed to delete account') };
        }

        console.log('Profile deleted successfully (fallback)');
        await signOut();
        return { error: null };
      }

      console.log('Delete account success:', data);
      await signOut();
      return { error: null };
    } catch (err: any) {
      console.error('Unexpected delete account error:', err);
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
    signUp,
    signIn,
    signOut,
    createAlias,
    forceRefresh,
    deleteAccount,
  };

  // Debug: log whenever context value changes
  useEffect(() => {
    console.log('AuthContext value updated - username:', username, 'emailAlias:', emailAlias);
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
