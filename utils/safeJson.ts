/**
 * JSON parser that preserves 64-bit integer precision.
 *
 * FIDs and PIDs in the Elemental API are int64 values. Many exceed
 * JavaScript's Number.MAX_SAFE_INTEGER (2^53 − 1), causing JSON.parse
 * to silently round them (e.g. 3466547124233281063 → 3466547124233281000).
 * An is_type query with the rounded FID returns empty results and no error.
 *
 * This parser reads the raw JSON text and quotes any bare integer literal
 * whose absolute value exceeds MAX_SAFE_INTEGER, so downstream code
 * receives them as strings instead of lossy numbers.
 */

const MAX_SAFE = BigInt('9007199254740991'); // Number.MAX_SAFE_INTEGER

/**
 * Parse JSON text, converting integers that exceed MAX_SAFE_INTEGER to strings.
 * Safe integers and all other JSON types are unchanged.
 */
export function safeJsonParse(text: string): any {
    const converted = quoteLargeIntegers(text);
    return JSON.parse(converted);
}

/**
 * Walk raw JSON text and wrap unsafe integer literals in double-quotes.
 * Correctly skips over JSON string values so numeric substrings inside
 * strings are never modified.
 */
function quoteLargeIntegers(text: string): string {
    const len = text.length;
    const parts: string[] = [];
    let i = 0;

    while (i < len) {
        const ch = text[i];

        if (ch === '"') {
            const start = i;
            i++;
            while (i < len) {
                if (text[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (text[i] === '"') {
                    i++;
                    break;
                }
                i++;
            }
            parts.push(text.slice(start, i));
            continue;
        }

        if (ch === '-' || (ch >= '0' && ch <= '9')) {
            const start = i;
            if (ch === '-') i++;
            while (i < len && text[i] >= '0' && text[i] <= '9') i++;

            const isFloat = i < len && (text[i] === '.' || text[i] === 'e' || text[i] === 'E');
            if (isFloat) {
                if (text[i] === '.') {
                    i++;
                    while (i < len && text[i] >= '0' && text[i] <= '9') i++;
                }
                if (i < len && (text[i] === 'e' || text[i] === 'E')) {
                    i++;
                    if (i < len && (text[i] === '+' || text[i] === '-')) i++;
                    while (i < len && text[i] >= '0' && text[i] <= '9') i++;
                }
                parts.push(text.slice(start, i));
                continue;
            }

            const numStr = text.slice(start, i);
            const absStr = numStr[0] === '-' ? numStr.slice(1) : numStr;

            if (absStr.length >= 16) {
                try {
                    if (BigInt(absStr) > MAX_SAFE) {
                        parts.push(`"${numStr}"`);
                        continue;
                    }
                } catch {
                    // not a valid bigint, leave as-is
                }
            }

            parts.push(numStr);
            continue;
        }

        parts.push(ch);
        i++;
    }

    return parts.join('');
}
