export type EntryRoute = '/' | '/login' | '/register' | '/onboarding' | '/app';

// A missing flag belongs to a legacy profile; only explicit false requires setup.
export function resolveEntryRoute(path: string, authenticated: boolean, onboardingCompleted?: boolean): EntryRoute {
  if (authenticated) return onboardingCompleted === false ? '/onboarding' : '/app';
  return path === '/login' || path === '/register' ? path : '/';
}
