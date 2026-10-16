/* eslint-env jest */
import { configure } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

// findBy*/waitFor wait up to 10 s (default 1 s): multi-step screen tests stay deterministic when
// the machine is busy (parallel workers, an Android emulator running next to them).
configure({ asyncUtilTimeout: 10_000 });

// --- Native module mocks -----------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js')
);

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

// The device language: English unless a test sets `require('expo-localization').mockLocales`.
jest.mock('expo-localization', () => {
  const mockLocales: { languageCode: string | null; languageTag: string }[] = [
    { languageCode: 'en', languageTag: 'en-CA' },
  ];
  return { __esModule: true, mockLocales, getLocales: () => mockLocales };
});

// The phone's secure storage (saved shipping details, stage R4): an in-memory keychain per test
// file; `require('expo-secure-store').mockStore` lets a test look inside.
jest.mock('expo-secure-store', () => {
  const mockStore = new Map<string, string>();
  return {
    __esModule: true,
    mockStore,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  };
});

// `react-native-safe-area-context` provides a jest mock (default export) with zero insets.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default
);

// --- No long timer outlives its test file ---------------------------------------------------------
//
// A real timer still armed when a test file is done keeps its jest worker alive: jest then kills
// the worker and prints "A worker process has failed to exit gracefully" at the end of the run,
// without saying which file. The usual cause is a mocked request that never answers under real
// timers: the read timeout of the API client (`withReadTimeout`, 20 s) stays armed behind it.
// A file that leaves such a timer fails here, and is told where the timer was armed. The cure is
// in the test: hold the answer back and give it before the test ends, or use fake timers.

const LONG_TIMER_MS = 5_000;
const armedTimers = new Map<unknown, { delay: number; where: string }>();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

function guardedSetTimeout(
  handler: (...given: unknown[]) => void,
  delay?: number,
  ...args: unknown[]
): ReturnType<typeof setTimeout> {
  const timer: ReturnType<typeof setTimeout> = realSetTimeout(
    (...given: unknown[]) => {
      armedTimers.delete(timer);
      handler(...given);
    },
    delay,
    ...args
  );
  if (typeof delay === 'number' && delay >= LONG_TIMER_MS) {
    const where = (new Error().stack ?? '')
      .split('\n')
      .slice(2)
      .filter((line) => !line.includes('node_modules'))
      .slice(0, 4)
      .join('\n');
    armedTimers.set(timer, { delay, where });
  }
  return timer;
}

// Node's own properties of `setTimeout` (its promise form) stay on the guarded one.
globalThis.setTimeout = Object.assign(guardedSetTimeout, realSetTimeout) as typeof setTimeout;
globalThis.clearTimeout = ((timer?: Parameters<typeof clearTimeout>[0]) => {
  armedTimers.delete(timer);
  realClearTimeout(timer);
}) as typeof clearTimeout;

afterAll(async () => {
  // A read that is on its way when the last test ends is answered within a few milliseconds.
  for (let waited = 0; armedTimers.size > 0 && waited < 1_000; waited += 20) {
    await new Promise((resolve) => realSetTimeout(resolve, 20));
  }
  const left = [...armedTimers.values()];
  for (const timer of armedTimers.keys()) {
    realClearTimeout(timer as Parameters<typeof clearTimeout>[0]);
  }
  armedTimers.clear();
  if (left.length > 0) {
    throw new Error(
      `${left.length} timer(s) of ${LONG_TIMER_MS / 1000} s or more were still armed when this ` +
        'test file ended (its jest worker could not have exited). A request that never ' +
        'answers keeps the read timeout of the API client armed: answer it before the test ' +
        'ends, or use fake timers.\n' +
        left.map((timer) => `A timer of ${timer.delay} ms armed\n${timer.where}`).join('\n')
    );
  }
});

// --- Quiet known-noisy warnings ------------------------------------------------------------------

const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('not wrapped in act(')) {
      return;
    }
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
