// Calendar arithmetic on the user's already-resolved local YYYY-MM-DD date.
// UTC noon prevents the server's timezone and DST from changing those dates.
export function coachDates(today: string, length = 7, offset = 0): string[] {
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length }, (_, index) => {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day - length + 1 + index - offset);
    date.setUTCHours(12, 0, 0, 0);
    return date.toISOString().slice(0, 10);
  });
}
