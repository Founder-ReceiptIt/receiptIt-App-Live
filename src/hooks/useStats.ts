import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Stats {
  receiptsCaptured: number;
  warrantiesTracked: number;
  spamBlocked: number;
}

export function useStats(userId: string | undefined) {
  const [stats, setStats] = useState<Stats>({
    receiptsCaptured: 0,
    warrantiesTracked: 0,
    spamBlocked: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      const { data: receipts, error } = await supabase
        .from('receipts')
        .select('warranty_date')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching receipts:', error);
        setLoading(false);
        return;
      }

      const totalReceipts = receipts.length;

      const activeWarranties = receipts.filter((receipt) => {
        if (!receipt.warranty_date) return false;
        const warrantyDate = new Date(receipt.warranty_date);
        const today = new Date();
        return warrantyDate > today;
      }).length;

      const spamBlocked = totalReceipts * 12;

      setStats({
        receiptsCaptured: totalReceipts,
        warrantiesTracked: activeWarranties,
        spamBlocked: spamBlocked,
      });

      setLoading(false);
    };

    fetchStats();

    const channel = supabase
      .channel('receipts-stats')
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
