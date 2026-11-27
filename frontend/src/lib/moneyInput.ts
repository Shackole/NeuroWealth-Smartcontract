/** Parse a user-entered USDC amount without accepting locale grouping or exponents. */
export function parseUsdcAmount(input: string): number | null {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,7})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

type PastedAmount =
  | { value: string }
  | { error: 'ambiguous' | 'invalid' | 'precision' };

/** Normalize a complete localized amount for the existing numeric inputs. */
export function parsePastedAssetAmount(input: string, locale: string): PastedAmount {
  const formatter = new Intl.NumberFormat(locale);
  const parts = formatter.formatToParts(123456789012345.6);
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  const wholeParts = parts.filter((part) => part.type === 'integer');
  const primarySize = wholeParts.at(-1)?.value.length ?? 3;
  const secondarySize = wholeParts.at(-2)?.value.length ?? primarySize;

  let value = input.trim();
  for (let digit = 0; digit <= 9; digit++) {
    const localized = formatter.format(digit);
    if (localized !== String(digit)) value = value.replaceAll(localized, String(digit));
  }
  if (/^[ \u00a0\u202f]$/u.test(group)) {
    value = value.replace(/[ \u00a0\u202f]/gu, group);
  }

  const [whole, fraction, extra] = value.split(decimal);
  if (extra !== undefined || (fraction !== undefined && !/^\d+$/.test(fraction))) {
    return { error: 'invalid' };
  }

  const groups = whole.split(group);
  if (!groups.every((part) => /^\d+$/.test(part))) return { error: 'invalid' };
  if (groups.length > 1 && (
    groups[0].startsWith('0') ||
    groups[0].length > secondarySize ||
    groups.at(-1)?.length !== primarySize ||
    groups.slice(1, -1).some((part) => part.length !== secondarySize)
  )) {
    return { error: 'invalid' };
  }

  // A single comma or period between these digit counts can be a decimal
  // or a thousands separator in different number formats.
  if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(value)) return { error: 'ambiguous' };
  if (fraction && fraction.length > 7) return { error: 'precision' };

  const canonical = groups.join('') + (fraction === undefined ? '' : `.${fraction}`);
  return parseUsdcAmount(canonical) === null ? { error: 'invalid' } : { value: canonical };
}
