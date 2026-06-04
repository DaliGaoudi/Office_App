/**
 * Converts a Tunisian dinar amount (stored as millimes integer) to English words.
 * e.g.  173340  →  "One Hundred and Seventy-Three Dinars and Three Hundred and Forty Millimes"
 */

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
              'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
              'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const scales = ['', 'Thousand', 'Million', 'Billion'];

function helper(n) {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o > 0 ? '-' + ones[o] : '');
}

function threeDigitsToEnglish(n) {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rem = n % 100;
  let res = '';
  if (h > 0) {
    res += ones[h] + ' Hundred';
    if (rem > 0) res += ' and ';
  }
  if (rem > 0) {
    res += helper(rem);
  }
  return res;
}

function integerToEnglish(n) {
  if (n === 0) return 'Zero';
  let parts = [];
  let scaleIdx = 0;
  let num = n;
  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const words = threeDigitsToEnglish(chunk);
      parts.unshift(words + (scales[scaleIdx] ? ' ' + scales[scaleIdx] : ''));
    }
    num = Math.floor(num / 1000);
    scaleIdx++;
  }
  return parts.join(', ');
}

export function numberToEnglishWords(millimes) {
  const total = Math.round(parseFloat(millimes) || 0);
  const dinars = Math.floor(total / 1000);
  const mills  = total % 1000;

  if (total === 0) return 'Zero Dinars';

  let result = '';

  if (dinars > 0) {
    result = integerToEnglish(dinars) + (dinars === 1 ? ' Dinar' : ' Dinars');
  }

  if (mills > 0) {
    const millsWords = threeDigitsToEnglish(mills);
    if (dinars > 0) {
      result += ' and ' + millsWords + (mills === 1 ? ' Millime' : ' Millimes');
    } else {
      result = millsWords + (mills === 1 ? ' Millime' : ' Millimes');
    }
  }

  return result;
}
