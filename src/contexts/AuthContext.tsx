/* eslint-disable @typescript-eslint/no-explicit-any -- This compatibility layer normalises several historical live profile/error shapes. */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import {
  AccountCurrencySettings,
  BUDGET_INCREMENT,
  clearLegacyMonthlyBudget,
  DEFAULT_MONTHLY_BUDGET,
  getLegacyMonthlyBudget,
  isSupportedCurrency,
  normalizeSupportedCurrency,
  SupportedCurrencyCode,
} from '../lib/currency';

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
  needsCurrencySetup: boolean;
  needsProfileRecovery: boolean;
  passwordRecoveryActive: boolean;
  profileSettings: ProfileSettings;
  accountCurrency: AccountCurrencySettings;
  refreshProfileSettings: () => Promise<void>;
  updateProfileSettings: (nextSettings: Partial<ProfileSettings>) => Promise<{ error: any }>;
  updateAccountCurrency: (
    preferredCurrency: SupportedCurrencyCode,
    monthlyBudgetAmount: number,
    completeSetup?: boolean,
  ) => Promise<{ error: any }>;
  checkAliasAvailability: (aliasLocalPart: string) => Promise<{ available: boolean; error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, aliasLocalPart: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createAlias: () => Promise<{ error: any }>;
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

const defaultAccountCurrency: AccountCurrencySettings = {
  preferredCurrency: 'GBP',
  monthlyBudgetAmount: DEFAULT_MONTHLY_BUDGET,
  monthlyBudgetCurrency: 'GBP',
  currencySetupCompleted: true,
};

const signupAuthorizationKey = 'receiptit_signup_authorization';

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

const toPositiveNumber = (value: unknown, fallback: number | null): number | null => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
};

const normalizeAccountCurrency = (profileData: any): AccountCurrencySettings => {
  const preferredCurrency = normalizeSupportedCurrency(profileData?.preferred_currency);
  const monthlyBudgetCurrency = isSupportedCurrency(profileData?.monthly_budget_currency)
    ? profileData.monthly_budget_currency.toUpperCase() as SupportedCurrencyCode
    : preferredCurrency;

  return {
    preferredCurrency,
    monthlyBudgetAmount: toPositiveNumber(profileData?.monthly_budget_amount, DEFAULT_MONTHLY_BUDGET),
    monthlyBudgetCurrency: monthlyBudgetCurrency === preferredCurrency ? monthlyBudgetCurrency : preferredCurrency,
    currencySetupCompleted: profileData?.currency_setup_completed !== false,
  };
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
  const [needsCurrencySetup, setNeedsCurrencySetup] = useState(false);
  const [needsProfileRecovery, setNeedsProfileRecovery] = useState(false);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(defaultProfileSettings);
  const [accountCurrency, setAccountCurrency] = useState<AccountCurrencySettings>(defaultAccountCurrency);
  const [isSigningUp, setIsSigningUp] = useState(false);
  // `settings` is deliberately not requested here: older live profiles do not
  // have that optional column, and selecting a missing column makes Supabase
  // reject the entire profile read (which previously looked like a login loop).
  const profileSelect = 'id, email, full_name, email_alias, username, plan, created_at, preferred_currency, monthly_budget_amount, monthly_budget_currency, currency_setup_completed, legacy_budget_migration_completed';

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

  const applyProfileState = (profileData: any, fallbackFullName = '') => {
    setUsername(profileData?.username || '');
    setEmailAlias('');
    setFullName(profileData?.full_name || fallbackFullName || profileData?.username || '');
    setNeedsProfileRecovery(false);
    setNeedsAliasSetup(false);
    setProfileSettings(normalizeProfileSettings(profileData));
    const currencySettings = normalizeAccountCurrency(profileData);
    setAccountCurrency(currencySettings);
    setNeedsCurrencySetup(!currencySettings.currencySetupCompleted);

    if (profileData?.legacy_budget_migration_completed === false && profileData?.id) {
      const legacyBudget = getLegacyMonthlyBudget();
      const migrationPayload: Record<string, unknown> = {
        legacy_budget_migration_completed: true,
      };
      if (legacyBudget !== null) {
        migrationPayload.monthly_budget_amount = legacyBudget;
        migrationPayload.monthly_budget_currency = 'GBP';
        migrationPayload.preferred_currency = 'GBP';
        setAccountCurrency({
          ...currencySettings,
          preferredCurrency: 'GBP',
          monthlyBudgetCurrency: 'GBP',
          monthlyBudgetAmount: legacyBudget,
        });
      }

      void supabase.from('profiles').update(migrationPayload).eq('id', profileData.id).then(({ error }) => {
        if (error) {
          console.warn('[AuthContext] Legacy budget migration could not be completed:', error.message);
          return;
        }
        clearLegacyMonthlyBudget();
      });
    }
  };

  const ensureInboxAlias = async () => {
    const { error: opaqueError } = await supabase.rpc('ensure_active_email_alias');
    if (opaqueError) {
      console.warn('[AuthContext] Internal inbox alias is not available yet:', opaqueError.message);
      return { alias: '', error: opaqueError };
    }
    const { data, error } = await supabase.rpc('ensure_friendly_email_alias');
    if (error) {
      console.warn('[AuthContext] Private inbox alias is not available yet:', error.message);
      return { alias: '', error };
    }

    const result = Array.isArray(data) ? data[0] : data;
    const alias = typeof result?.email_address === 'string' ? result.email_address : '';
    if (alias) {
      setEmailAlias(alias);
      setNeedsAliasSetup(false);
    }
    return { alias, error: null };
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

  const updateAccountCurrency = async (
    preferredCurrency: SupportedCurrencyCode,
    monthlyBudgetAmount: number,
    completeSetup = true,
  ) => {
    if (!user) return { error: new Error('No authenticated user') };
    if (!isSupportedCurrency(preferredCurrency)) return { error: new Error('Choose a supported currency') };
    if (
      !Number.isFinite(monthlyBudgetAmount)
      || monthlyBudgetAmount <= 0
      || !Number.isInteger(monthlyBudgetAmount / BUDGET_INCREMENT)
    ) {
      return { error: new Error(`Use whole ${BUDGET_INCREMENT}-unit amounts for your monthly budget.`) };
    }

    const normalizedCurrency = preferredCurrency.toUpperCase() as SupportedCurrencyCode;
    const nextSettings: AccountCurrencySettings = {
      preferredCurrency: normalizedCurrency,
      monthlyBudgetAmount,
      monthlyBudgetCurrency: normalizedCurrency,
      currencySetupCompleted: completeSetup,
    };

    const { error } = await supabase
      .from('profiles')
      .update({
        preferred_currency: normalizedCurrency,
        monthly_budget_amount: monthlyBudgetAmount,
        monthly_budget_currency: normalizedCurrency,
        currency_setup_completed: completeSetup,
        legacy_budget_migration_completed: true,
      })
      .eq('id', user.id);

    if (!error) {
      setAccountCurrency(nextSettings);
      setNeedsCurrencySetup(!completeSetup);
      clearLegacyMonthlyBudget();
    }

    return { error };
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
    setAccountCurrency(defaultAccountCurrency);
    setNeedsCurrencySetup(false);
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
        setNeedsCurrencySetup(false);
        setNeedsProfileRecovery(false);
        setAccountCurrency(defaultAccountCurrency);
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

        applyProfileState(data);
        const { alias } = await ensureInboxAlias();
        if (!alias) setNeedsAliasSetup(true);
        console.log('[fetchProfile] State set - username:', data.username || '', 'hasFriendlyAlias:', Boolean(alias));
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
          if (new URLSearchParams(window.location.search).get('reset') === '1') {
            setPasswordRecoveryActive(true);
          }
          const { data: { user: authUser }, error } = await supabase.auth.getUser();
          if (error || !authUser) {
            console.warn('[Auth] Session exists but user not found in auth - clearing stale session');
            setSession(null);
            setUser(null);
            setUsername('');
            setEmailAlias('');
            setNeedsAliasSetup(false);
            setNeedsCurrencySetup(false);
            setNeedsProfileRecovery(false);
            setAccountCurrency(defaultAccountCurrency);
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
          setNeedsCurrencySetup(false);
          setNeedsProfileRecovery(false);
          setAccountCurrency(defaultAccountCurrency);
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
      // The explicit getSession() bootstrap above owns INITIAL_SESSION. Running
      // profile/auth requests from both paths can contend for Supabase's auth
      // lock and leave a protected-route refresh on the loading screen.
      if (_event === 'INITIAL_SESSION') {
        return;
      }

      // Supabase holds an internal auth lock while this callback is running.
      // Defer profile/RPC work so sign-in and signup cannot deadlock while the
      // callback tries to make another authenticated request.
      window.setTimeout(() => { void (async () => {
        console.log('[onAuthStateChange] Auth state changed, event:', _event, 'user:', session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
        if (_event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryActive(true);
        }

        if (session?.user) {
          console.log('[onAuthStateChange] Auth state change - calling fetchProfile for user:', session.user.id);
          await fetchProfile(session.user.id);
        } else {
          console.log('[onAuthStateChange] Auth state change - no user, clearing profile data');
          setUsername('');
          setEmailAlias('');
          setFullName('');
          setNeedsAliasSetup(false);
          setNeedsCurrencySetup(false);
          setNeedsProfileRecovery(false);
          setProfileSettings(defaultProfileSettings);
          setAccountCurrency(defaultAccountCurrency);
        }

        setLoading(false);
      })(); }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAliasAvailability = async (aliasLocalPart: string) => {
    const signupAuthorization = sessionStorage.getItem(signupAuthorizationKey);
    if (!signupAuthorization) {
      return { available: false, error: new Error('Your beta access has expired.') };
    }

    const { data, error } = await supabase.functions.invoke('create-account', {
      body: {
        mode: 'check-alias',
        aliasLocalPart,
        signupAuthorization,
      },
    });
    if (error) {
      let message = 'We couldn’t check that address right now.';
      const response = (error as any)?.context;
      if (response && typeof response.json === 'function') {
        try {
          const body = await response.json();
          message = body?.error || message;
        } catch {
          // Keep the generic message if the response body is unavailable.
        }
      }
      return { available: false, error: new Error(message) };
    }
    return { available: data?.available === true, error: null };
  };

  const signUp = async (email: string, password: string, fullName: string, aliasLocalPart: string) => {
    try {
      console.log('[signUp] Starting new account creation for email:', email);
      setIsSigningUp(true);

      const { data: createdAccount, error: invokeError } = await supabase.functions.invoke('create-account', {
        body: {
          email,
          password,
          fullName,
          aliasLocalPart,
          signupAuthorization: sessionStorage.getItem(signupAuthorizationKey),
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

      sessionStorage.removeItem(signupAuthorizationKey);

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

      applyProfileState(profileData, displayName);
      await ensureInboxAlias();

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

      applyProfileState(profileData);
      const { alias } = await ensureInboxAlias();
      if (!alias) setNeedsAliasSetup(true);

      return { error: null };
    } catch (err: any) {
      console.error('[signIn] Unexpected error:', err);
      return { error: err };
    }
  };

  const requestPasswordReset = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/?reset=1`,
    });
    if (error) {
      console.warn('[passwordRecovery] Reset request could not be completed:', error.message);
    }
  };

  const completePasswordReset = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      setPasswordRecoveryActive(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
    return { error };
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
      setNeedsCurrencySetup(false);
      setNeedsProfileRecovery(false);
      setAccountCurrency(defaultAccountCurrency);
      await supabase.auth.signOut();
      return;
    }

    console.log('[forceRefresh] Force refresh - fetching profile for user:', authUser.id);
    await fetchProfile(authUser.id);
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

      applyProfileState(profileData, fullName);
      await ensureInboxAlias();

      console.log('[recoverProfile] Profile recovered successfully');
      return { error: null };
    } catch (err: any) {
      console.error('[recoverProfile] Unexpected error:', err);
      return { error: err };
    }
  };

  const createAlias = async () => {
    if (!user) {
      return { error: new Error('No authenticated user') };
    }

    console.log('[createAlias] Provisioning private inbox alias for authenticated user:', user.id);

    const { alias, error } = await ensureInboxAlias();
    if (error || !alias) return { error: error || new Error('Could not create a private inbox address') };

    const { data: profileData, error: fetchError } = await profileQueryForUser(user.id);

    if (fetchError || !profileData) {
      console.error('[createAlias] Profile fetch error:', fetchError);
      return { error: fetchError || new Error('Failed to verify alias') };
    }

    setEmailAlias(alias);
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
    setNeedsCurrencySetup(false);
    setNeedsProfileRecovery(false);
    setPasswordRecoveryActive(false);
    setProfileSettings(defaultProfileSettings);
    setAccountCurrency(defaultAccountCurrency);
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
    needsCurrencySetup,
    needsProfileRecovery,
    passwordRecoveryActive,
    profileSettings,
    accountCurrency,
    refreshProfileSettings,
    updateProfileSettings,
    updateAccountCurrency,
    checkAliasAvailability,
    signUp,
    signIn,
    requestPasswordReset,
    completePasswordReset,
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
