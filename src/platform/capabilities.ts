import { isDesktop, isNative } from './desktop';

/** Native presence matters: an Android browser is still the web app. */
export const platformCapabilities = {
  exit: isDesktop,
  cameraCutouts: isNative && /Android/i.test(navigator.userAgent),
};
