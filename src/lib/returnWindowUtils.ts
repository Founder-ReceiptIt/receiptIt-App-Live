export interface ReturnWindowStatus {
  status: 'active' | 'urgent' | 'expired' | 'none';
  daysLeft: number;
  message: string;
}

export function getReturnWindowStatus(returnDateStr?: string, now = new Date()): ReturnWindowStatus {
  if (!returnDateStr || !Number.isFinite(new Date(returnDateStr).getTime())) {
    return {
      status: 'none',
      daysLeft: 0,
      message: ''
    };
  }

  const returnDate = new Date(returnDateStr);
  const today = new Date(now);

  // Reset time portion for accurate day calculation
  returnDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffTime = returnDate.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      status: 'expired',
      daysLeft: 0,
      message: 'Expired'
    };
  }

  if (daysLeft === 0) {
    return {
      status: 'urgent',
      daysLeft: 0,
      message: 'Ends today'
    };
  }

  if (daysLeft <= 3) {
    return {
      status: 'urgent',
      daysLeft,
      message: `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
    };
  }

  return {
    status: 'active',
    daysLeft,
    message: `${daysLeft} days left`
  };
}
