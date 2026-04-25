export const SDK_KEY = process.env.EXPO_PUBLIC_MOTISIG_SDK_KEY ?? '';
export const PROJECT_ID = process.env.EXPO_PUBLIC_MOTISIG_PROJECT_ID ?? '';
export const DEMO_USER_ID = 'demo-user-expo';

export const hasEnv = Boolean(SDK_KEY && PROJECT_ID);
