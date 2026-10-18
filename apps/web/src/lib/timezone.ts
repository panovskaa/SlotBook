/**
 * The app's time zone comes from the API with every slot list. Until the first response arrives,
 * the browser's zone stands in; it only matters for which week counts as "this week".
 */
let appTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const getAppTimezone = () => appTimezone;

export function rememberAppTimezone(timezone: string): void {
  appTimezone = timezone;
}
