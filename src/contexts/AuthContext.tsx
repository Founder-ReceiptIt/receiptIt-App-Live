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
  signUp: (email: string, password: string, alias: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [emailAlias, setEmailAlias] = useState('');

  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      console.log('Fetching profile for id:', userId);
      setProfileLoading(true);

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

        console.log('State set - username:', data.username || '', 'emailAlias:', data.email_alias || '');
      } else {
        console.warn('No profile found for user:', userId);
      }

      setProfileLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Session retrieved:', session?.user?.id);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        console.log('Calling fetchProfile for user:', session.user.id);
        fetchProfile(session.user.id);
      } else {
        console.log('No session user found');
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
        }

        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, alias: string, fullName: string) => {
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
      return { error };
    }

    if (!data.user) {
      return { error: new Error('User creation failed') };
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: data.user.id,
        email: data.user.email,
        username: fullName,
        email_alias: alias,
        full_name: fullName,
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

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    profileLoading,
    username,
    emailAlias,
    signUp,
    signIn,
    signOut,
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
