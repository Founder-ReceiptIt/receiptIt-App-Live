import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

interface NotificationPreferences {
  receiptCaptured: boolean;
  warrantyExpiring: boolean;
  budgetAlerts: boolean;
  securityAlerts: boolean;
}

interface PrivacyPreferences {
  autoDelete: boolean;
  analyticsSharing: boolean;
}

interface ProfileSettings {
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
}

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
  profileSettings: ProfileSettings;
  refreshProfileSettings: () => Promise<void>;
  updateProfileSettings: (nextSettings: Partial<ProfileSettings>) => Promise<{ error: any }>;
  signUp: (email: string, password: string, alias: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createAlias: (alias: string) => Promise<{ error: any }>;
  recoverProfile: (username: string, fullName: string, alias: string | null) => Promise<{ error: any }>;
  forceRefresh: () => Promise<void>;
  deleteAccount: () => Promise<{ error: any }>;
}

const defaultNotificationPreferences: NotificationPreferences = {
  receiptCaptured: true,
  warrantyExpiring: true,
  budgetAlerts: true,
  securityAlerts: true,
};

const defaultPrivacyPreferences: PrivacyPreferences = {
  autoDelete: true,
  analyticsSharing: false,
};

const defaultProfileSettings: ProfileSettings = {
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
};

const normalizeProfileSettings = (profileData: any): ProfileSettings => {
  const rawSettings = profileData?.settings ?? profileData?.preferences ?? profileData?.notification_settings ?? profileData?.privacy_settings ?? {};
  const nestedSettings = typeof rawSettings === 'object' && rawSettings !== null ? rawSettings : {};

  const notificationSource = nestedSettings.notifications ?? nestedSettings.notification_preferences ?? {};
  const privacySource = nestedSettings.privacy ?? nestedSettings.privacy_preferences ?? {};

  const notifications: NotificationPreferences = {
    receiptCaptured: toBoolean(
      notificationSource.receiptCaptured ?? notificationSource.receipt_captured ?? profileData?.receipt_captured ?? nestedSettings.receiptCaptured ?? nestedSettings.receipt_captured,
      defaultNotificationPreferences.receiptCaptured
    ),
    warrantyExpiring: toBoolean(
      notificationSource.warrantyExpiring ?? notificationSource.warranty_expiring ?? profileData?.warranty_expiring ?? nestedSettings.warrantyExpiring ?? nestedSettings.warranty_expiring,
      defaultNotificationPreferences.warrantyExpiring
    ),
    budgetAlerts: toBoolean(
      notificationSource.budgetAlerts ?? notificationSource.budget_alerts ?? profileData?.budget_alerts ?? nestedSettings.budgetAlerts ?? nestedSettings.budget_alerts,
      defaultNotificationPreferences.budgetAlerts
    ),
    securityAlerts: toBoolean(
      notificationSource.securityAlerts ?? notificationSource.security_alerts ?? profileData?.security_alerts ?? nestedSettings.securityAlerts ?? nestedSettings.security_alerts,
      defaultNotificationPreferences.securityAlerts
    ),
  };

  const privacy: PrivacyPreferences = {
    autoDelete: toBoolean(
      privacySource.autoDelete ?? privacySource.auto_delete ?? profileData?.auto_delete ?? nestedSettings.autoDelete ?? nestedSettings.auto_delete,
      defaultPrivacyPreferences.autoDelete
    ),
    analyticsSharing: toBoolean(
      privacySource.analyticsSharing ?? privacySource.analytics_sharing ?? profileData?.analytics_sharing ?? nestedSettings.analyticsSharing ?? nestedSettings.analytics_sharing,
      defaultPrivacyPreferences.analyticsSharing
    ),
  };

  return { notifications, privacy };
};

const getReceiptItAlias = (profileData: any, authEmail?: string | null): string => {
  const storedAlias = typeof profileData?.email_alias === 'string' ? profileData.email_alias.trim() : '';
  if (storedAlias) return storedAlias;

  // Some early accounts stored the alias as the profile/auth email before the
  // dedicated email_alias column was introduced. Only use that fallback for a
  // ReceiptIt address so a customer's private sign-in email is never shown.
  const emailCandidates = [profileData?.email, authEmail];
  return emailCandidates.find((email): email is string => (
    typeof email === 'string' && /@receiptit\.app$/i.test(email.trim())
  ))?.trim() || '';
};

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
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(defaultProfileSettings);
  const [isSigningUp, setIsSigningUp] = useState(false);
  // `settings` is deliberately not requested here: older live profiles do not
  // have that optional column, and selecting a missing column makes Supabase
  // reject the entire profile read (which previously looked like a login loop).
  const profileSelect = 'id, email, full_name, email_alias, username, plan, created_at';

  const profileQueryForUser = (authUserId: string) =>
    supabase
      .from('profiles')
      .select(profileSelect)
      .eq('id', authUserId)
      .maybeSingle();

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForProfile = async (authUserId: string, attempts = 5, delayMs = 250) => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const { data, error } = await profileQueryForUser(authUserId);

      if (data) {
        return { data, error: null };
      }

      if (error) {
        return { data: null, error };
      }

      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }

    return { data: null, error: null };
  };

  const applyProfileState = (profileData: any, fallbackFullName = '', authEmail?: string | null) => {
    const alias = getReceiptItAlias(profileData, authEmail);
    setUsername(profileData?.username || '');
    setEmailAlias(alias);
    setFullName(profileData?.full_name || fallbackFullName || profileData?.username || '');
    setNeedsProfileRecovery(false);
    setNeedsAliasSetup(!alias);
    setProfileSettings(normalizeProfileSettings(profileData));
  };

  const refreshProfileSettings = async () => {
    if (!user) {
      setProfileSettings(defaultProfileSettings);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[AuthContext] Failed to load profile settings:', error.message);
        return;
      }

      setProfileSettings(normalizeProfileSettings(data ?? {}));
    } catch (err) {
      console.warn('[AuthContext] Exception while loading profile settings:', err);
      setProfileSettings(defaultProfileSettings);
    }
  };

  const updateProfileSettings = async (nextSettings: Partial<ProfileSettings>) => {
    if (!user) {
      return { error: new Error('No authenticated user') };
    }

    const mergedSettings: ProfileSettings = {
      notifications: {
        ...profileSettings.notifications,
        ...(nextSettings.notifications ?? {}),
      },
      privacy: {
        ...profileSettings.privacy,
        ...(nextSettings.privacy ?? {}),
      },
    };

    setProfileSettings(mergedSettings);

    try {
      const directPayload: Record<string, boolean> = {
        receipt_captured: mergedSettings.notifications.receiptCaptured,
        warranty_expiring: mergedSettings.notifications.warrantyExpiring,
        budget_alerts: mergedSettings.notifications.budgetAlerts,
        security_alerts: mergedSettings.notifications.securityAlerts,
        auto_delete: mergedSettings.privacy.autoDelete,
        analytics_sharing: mergedSettings.privacy.analyticsSharing,
      };

      const settingsPayload = {
        settings: {
          notifications: mergedSettings.notifications,
          privacy: mergedSettings.privacy,
        },
      };

      const { error: settingsError } = await supabase
        .from('profiles')
        .update(settingsPayload)
        .eq('id', user.id);

      if (!settingsError) {
        return { error: null };
      }

      const { error: directError } = await supabase
        .from('profiles')
        .update(directPayload)
        .eq('id', user.id);

      if (directError) {
        console.warn('[AuthContext] Unable to persist profile settings to Supabase:', directError.message);
      }

      return { error: directError ?? null };
    } catch (err: any) {
      console.warn('[AuthContext] Failed to update profile settings:', err?.message || err);
      return { error: err };
    }
  };

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

  const clearProfileState = () => {
    setUsername('');
    setEmailAlias('');
    setFullName('');
    setNeedsAliasSetup(false);
    setProfileSettings(defaultProfileSettings);
  };

  const fetchProfile = async (userId: string, authEmail?: string | null) => {
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

      const { data, error } = await profileQueryForUser(userId);

      if (error) {
        console.error('[fetchProfile] Profile fetch error:', error);
        // Keep a valid Auth session intact. A missing or inaccessible profile
        // must lead to recovery, never to an unexplained bounce back to login.
        clearProfileState();
        setNeedsProfileRecovery(true);
        return;
      }

      if (data) {
        console.log('[fetchProfile] PROFILE DATA:', data);
        console.log('[fetchProfile] email_alias value:', data.email_alias, 'type:', typeof data.email_alias);
        console.log('[fetchProfile] username value:', data.username, 'type:', typeof data.username);

        const alias = getReceiptItAlias(data, authEmail);
        applyProfileState(data, '', authEmail);

        if (!alias) {
          console.log('[fetchProfile] User profile exists but has no alias - needs setup');
        }

        console.log('[fetchProfile] State set - username:', data.username || '', 'emailAlias:', alias);
      } else {
        console.error('[fetchProfile] No profile found for authenticated user:', userId);
        clearProfileState();
        setNeedsProfileRecovery(true);
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
          await fetchProfile(authUser.id, authUser.email);
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
          await fetchProfile(session.user.id, session.user.email);
        } else {
          console.log('[onAuthStateChange] Auth state change - no user, clearing profile data');
          setUsername('');
          setEmailAlias('');
          setFullName('');
          setNeedsAliasSetup(false);
          setNeedsProfileRecovery(false);
          setProfileSettings(defaultProfileSettings);
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

      const { data: createdAccount, error: invokeError } = await supabase.functions.invoke('create-account', {
        body: {
          email,
          password,
          alias,
          fullName,
        },
      });

      if (invokeError) {
        console.error('[signUp] Create account edge function error:', invokeError);
        let errorMessage = 'Failed to create account';
        const errorResponse = (invokeError as any)?.context;

        if (errorResponse && typeof errorResponse.json === 'function') {
          try {
            const errorBody = await errorResponse.json();
            errorMessage = errorBody?.details || errorBody?.error || errorMessage;
          } catch (parseError) {
            console.error('[signUp] Failed to parse create-account error response:', parseError);
          }
        } else if (invokeError instanceof Error && invokeError.message) {
          errorMessage = invokeError.message;
        }

        return { error: new Error(errorMessage) };
      }

      if (!createdAccount?.success) {
        return { error: new Error(createdAccount?.details || createdAccount?.error || 'Failed to create account') };
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !signInData.user) {
        console.error('[signUp] Sign-in after account creation failed:', signInError);
        return { error: new Error(signInError?.message || 'Account created, but automatic sign-in failed') };
      }

      const displayName = fullName || signInData.user.email?.split('@')[0] || 'user';
      const { data: profileData, error: fetchError } = await waitForProfile(signInData.user.id);

      if (fetchError || !profileData) {
        console.error('[signUp] Profile verification error:', fetchError);
        return { error: new Error('Failed to verify new account') };
      }

      applyProfileState(profileData, displayName, signInData.user.email);

      console.log('[signUp] Account created successfully');
      return { error: null };
    } catch (err: any) {
      console.error('[signUp] Unexpected signup error:', err);
      return { error: err };
    } finally {
      setIsSigningUp(false);
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

      const { data: profileData, error: profileError } = await profileQueryForUser(data.user.id);

      if (profileError) {
        console.error('[signIn] Profile fetch error:', profileError);
        setSession(data.session);
        setUser(data.user);
        clearProfileState();
        setNeedsProfileRecovery(true);
        return { error: null };
      }

      if (!profileData) {
        console.error('[signIn] No profile found for authenticated user');
        setSession(data.session);
        setUser(data.user);
        clearProfileState();
        setNeedsProfileRecovery(true);
        return { error: null };
      }

      const alias = getReceiptItAlias(profileData, data.user.email);
      applyProfileState(profileData, '', data.user.email);

      if (!alias) {
        console.log('[signIn] Profile exists but missing alias - needs setup');
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
    await fetchProfile(authUser.id, authUser.email);
  };

  const recoverProfile = async (username: string, fullName: string, alias: string | null) => {
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
          full_name: fullName || '',
          username: username || 'user',
          email_alias: alias || null,
          plan: 'free',
        });

      if (insertError) {
        console.error('[recoverProfile] Profile insert error:', insertError);
        return { error: new Error('Failed to recover profile') };
      }

      console.log('[recoverProfile] Profile created');

      const { data: profileData, error: fetchError } = await profileQueryForUser(user.id);

      if (fetchError || !profileData) {
        console.error('[recoverProfile] Profile verification error:', fetchError);
        return { error: new Error('Failed to verify recovered profile') };
      }

      applyProfileState(profileData, fullName, user.email);

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

    const { data: profileData, error: fetchError } = await profileQueryForUser(user.id);

    if (fetchError || !profileData) {
      console.error('[createAlias] Profile fetch error:', fetchError);
      return { error: fetchError || new Error('Failed to verify alias') };
    }

    setEmailAlias(getReceiptItAlias(profileData, user.email));
    setFullName(profileData.full_name || profileData.username || '');
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
    setProfileSettings(defaultProfileSettings);
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
    profileSettings,
    refreshProfileSettings,
    updateProfileSettings,
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
