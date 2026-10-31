/** One result of the console's staff search (spec 15.1), grouped Collectors, Cards, Reports. */
export interface StaffSearchResult {
  id: string;
  group: 'collectors' | 'cards' | 'reports';
  title: string;
  line: string;
  /** Where Enter or a click goes. */
  link: string[];
}

export const STAFF_SEARCH_GROUPS: readonly { id: StaffSearchResult['group']; label: string }[] = [
  { id: 'collectors', label: 'Collectors' },
  { id: 'cards', label: 'Cards' },
  { id: 'reports', label: 'Reports' },
];

/** What a staff search reads: a report number ("#1047", "1047") and, for admins, a text. */
export interface StaffQuery {
  text: string;
  /** The report number typed, or `null`. */
  number: number | null;
}

/** The search's text as typed: a report number when it is one ("#1047" or "1047"). */
export function parseStaffQuery(raw: string): StaffQuery {
  const text = raw.trim();
  const match = /^#?\s*(\d{1,12})$/.exec(text);
  const number = match ? Number(match[1]) : null;
  return { text, number: number !== null && number > 0 ? number : null };
}

/** Whether a query is worth asking: a number, or (admins) a text of 2 characters or more. */
export function staffQueryReady(query: StaffQuery, admin: boolean): boolean {
  return query.number !== null || (admin && query.text.replace(/^#/, '').length >= 2);
}

/**
 * Whether a text also goes to the card catalog (review fix 1): an email or a handle (anything with
 * an "@") can never be a card name, and the public card search's address would carry it into
 * request logs; it goes to accounts only.
 */
export function asksCards(text: string): boolean {
  return !text.includes('@');
}

/** One group's answer: its results, or that the request failed. */
export interface StaffGroupAnswer {
  results: StaffSearchResult[];
  failed: boolean;
}

/**
 * Whether the search failed as a whole (review fix 1): a group failed and nothing came back, so
 * "Nothing matches" would not be true. Partial results are shown as they are.
 */
export function staffSearchFailed(answers: readonly StaffGroupAnswer[]): boolean {
  return (
    answers.some((answer) => answer.failed) &&
    answers.every((answer) => answer.results.length === 0)
  );
}

/** The results in the order the dropdown lists them (Collectors, Cards, Reports). */
export function orderedResults(results: readonly StaffSearchResult[]): StaffSearchResult[] {
  const order = STAFF_SEARCH_GROUPS.map((group) => group.id);
  return [...results].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** "#1047" */
export function reportNumberLabel(number: number | null | undefined): string {
  return number ? `#${number}` : '';
}
