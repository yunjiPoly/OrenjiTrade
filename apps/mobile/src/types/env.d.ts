/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_FIREBASE_API_KEY?: string;
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
    EXPO_PUBLIC_FIREBASE_PROJECT_ID?: string;
    EXPO_PUBLIC_FIREBASE_APP_ID?: string;
    EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST?: string;
    EAS_PROJECT_ID?: string;
  }
}
