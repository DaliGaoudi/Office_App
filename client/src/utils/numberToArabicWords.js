/**
 * Converts a Tunisian dinar amount (stored as millimes integer) to Arabic words.
 * e.g.  173340  →  "مائة وثلاثة وسبعون دينارا و 340 مليما"
 *        143000  →  "مائة وثلاثة وأربعون دينارا"
 *          1000  →  "دينار واحد"
 */

const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
               'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
               'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];

const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
                  'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function threeDigitsToArabic(n) {
  if (n === 0) return '';
  
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const t = Math.floor(rem / 10);
  const o = rem % 10;

  let parts = [];

  if (h > 0) parts.push(hundreds[h]);

  if (rem < 20 && rem > 0) {
    parts.push(ones[rem]);
  } else if (rem >= 20) {
    if (o > 0) {
      parts.push(ones[o] + ' و' + tens[t]);
    } else {
      parts.push(tens[t]);
    }
  }

  return parts.join(' و');
}

function integerToArabic(n) {
  if (n === 0) return 'صفر';
  if (n < 0) return 'ناقص ' + integerToArabic(-n);

  const millions  = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const remainder = n % 1000;

  let parts = [];

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else parts.push(threeDigitsToArabic(millions) + ' ملايين');
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands <= 10) parts.push(threeDigitsToArabic(thousands) + ' آلاف');
    else parts.push(threeDigitsToArabic(thousands) + ' ألف');
  }

  if (remainder > 0) {
    parts.push(threeDigitsToArabic(remainder));
  }

  return parts.join(' و');
}

/**
 * Main export: takes an amount in millimes (as stored in the DB),
 * e.g. 173340, and returns Arabic words.
 * @param {number} millimes - raw integer value from DB
 * @returns {string}
 */
export function numberToArabicWords(millimes) {
  const total = Math.round(parseFloat(millimes) || 0);
  const dinars = Math.floor(total / 1000);
  const mills  = total % 1000;

  if (total === 0) return 'صفر دينار';

  let result = '';

  // Dinar part
  if (dinars > 0) {
    if (dinars === 1) {
      result = 'دينار واحد';
    } else if (dinars === 2) {
      result = 'ديناران اثنان';
    } else {
      result = integerToArabic(dinars) + ' دينارا';
    }
  }

  // Millime part
  if (mills > 0) {
    const millsPadded = String(mills).padStart(3, '0');
    if (dinars > 0) {
      result += ` و ${millsPadded} مليما`;
    } else {
      result = `${millsPadded} مليما`;
    }
  }

  return result;
}
