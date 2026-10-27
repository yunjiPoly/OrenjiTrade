/**
 * The words of "Report collector" (mockup v50 screen 60, stage R14), in one place. The reasons
 * and their lines are the server's (`GET /public/report-reasons`); the refusals are in
 * `reportLabels.ts` (`reportProblem`).
 */
export const REPORT_COPY = {
  title: 'Report collector',
  sentTitle: 'Report sent',
  back: 'Back',
  reasonsTitle: 'Why are you reporting them?',
  reasonsLoading: 'Loading the reasons',
  reasonsError: 'The reasons could not load',
  details: 'Details (optional)',
  detailsCount: (count: number, max: number) => `${count} / ${max}`,
  detailsPlaceholder: 'What happened? Dates, cards or messages help the moderators.',
  detailsTooLong: (max: number) => `Keep the details under ${max} characters.`,
  confidential:
    'Reports are confidential: they are never told who reported them. False reports can lead to action on your own account.',
  send: 'Send report',
  sending: 'Sending…',
  chooseFirst: 'Choose a reason first.',
  sendFailed: 'The report could not be sent. Please try again.',
  myReports: 'My reports',
  sentBody: (name: string) =>
    `Thank you. Our moderators will review your report about ${name}. They are not told who reported them.`,
  done: 'Done',
  follow: 'Follow it in My reports',
  invalidTitle: 'Nobody to report here',
  invalidBody: "Open the collector's profile and report them from there.",
} as const;
