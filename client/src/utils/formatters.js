/**
 * Formats an amount to the Tunisian standard requested: 111.111 (dot decimal, 3 millimes)
 * @param {number|string} val - The numeric value to format
 * @returns {string} - Formatted string
 */
export const formatAmount = (val) => {
  // The DB stores these as millimes (integers), so we divide by 1000 
  // to get Dinars before formatting (standard Tunisian display).
  const num = parseFloat(val) / 1000;
  if (isNaN(num)) return '0,000';
  
  // Using fr-FR for the comma decimal separator
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false 
  }).format(num);
};

export const STATUS_MAP = {
  cancelled: { label: 'ملغى', color: 'red' },
  has_deposit: { label: 'في إنتظار التبليغ', color: 'pink' },
  waiting_payment: { label: 'في انتظار الخلاص', color: 'amber' },
  finished: { label: 'منتهي', color: 'green' }
};

/*
 * CNSS statuses — the general registers' STATUS_MAP plus one stage that only the
 * CNSS flow has: a محضر is printed before it can be served, so a new بطاقة جبر
 * starts at في انتظار الطباعة. Kept separate so the option does NOT appear in the
 * execution/general registers, which share STATUS_MAP above.
 *
 * Listed in lifecycle order, which is also the order of the dropdowns.
 */
export const CNSS_AWAITING_PRINT = 'awaiting_print';

export const CNSS_STATUS_MAP = {
  [CNSS_AWAITING_PRINT]: { label: 'في انتظار الطباعة', color: 'blue' },
  has_deposit: STATUS_MAP.has_deposit,
  waiting_payment: STATUS_MAP.waiting_payment,
  finished: STATUS_MAP.finished,
  cancelled: STATUS_MAP.cancelled
};

// How a محضر إعلام was served (طريقة التبليغ). Stored as the literal label, like
// the other loosely-typed CNSS text columns; empty means not recorded yet.
export const TABLIGH_METHODS = ['فصل 8', 'فصل 10', 'مباشر'];
