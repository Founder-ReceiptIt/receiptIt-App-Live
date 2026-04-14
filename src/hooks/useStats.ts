import { useState, useEffect } from 'react';
import { FINALIZED_RECEIPT_STATUSES, supabase } from '../lib/supabase';

export interface Stats {
  receiptsCaptured: number;
  warrantiesTracked: number;
  spamBlocked: number | null;
}

export function useStats(userId: string | undefined) {
  const [stats, setStats] = useState<Stats>({
    receiptsCaptured: 0,
    warrantiesTracked: 0,
    spamBlocked: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        const [totalResult, warrantiesResult, profileResult] = await Promise.all([
          supabase
            .from('receipts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', [...FINALIZED_RECEIPT_STATUSES]),
          supabase
            .from('receipts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', [...FINALIZED_RECEIPT_STATUSES])
            .not('warranty_date', 'is', null)
            .gt('warranty_date', today),
          supabase
            .from('profiles')
            .select('spam_blocked')
            .eq('id', userId)
            .maybeSingle(),
        ]);

        if (totalResult.error) {
          console.error('Error fetching total receipts:', totalResult.error);
          setLoading(false);
          return;
        }

        if (warrantiesResult.error) {
          console.error('Error fetching warranties:', warrantiesResult.error);
          setLoading(false);
          return;
        }

        if (profileResult.error) {
          console.error('Error fetching spam_blocked:', profileResult.error);
        }

        const receiptsCaptured = totalResult.count || 0;
        const warrantiesTracked = warrantiesResult.count || 0;
        const spamBlocked = typeof profileResult.data?.spam_blocked === 'number'
          && Number.isFinite(profileResult.data.spam_blocked)
          ? profileResult.data.spam_blocked
          : null;

        setStats({
          receiptsCaptured,
          warrantiesTracked,
          spamBlocked,
        });

        setLoading(false);
      } catch (error) {
        console.error('Error in fetchStats:', error);
        setLoading(false);
      }
    };

    fetchStats();

    const channel = supabase
      .channel('receipts-stats-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipts',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { stats, loading };
}
