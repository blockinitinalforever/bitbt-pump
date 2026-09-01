import assert from "node:assert/strict";
import test from "node:test";
import { validateClaim } from "./claim-validation.mjs";

const vault = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const threshold = 1000n;
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const addressWord = (value) => value.slice(2).toLowerCase().padStart(64, "0");
const data = `0x10b8edce${addressWord(recipient)}${word(threshold)}`;
const entry = { vault_address: vault, recipient_address: recipient, transaction: { to: vault, data, value: "0x0", chain_id: "0x38" } };

test("accepts only the queue-bound claimForAtLeast transaction", () => {
  assert.deepEqual(validateClaim(entry, threshold), { transaction: entry.transaction, vault, recipient });
});

test("rejects changed target, recipient, threshold, selector, or native value", () => {
  assert.equal(validateClaim({ ...entry, transaction: { ...entry.transaction, to: recipient } }, threshold), null);
  assert.equal(validateClaim({ ...entry, recipient_address: vault }, threshold), null);
  assert.equal(validateClaim(entry, threshold + 1n), null);
  assert.equal(validateClaim({ ...entry, transaction: { ...entry.transaction, data: data.replace("10b8edce", "095ea7b3") } }, threshold), null);
  assert.equal(validateClaim({ ...entry, transaction: { ...entry.transaction, value: "0x1" } }, threshold), null);
  assert.equal(validateClaim({ ...entry, transaction: { ...entry.transaction, chain_id: "0x1" } }, threshold), null);
});
