import { FakeOcrProvider, type FakeCardText } from '@/src/features/scan/ocr/fakeOcrProvider';
import type { CardScanMatch, ScanRead } from '@/src/features/scan/types';

import { ok, type MockAnswer, type MockRequest, type MockRoutes } from './mockApi';
import { signedInRoutes } from './routes';
import { FOUND_YEW, FOX, notFound, PICK_PRINTING_FOX, PICK_RARITY_LANTERN } from './scanFixtures';

/**
 * Stand-ins for the scan's screen tests: the camera (`expo-camera`), the device's reader, photo
 * files, the photo library, and the matcher behind the fake API. Use in a test file with:
 *
 *   jest.mock('expo-camera', () => require('../support/scanScreen').expoCameraMock());
 *   jest.mock('@/src/features/scan/ocr/deviceOcr', () =>
 *     require('../support/scanScreen').deviceOcrMock());
 *   jest.mock('expo-file-system', () => require('../support/scanScreen').fileSystemMock());
 *
 * Every card and photo is fictional (`scanFixtures.ts`); a "photo" is a file name and the text a
 * test says it holds.
 */

type Permission = {
  granted: boolean;
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
  expires: 'never';
};

export const GRANTED: Permission = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
};
export const UNDETERMINED: Permission = {
  granted: false,
  status: 'undetermined',
  canAskAgain: true,
  expires: 'never',
};
export const DENIED: Permission = {
  granted: false,
  status: 'denied',
  canAskAgain: false,
  expires: 'never',
};

export interface Picture {
  uri: string;
  width: number;
  height: number;
}

/** The camera of the tests: its permission, its lenses, and the pictures its shutter gives. */
export const mockCamera = {
  permission: GRANTED as Permission | null,
  /** What asking for the permission answers. */
  answer: GRANTED as Permission,
  request: jest.fn(),
  /** iOS lenses of the back camera: none on a phone without a camera (the simulator). */
  lenses: ['Back Camera'] as string[],
  mountError: false,
  /** The pictures the next taps give, in order. */
  pictures: [] as Picture[],
  /** The options of every `takePictureAsync`. */
  taken: [] as unknown[],
  torch: false,
};

export function expoCameraMock() {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef(function CameraView(
    props: {
      testID?: string;
      enableTorch?: boolean;
      onCameraReady?: () => void;
      onMountError?: (event: { message: string }) => void;
    },
    ref: unknown
  ) {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async (options: unknown) => {
        mockCamera.taken.push(options);
        const next = mockCamera.pictures.shift();
        if (!next) {
          throw new Error('The camera gave no picture');
        }
        return next;
      },
      getAvailableLensesAsync: async () => mockCamera.lenses,
    }));
    mockCamera.torch = props.enableTorch === true;
    React.useEffect(() => {
      if (mockCamera.mountError) {
        props.onMountError?.({ message: 'Camera could not be started' });
      } else {
        props.onCameraReady?.();
      }
      // Once, like the camera's own events.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement(View, { testID: props.testID });
  });
  return {
    __esModule: true,
    CameraView,
    useCameraPermissions: () => {
      const [permission, setPermission] = React.useState(mockCamera.permission);
      const request = React.useCallback(async () => {
        mockCamera.request();
        setPermission(mockCamera.answer);
        return mockCamera.answer;
      }, []);
      return [permission, request, async () => permission];
    },
  };
}

/** The device's reader of the tests: none (Expo Go, the web) or the fake one. */
export const mockReader: { provider: FakeOcrProvider | null } = { provider: null };

export function deviceOcrMock() {
  return {
    __esModule: true,
    getDeviceOcrProvider: () => mockReader.provider,
    isDeviceOcrAvailable: () => mockReader.provider !== null,
    resetDeviceOcrProvider: () => undefined,
  };
}

/** The photo files the scan deleted. */
export const mockFiles = { deleted: [] as string[] };

export function fileSystemMock() {
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return true;
    }
    delete() {
      mockFiles.deleted.push(this.uri);
    }
  }
  return { __esModule: true, File, Paths: {} };
}

/** A library photo the picker hands over (its copy in the app's cache). */
export function libraryPhoto(name: string): Picture {
  return { uri: `file:///cache/ImagePicker/${name}.jpg`, width: 3000, height: 4000 };
}

/** A camera photo, upright, as the camera hands it over. */
export function cameraPhoto(name: string): Picture {
  return { uri: `file:///cache/Camera/${name}.jpg`, width: 3024, height: 4032 };
}

/** What the fictional photos hold, read whole (library) or in the frame's areas (camera). */
export const PHOTO_TEXT = {
  yew: { whole: ['Yew Flowers & Velvet Breeze', 'ZACR-EN036'], turned: {} },
  lantern: { whole: ['Endless Lantern', 'ZRA1-EN075'], turned: {} },
  fox: { whole: [FOX.name], turned: {} },
  blank: { whole: [], turned: {} },
  yewInFrame: { name: ['Yew Flowers & Velvet Breeze'], setCode: ['ZACR-EN036'] },
} satisfies Record<string, FakeCardText>;

/** The reader of a test: each photo file holds the text given. */
export function readerOf(photos: Record<string, FakeCardText>): FakeOcrProvider {
  const provider = new FakeOcrProvider(photos);
  mockReader.provider = provider;
  return provider;
}

/** The matcher's answer for a read (the fake API's `POST /cards/scan-match`). */
export function answerFor(read: ScanRead): CardScanMatch {
  const code = read.codes[0];
  if (code === 'ZACR-EN036') {
    return FOUND_YEW;
  }
  if (code === 'ZRA1-EN075') {
    return PICK_RARITY_LANTERN;
  }
  if (read.names[0] === FOX.name) {
    return PICK_PRINTING_FOX;
  }
  return notFound(read);
}

export function matchAnswer(request: MockRequest): MockAnswer {
  return ok(answerFor(request.body as ScanRead));
}

/** A signed-in collector with the scan on, and the matcher. */
export function scanRoutes(overrides: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/public/feature-flags': ok({ cardTextScan: true, publicChat: true }),
    'POST /api/v1/cards/scan-match': matchAnswer,
    ...overrides,
  });
}

export function resetScanMocks(): void {
  mockCamera.permission = GRANTED;
  mockCamera.answer = GRANTED;
  mockCamera.request.mockClear();
  mockCamera.lenses = ['Back Camera'];
  mockCamera.mountError = false;
  mockCamera.pictures = [];
  mockCamera.taken = [];
  mockCamera.torch = false;
  mockReader.provider = null;
  mockFiles.deleted = [];
}
