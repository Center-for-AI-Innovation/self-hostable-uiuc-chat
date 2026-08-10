// Super-admin allowlist, sourced entirely from env — no hardcoded emails.
// SUPER_ADMIN_EMAILS is server-only and drives API-route authorization.
// NEXT_PUBLIC_SUPER_ADMIN_EMAILS is inlined into the client bundle at build
// time so UI components (ProjectTable, EmailListAccordion) can filter/pin the
// same list — set both to the same value. Comma-separated, case-insensitive.
// The effective list is the union of the two, lowercased and deduped.

function parseEmails(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export const superAdmins: string[] = Array.from(
  new Set([
    ...parseEmails(process.env.SUPER_ADMIN_EMAILS),
    ...parseEmails(process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS),
  ]),
)

export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false
  return superAdmins.includes(email.toLowerCase())
}
