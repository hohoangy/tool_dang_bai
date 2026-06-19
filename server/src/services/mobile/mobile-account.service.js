export function sanitizeAccount(account) {
  if (!account) return account;
  const output = account.toJSON ? account.toJSON() : { ...account };
  if (output.metadata?.password) output.metadata = { ...output.metadata, password: '' };
  return output;
}
