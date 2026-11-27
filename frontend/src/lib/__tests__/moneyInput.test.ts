import { parsePastedAssetAmount, parseUsdcAmount } from '../moneyInput';

describe('parseUsdcAmount', () => {
  it('preserves dot-decimal transaction amounts exactly', () => {
    expect(parseUsdcAmount('1234.56')).toBe(1234.56);
    expect(parseUsdcAmount('0.0000001')).toBe(0.0000001);
  });

  it('rejects localized grouping and syntax that could change the submitted amount', () => {
    expect(parseUsdcAmount('1,234.56')).toBeNull();
    expect(parseUsdcAmount('1.234,56')).toBeNull();
    expect(parseUsdcAmount('1e3')).toBeNull();
    expect(parseUsdcAmount('')).toBeNull();
  });
});

describe('parsePastedAssetAmount', () => {
  it.each([
    ['1,234,567.89', 'en', '1234567.89'],
    ['1.234.567,89', 'es', '1234567.89'],
    ['1\u202f234,50', 'fr', '1234.50'],
    ['1\u00a0234,50', 'fr', '1234.50'],
    ['1 234,50', 'fr', '1234.50'],
    ['0,125', 'pt', '0.125'],
    ['12,34,567.89', 'en-IN', '1234567.89'],
  ])('normalizes %s in %s without rounding', (input, locale, value) => {
    expect(parsePastedAssetAmount(input, locale)).toEqual({ value });
  });

  it.each([
    ['1,234', 'en', 'ambiguous'],
    ['1.234', 'es', 'ambiguous'],
    ['12,34.56', 'en', 'invalid'],
    ['1,234.5 USDC', 'en', 'invalid'],
    ['١٢e٣', 'ar', 'invalid'],
    ['0.00000001', 'en', 'precision'],
  ])('rejects %s in %s', (input, locale, error) => {
    expect(parsePastedAssetAmount(input, locale)).toEqual({ error });
  });
});
