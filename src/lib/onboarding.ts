/**
 * One-time "on the fly" onboarding tips.
 *
 * Responsibilities:
 * - Remember which first-use tips have already been shown.
 *
 * Contracts:
 * - Tips are app-level (localStorage), not per-vault, and never expire.
 * - Parsing tolerates hand-edited or corrupted storage by treating it as empty.
 */

export const onboardingTipsStorageKey = "glyphary.onboardingTips";

export type OnboardingTip = {
  id: string;
  title: string;
  body: string;
};

export function parseSeenOnboardingTips(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");

    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function serializeSeenOnboardingTips(seen: string[], id: string) {
  return JSON.stringify(seen.includes(id) ? seen : [...seen, id]);
}

export function hasSeenOnboardingTip(id: string) {
  return parseSeenOnboardingTips(
    window.localStorage.getItem(onboardingTipsStorageKey),
  ).includes(id);
}

export function markOnboardingTipSeen(id: string) {
  const seen = parseSeenOnboardingTips(window.localStorage.getItem(onboardingTipsStorageKey));

  window.localStorage.setItem(onboardingTipsStorageKey, serializeSeenOnboardingTips(seen, id));
}

export const onboardingTipsEnabledStorageKey = "glyphary.onboardingTipsEnabled";

export function parseOnboardingTipsEnabled(raw: string | null) {
  // Hints are on unless explicitly disabled; unknown values stay enabled.
  return raw !== "false";
}

export function readOnboardingTipsEnabled() {
  return parseOnboardingTipsEnabled(
    window.localStorage.getItem(onboardingTipsEnabledStorageKey),
  );
}

export function writeOnboardingTipsEnabled(enabled: boolean) {
  window.localStorage.setItem(onboardingTipsEnabledStorageKey, enabled ? "true" : "false");
}

export function resetSeenOnboardingTips() {
  window.localStorage.removeItem(onboardingTipsStorageKey);
}
