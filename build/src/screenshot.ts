// The file name a screenshot downloads as, from the moment it was taken (UTC, so it does not depend on
// the person's clock settings): sortable, and never the same twice across two different seconds.
const two = (value: number): string => String(value).padStart(2, '0')

export function screenshotFilename(date: Date): string {
  const day = [date.getUTCFullYear(), two(date.getUTCMonth() + 1), two(date.getUTCDate())].join('-')
  const time = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map(two).join('')
  return `3d-viewer-${day}-${time}.png`
}
