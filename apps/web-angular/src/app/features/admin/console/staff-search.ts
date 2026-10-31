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

/** The results in the order the dropdown lists them (Collectors, Cards, Reports). */
export function orderedResults(results: readonly StaffSearchResult[]): StaffSearchResult[] {
  const order = STAFF_SEARCH_GROUPS.map((group) => group.id);
  return [...results].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** "#1047" */
export function reportNumberLabel(number: number | null | undefined): string {
  return number ? `#${number}` : '';
}
