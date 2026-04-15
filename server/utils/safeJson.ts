/**
 * Server-side JSON parser that preserves 64-bit integer precision.
 * See utils/safeJson.ts for full documentation.
 */

const MAX_SAFE = BigInt('9007199254740991');

export function safeJsonParse(text: string): any {
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
                    // not a valid bigint
                }
            }

            parts.push(numStr);
            continue;
        }

        parts.push(ch);
        i++;
    }

    return JSON.parse(parts.join(''));
}
