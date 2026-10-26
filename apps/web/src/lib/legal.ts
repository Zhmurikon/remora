export const PDN_CONSENT_VERSION = '2026-10-26';
export const OFFER_VERSION = '2026-10-26';

export function isUnder14(value: string): boolean {
  if (!value) return false;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age < 14;
}
