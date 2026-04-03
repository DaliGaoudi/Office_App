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
  not_started: { label: 'لم يبدأ بعد', color: 'gray' },
  has_deposit: { label: 'تسبقة', color: 'blue' },
  waiting_payment: { label: 'في انتظار الخلاص', color: 'amber' },
  finished: { label: 'منتهي', color: 'green' }
};
