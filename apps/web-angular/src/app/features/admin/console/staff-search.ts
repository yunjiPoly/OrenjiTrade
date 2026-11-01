import type { StaffSearchResponse } from '@orenji/api-client';

/** One result of the console's staff search (spec 15.1), grouped Collectors, Cards, Reports. */
export interface StaffSearchResult {
  id: string;
  group: 'collectors' | 'cards' | 'reports';
  title: string;
  line: string;
  /** Where Enter or a click goes. */
  link: string[];
  /** Query parameters of the link (a card opens in the Cards page's drawer). */
  query?: Record<string, string>;
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

/** The results of `GET /admin/search` (spec 15.8.6), as the dropdown lists them. */
export function fromStaffSearch(
  response: StaffSearchResponse,
  gameLabel: (slug: string) => string,
  reasonLabel: (reason: string) => string,
): StaffSearchResult[] {
  return [
    ...response.collectors.map((user): StaffSearchResult => ({
      id: user.id,
      group: 'collectors',
      title: user.displayName || `@${user.handle}`,
      line: user.email ? `@${user.handle} · ${user.email}` : `@${user.handle}`,
      link: ['/admin/users', user.id],
    })),
    ...response.cards.map((card): StaffSearchResult => ({
      id: card.printingCode ? `${card.id}-${card.printingCode}` : card.id,
      group: 'cards',
      title: card.name,
      line: card.printingCode
        ? `${gameLabel(card.game)} · ${card.printingCode}`
        : gameLabel(card.game),
      link: ['/admin/cards'],
      query: { open: card.id },
    })),
    ...response.reports.map((report): StaffSearchResult => ({
      id: report.id,
      group: 'reports',
      title: `${reportNumberLabel(report.number)} · @${report.reportedHandle}`,
      line: reasonLabel(report.reason),
      link: ['/admin/reports', report.id],
    })),
  ];
}

/**
 * What the dropdown says when nothing matches: a moderator who typed words learns that
 * moderators search report numbers only (WH1's U16).
 */
export function staffEmptyLine(admin: boolean, query: StaffQuery): string {
  if (admin) {
    return 'Nothing matches. Try a handle, an email, a card name, a printing code or a report number.';
  }
  return query.number === null
    ? 'Moderators search report numbers only. Type a number such as #1047.'
    : 'No report has this number.';
}
