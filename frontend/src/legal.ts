// Facts the Privacy Policy and Terms of Use rely on. Keep them true:
//  * EFFECTIVE_DATE_ISO must equal TERMS_VERSION in backend/app/legal.py.
//  * The retention periods must match backend/app/legal.py (enforced there).
export const LEGAL = {
  operator: 'QAIbridge',
  effectiveDate: '1 October 2026',
  effectiveDateIso: '2026-10-01',
  minimumAge: 13,
  deletedAccountDays: 30,
  contactMessageMonths: 12,
  logDays: 30,
  responseDays: 30,
  tokenDays: 7,
  codeMinutes: 10,
  codeAttempts: 5,
  spamIpMinutes: 15,
  liabilityCap: 'PKR 5,000',
} as const;
