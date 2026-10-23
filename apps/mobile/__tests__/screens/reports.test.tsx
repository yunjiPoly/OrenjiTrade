import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import ReportCollectorScreen from '@/app/report';
import MyReportsScreen from '@/app/settings/reports';
import { darkPalette } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  OTHER_ID,
  REPORT_REASONS,
  collectorFixture,
  myReportFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = {
    userId: OTHER_ID,
    name: 'Noé Verdun',
    handle: 'collector2',
    source: 'CONVERSATION',
    conversationId: 'conv-1',
  };
});

const CONFIRMATION = {
  id: 'rep-1',
  status: 'OPEN',
  createdAt: '2026-10-05T12:00:00Z',
  reason: 'SCAM',
  reportedUserId: OTHER_ID,
};

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/public/report-reasons': ok(REPORT_REASONS),
    'POST /api/v1/reports/collectors': ok(CONFIRMATION, 201),
    'GET /api/v1/me/reports': ok([myReportFixture()]),
    'GET /api/v1/collectors/collector2': ok(
      collectorFixture({ handle: 'collector2', displayName: 'Noé Verdun' })
    ),
    ...extra,
  });
}

const port = () => new FakeAuthPort(testUser());

describe('Report collector', () => {
  it('needs a reason, sends the context with an idempotency key, then confirms', async () => {
    const api = mockApi(routes());
    renderWithProviders(<ReportCollectorScreen />, { port: port() });
    expect(screen.getByTestId('report-target')).toHaveTextContent('Noé Verdun');
    expect(screen.getByTestId('report-reasons-loading')).toBeOnTheScreen();
    expect(await screen.findByText('Scam or fraud')).toBeOnTheScreen();
    expect(screen.getByText('Took payment or cards and disappeared.')).toBeOnTheScreen();
    // Confirm stays disabled until a reason is chosen.
    expect(screen.getByTestId('report-confirm')).toBeDisabled();
    fireEvent.press(screen.getByTestId('report-reason-SCAM'));
    fireEvent.changeText(screen.getByTestId('report-details'), '  Never showed up.  ');
    fireEvent.press(screen.getByTestId('report-confirm'));
    expect(await screen.findByTestId('report-sent')).toHaveTextContent(
      /Thank you. Our moderators will review your report about Noé Verdun/
    );
    expect(screen.getByText('Follow it in My reports')).toBeOnTheScreen();
    const call = api.callsTo('POST /api/v1/reports/collectors')[0];
    expect(call?.body).toEqual({
      reportedUserId: OTHER_ID,
      reason: 'SCAM',
      details: 'Never showed up.',
      context: { source: 'CONVERSATION', conversationId: 'conv-1' },
    });
    expect(call?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    fireEvent.press(screen.getByTestId('report-my-reports'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/settings/reports');
  });

  it('explains an open report and keeps the reasons disabled', async () => {
    mockApi(
      routes({
        'POST /api/v1/reports/collectors': problem(409, 'REPORT_ALREADY_OPEN', 'Already open', {
          reportId: 'rep-0',
        }),
      })
    );
    renderWithProviders(<ReportCollectorScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('report-reason-HARASSMENT'));
    fireEvent.press(screen.getByTestId('report-confirm'));
    expect(await screen.findByTestId('report-error')).toHaveTextContent(
      /You already reported Noé Verdun/
    );
    expect(screen.getByTestId('report-confirm')).toBeDisabled();
    fireEvent.press(screen.getByTestId('report-open-my-reports'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/settings/reports');
  });

  it('explains the daily limit and the details limit, and lets the reasons load again', async () => {
    mockApi(
      routes({
        'GET /api/v1/public/report-reasons': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(REPORT_REASONS),
        ],
        'POST /api/v1/reports/collectors': problem(429, 'RATE_LIMITED', 'Too many'),
      })
    );
    renderWithProviders(<ReportCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('report-reasons-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.press(await screen.findByTestId('report-reason-OTHER'));
    fireEvent.changeText(screen.getByTestId('report-details'), 'x'.repeat(1001));
    expect(screen.getByText('Keep the details under 1000 characters.')).toBeOnTheScreen();
    expect(screen.getByTestId('report-confirm')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('report-details'), '');
    fireEvent.press(screen.getByTestId('report-confirm'));
    expect(await screen.findByTestId('report-error')).toHaveTextContent(/several reports today/);
    expect(screen.getByTestId('report-confirm')).not.toBeDisabled();
  });

  it('shows the collector with their province only, and "Send report" waits for a reason', async () => {
    mockApi(routes());
    renderWithProviders(<ReportCollectorScreen />, { port: port() });
    // The province of the public profile, never its city (ADR 0017).
    await waitFor(() =>
      expect(screen.getByTestId('report-person-line')).toHaveTextContent('@collector2 · Quebec')
    );
    expect(screen.getByTestId('report-person-line')).not.toHaveTextContent(/Montréal/);
    await screen.findByText('Scam or fraud');
    const send = screen.getByTestId('report-confirm');
    expect(send).toHaveTextContent('Send report');
    expect(send).toBeDisabled();
    expect(screen.getByTestId('report-choose-first')).toHaveTextContent('Choose a reason first.');
    expect(screen.getByText(/never told who reported them/)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('report-reason-HARASSMENT'));
    expect(screen.getByTestId('report-confirm')).not.toBeDisabled();
    expect(screen.queryByTestId('report-choose-first')).toBeNull();
    expect(screen.getByTestId('report-reason-HARASSMENT')).toBeChecked();
    // The counter beside the label.
    fireEvent.changeText(screen.getByTestId('report-details'), 'Rude in the chat.');
    expect(screen.getByText('17 / 1000')).toBeOnTheScreen();
  });

  it('says a collector cannot report themselves', async () => {
    mockApi(
      routes({
        'POST /api/v1/reports/collectors': problem(422, 'CANNOT_REPORT_SELF', 'Self'),
      })
    );
    renderWithProviders(<ReportCollectorScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('report-reason-HARASSMENT'));
    fireEvent.press(screen.getByTestId('report-confirm'));
    expect(await screen.findByTestId('report-error')).toHaveTextContent(
      /You cannot report yourself\./
    );
  });

  it('refuses a link without a collector', () => {
    mockParams.current = {};
    mockApi(routes());
    renderWithProviders(<ReportCollectorScreen />, { port: port() });
    expect(screen.getByTestId('report-invalid')).toBeOnTheScreen();
  });
});

describe('My reports', () => {
  it('lists the reports with where each review stands', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/reports': ok([
          myReportFixture(),
          myReportFixture({
            id: 'rep-2',
            status: 'ACTIONED',
            reason: 'HARASSMENT',
            createdAt: '2026-09-01T12:00:00Z',
            resolvedAt: '2026-09-03T12:00:00Z',
            reportedUser: { id: 'u3', handle: 'collector3', displayName: 'Ana Rosemont' },
          }),
        ]),
      })
    );
    renderWithProviders(<MyReportsScreen />, { port: port() });
    expect(screen.getByTestId('reports-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('reports-summary')).toHaveTextContent(
      '1 waiting for a decision · 1 reviewed'
    );
    const first = myReportFixture();
    expect(screen.getByTestId(`report-reason-${first.id}`)).toHaveTextContent('Scam or fraud');
    expect(screen.getByTestId(`report-status-text-${first.id}`)).toHaveTextContent(
      'Waiting for a moderator'
    );
    expect(screen.getByTestId('report-status-text-rep-2')).toHaveTextContent(
      'Reviewed: the team took action'
    );
    // The status pills (stage R13): Open amber, Action taken teal.
    expect(screen.getByTestId(`report-status-${first.id}`)).toHaveTextContent('Open');
    expect(screen.getByTestId('report-status-rep-2')).toHaveTextContent('Action taken');
    expect(screen.getByTestId('report-rep-2')).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: expect.stringContaining('Action taken, Harassment') })
    );
    fireEvent.press(screen.getByText('Ana Rosemont'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector3' },
    });
  });

  it('colours each status pill as the spec names it (review fix 1)', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/reports': ok([
          myReportFixture({ id: 'open', status: 'OPEN' }),
          myReportFixture({ id: 'review', status: 'UNDER_REVIEW' }),
          myReportFixture({ id: 'done', status: 'ACTIONED', resolvedAt: '2026-10-05T12:00:00Z' }),
          myReportFixture({
            id: 'closed',
            status: 'DISMISSED',
            resolvedAt: '2026-10-05T12:00:00Z',
          }),
        ]),
      })
    );
    renderWithProviders(<MyReportsScreen />, { port: port(), scheme: 'dark' });
    await screen.findByTestId('reports-summary');
    // Open amber, Under review blue, Action taken teal, Dismissed grey (the dark scheme).
    const pills = darkPalette.settings;
    for (const [id, label, background, text] of [
      ['open', 'Open', pills.pillOpenBackground, pills.pillOpenText],
      ['review', 'Under review', pills.pillReviewBackground, pills.pillReviewText],
      ['done', 'Action taken', pills.pillDoneBackground, pills.pillDoneText],
      ['closed', 'Dismissed', pills.pillClosedBackground, pills.pillClosedText],
    ] as const) {
      const pill = screen.getByTestId(`report-status-${id}`);
      expect(pill).toHaveTextContent(label);
      expect(pill).toHaveStyle({ backgroundColor: background });
      expect(within(pill).getByText(label)).toHaveStyle({ color: text });
    }
    // Four different colours: no two statuses look alike.
    expect(
      new Set([
        pills.pillOpenBackground,
        pills.pillReviewBackground,
        pills.pillDoneBackground,
        pills.pillClosedBackground,
      ]).size
    ).toBe(4);
  });

  it('shows the empty state and an error with retry', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/reports': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok([])],
      })
    );
    renderWithProviders(<MyReportsScreen />, { port: port() });
    expect(await screen.findByTestId('reports-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByTestId('reports-empty')).toHaveTextContent(/You have not reported anyone/)
    );
  });
});
