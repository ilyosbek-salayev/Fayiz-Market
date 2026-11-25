import { describe, expect, it } from 'vitest';
import { formatNumber, groupDigits, parseNumber } from './NumberInput';

describe('NumberInput formatting', () => {
  it('groups thousands with spaces', () => { expect(groupDigits('1000000')).toBe('1 000 000'); expect(groupDigits('950')).toBe('950'); });
  it('shows 0 as an empty field so typing replaces it', () => { expect(formatNumber(0)).toBe(''); expect(formatNumber(150000)).toBe('150 000'); });
  it('drops leading zeros and every non-digit (paste, spaces)', () => {
    expect(parseNumber('0150000').value).toBe(150000);
    expect(parseNumber('1 000 000 soʻm').value).toBe(1000000);
    expect(parseNumber('').value).toBe(0);
  });
  it('keeps a minus only where allowed', () => {
    expect(parseNumber('-12', true).value).toBe(-12);
    expect(parseNumber('-12').value).toBe(12);
    expect(formatNumber(-1200, true)).toBe('-1 200');
  });
});
