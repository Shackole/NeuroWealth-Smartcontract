import { parseUsdcAmount } from '../moneyInput';

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
