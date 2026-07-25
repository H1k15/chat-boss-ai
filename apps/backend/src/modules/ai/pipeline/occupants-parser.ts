import { deaccent } from '../../../common/vietnamese';

// Bóc SỐ NGƯỜI Ở từ câu khách BẰNG CODE (tất định).
// "ở một mình" -> 1; "hai vợ chồng" -> 2; "2 người" -> 2; "nhóm 3 bạn" -> 3.

export interface OccupantsParse {
  occupants?: number;
}

const WORD_NUM: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  nam: 5,
};

export function parseOccupants(text: string): OccupantsParse {
  const t = deaccent(text);

  if (/o mot minh|mot minh|o 1 minh|\b1 minh\b|o rieng mot/.test(t)) {
    return { occupants: 1 };
  }
  if (/vo chong|2 vo chong|hai vo chong/.test(t)) {
    return { occupants: 2 };
  }

  // "nhom 3", "nhom 3 ban", "3 nguoi", "2 dua", "4 ban", "o ghep 3"
  const num = t.match(/(?:nhom|o ghep)?\s*(\d+)\s*(?:nguoi|ban|dua|thanh vien|ban be)/);
  if (num) {
    const n = Number(num[1]);
    if (n >= 1 && n <= 20) return { occupants: n };
  }
  // "nhom bon ban", "hai nguoi"
  const word = t.match(/(?:nhom\s+)?(mot|hai|ba|bon|nam)\s*(?:nguoi|ban|dua|thanh vien)/);
  if (word) return { occupants: WORD_NUM[word[1]] };

  return {};
}
