const addressFromWord = (data, word) => `0x${data.slice(10 + word * 64 + 24, 10 + (word + 1) * 64)}`.toLowerCase();
const uintFromWord = (data, word) => BigInt(`0x${data.slice(10 + word * 64, 10 + (word + 1) * 64)}`);

export const validateClaim = (entry, threshold, chainId = "0x38") => {
  const transaction = entry?.transaction || {};
  const data = String(transaction.data || "").toLowerCase();
  const vault = String(entry?.vault_address || "").toLowerCase();
  const recipient = String(entry?.recipient_address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(vault) || !/^0x[0-9a-f]{40}$/.test(recipient)) return null;
  if (String(transaction.chain_id || transaction.chainId || "").toLowerCase() !== String(chainId).toLowerCase()) return null;
  if (String(transaction.to || "").toLowerCase() !== vault) return null;
  try {
    if (BigInt(transaction.value || "0x0") !== 0n || BigInt(threshold) <= 0n) return null;
  } catch {
    return null;
  }
  if (!/^0x10b8edce[0-9a-f]{128}$/.test(data)) return null;
  if (addressFromWord(data, 0) !== recipient || uintFromWord(data, 1) !== BigInt(threshold)) return null;
  return { transaction, vault, recipient };
};
