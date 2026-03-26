export interface ReturnWindowStatus {
  status: 'active' | 'urgent' | 'expired' | 'none';
  daysLeft: number;
  message: string;
}

export function getReturnWindowStatus(returnDateStr?: string): ReturnWindowStatus {
  if (!returnDateStr) {
    return {
      status: 'none',
      daysLeft: 0,
      message: ''
    };
  }

  const returnDate = new Date(returnDateStr);
  const today = new Date();

  // Reset time portion for accurate day calculation
  returnDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffTime = returnDate.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      status: 'expired',
      daysLeft: 0,
      message: 'Return Expired'
    };
  }

  if (daysLeft === 0) {
    return {
      status: 'urgent',
      daysLeft: 0,
      message: 'Return: Today'
    };
  }

  if (daysLeft <= 3) {
    return {
      status: 'urgent',
      daysLeft,
      message: `Return: ${daysLeft} ${daysLeft === 1 ? 'Day' : 'Days'} Left`
    };
  }

  return {
    status: 'active',
    daysLeft,
    message: `Return: ${daysLeft} Days Left`
  };
}
