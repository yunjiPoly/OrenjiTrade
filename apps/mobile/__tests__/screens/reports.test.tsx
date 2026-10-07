import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ReportCollectorScreen from '@/app/report';
import MyReportsScreen from '@/app/settings/reports';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { OTHER_ID, REPORT_REASONS, myReportFixture } from '../support/fixtures';
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
    ...extra,
  });
}

const port = () => new FakeAuthPort(testUser());

describe('Report collector', () => {
  it('needs a reason, sends the context with an idempotency key, then confirms', async () => {
    const api = mockApi(routes());
    const release = api.hold();
    await renderWithProviders(<ReportCollectorScreen />, { port: port() });
    expect(screen.getByTestId('report-target')).toHaveTextContent('Noé Verdun');
    expect(screen.getByTestId('report-reasons-loading')).toBeOnTheScreen();
    release();
    expect(await screen.findByText('Scam or fraud')).toBeOnTheScreen();
    expect(screen.getByText('Took payment or cards and disappeared.')).toBeOnTheScreen();
    // Confirm stays disabled until a reason is chosen.
    expect(screen.getByTestId('report-confirm')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('report-reason-SCAM'));
    await fireEvent.changeText(screen.getByTestId('report-details'), '  Never showed up.  ');
    await fireEvent.press(screen.getByTestId('report-confirm'));
    expect(await screen.findByTestId('report-sent')).toHaveTextContent(
      /Thank you. Our moderation team will review your report about Noé Verdun/
    );
    const call = api.callsTo('POST /api/v1/reports/collectors')[0];
    expect(call?.body).toEqual({
      reportedUserId: OTHER_ID,
      reason: 'SCAM',
      details: 'Never showed up.',
      context: { source: 'CONVERSATION', conversationId: 'conv-1' },
    });
    expect(call?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    await fireEvent.press(screen.getByTestId('report-my-reports'));
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
    await renderWithProviders(<ReportCollectorScreen />, { port: port() });
    await fireEvent.press(await screen.findByTestId('report-reason-HARASSMENT'));
    await fireEvent.press(screen.getByTestId('report-confirm'));
    expect(await screen.findByTestId('report-error')).toHaveTextContent(
      /You already reported Noé Verdun/
    );
    expect(screen.getByTestId('report-confirm')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('report-open-my-reports'));
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
    await renderWithProviders(<ReportCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('report-reasons-error')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await fireEvent.press(await screen.findByTestId('report-reason-OTHER'));
    await fireEvent.changeText(screen.getByTestId('report-details'), 'x'.repeat(1001));
    expect(screen.getByText('Keep the details under 1000 characters.')).toBeOnTheScreen();
    expect(screen.getByTestId('report-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('report-details'), '');
    await fireEvent.press(screen.getByTestId('report-confirm'));
    expect(await screen.findByTestId('report-error')).toHaveTextContent(/several reports today/);
    expect(screen.getByTestId('report-confirm')).not.toBeDisabled();
  });

  it('refuses a link without a collector', async () => {
    mockParams.current = {};
    mockApi(routes());
    await renderWithProviders(<ReportCollectorScreen />, { port: port() });
    expect(screen.getByTestId('report-invalid')).toBeOnTheScreen();
  });
});

describe('My reports', () => {
  it('lists the reports with where each review stands', async () => {
    const api = mockApi(
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
    const release = api.hold();
    await renderWithProviders(<MyReportsScreen />, { port: port() });
    expect(screen.getByTestId('reports-loading')).toBeOnTheScreen();
    release();
    expect(await screen.findByTestId('reports-summary')).toHaveTextContent(
      '1 waiting for a decision · 1 reviewed'
    );
    const first = myReportFixture();
    expect(screen.getByTestId(`report-reason-${first.id}`)).toHaveTextContent('Scam or fraud');
    expect(screen.getByTestId(`report-status-text-${first.id}`)).toHaveTextContent(
      'Waiting for a moderator'
    );
    expect(screen.getByTestId('report-status-text-rep-2')).toHaveTextContent(
      'Reviewed — the team took action'
    );
    expect(screen.getByLabelText('Status: Action taken')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Ana Rosemont'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector3' },
    });
  });

  it('shows the empty state and an error with retry', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/reports': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok([])],
      })
    );
    await renderWithProviders(<MyReportsScreen />, { port: port() });
    expect(await screen.findByTestId('reports-error')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByTestId('reports-empty')).toHaveTextContent(/You have not reported anyone/)
    );
  });
});
