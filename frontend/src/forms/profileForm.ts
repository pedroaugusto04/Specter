import type { UserDto } from '@specter/contracts';

export interface ProfileFormValues {
  name: string;
  timezone: string;
  pageLanguage: string;
}

export function resolveUserLanguage(user: UserDto, fallbackLanguage: string): string {
  return user.pageLanguage || user.browserPageLanguage || fallbackLanguage;
}

export function resolveUserTimezone(user: UserDto, fallbackTimezone: string): string {
  return user.timezone || fallbackTimezone;
}

export function isProfileFormDirty(
  form: ProfileFormValues,
  user: UserDto,
  defaults: { language: string; timezone: string }
): boolean {
  return (
    (user.name ?? '') !== form.name.trim() ||
    resolveUserTimezone(user, defaults.timezone) !== form.timezone ||
    resolveUserLanguage(user, defaults.language) !== form.pageLanguage
  );
}

export function formToProfileUpdate(
  form: ProfileFormValues,
  user: UserDto,
  defaults: { language: string; timezone: string }
) {
  const currentTimezone = resolveUserTimezone(user, defaults.timezone);
  const currentLanguage = resolveUserLanguage(user, defaults.language);
  return {
    name: form.name.trim() || null,
    ...(form.timezone !== currentTimezone ? { timezone: form.timezone } : {}),
    ...(form.pageLanguage !== currentLanguage ? { pageLanguage: form.pageLanguage } : {}),
  };
}
