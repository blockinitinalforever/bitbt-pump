"use client";

import { useEffect, useRef, useState } from "react";
import { getInjectedEvmProvider } from "@/lib/evm-provider";
import { switchToBsc } from "@/lib/pump-chain";
function buildSiweMessage(domain: string, address: string, nonce: string) {
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to BitBT PUMP.\n\nURI: https://${domain}\nVersion: 1\nChain ID: 56\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
}

function expectedSiweDomain(): string {
  return process.env.NEXT_PUBLIC_PUMP_SIWE_DOMAIN?.trim().toLowerCase() || "bitbt.fun";
}

export default function PumpWalletConnect({ compact = false, onConnected }: { compact?: boolean; onConnected?: (address: string) => void }) {
  const [address, setAddress] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const onConnectedRef = useRef(onConnected);
  const syncedAddressRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    const provider = getInjectedEvmProvider();
    const syncAddress = (nextAddress?: string) => {
      const normalized = nextAddress?.toLowerCase() || "";
      if (syncedAddressRef.current === normalized) return;
      syncedAddressRef.current = normalized;
      setAddress(normalized || undefined);
      onConnectedRef.current?.(normalized);
    };
    const onSharedWallet = (event: Event) => syncAddress((event as CustomEvent<string>).detail);
    const onAccountsChanged = () => {
      sessionStorage.removeItem("bitbt_pump_session");
      syncAddress(undefined);
    };
    window.addEventListener("bitbt:pump-wallet", onSharedWallet);
    provider?.on?.("accountsChanged", onAccountsChanged);
    void provider?.request({ method: "eth_accounts" }).then((accounts) => {
      const current = Array.isArray(accounts) ? String(accounts[0] || "") : "";
      if (current && sessionStorage.getItem("bitbt_pump_session")) syncAddress(current);
    });
    return () => {
      window.removeEventListener("bitbt:pump-wallet", onSharedWallet);
      provider?.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const connect = async () => {
    setError(undefined);
    const provider = getInjectedEvmProvider();
    if (!provider) { setError("No EVM wallet detected"); return; }
    setBusy(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("No wallet account returned");
      await switchToBsc(provider);
      const nonceResponse = await fetch("/api/pump/v1/auth/siwe/nonce", { cache: "no-store" });
      const noncePayload = await nonceResponse.json();
      const { nonce, domain } = noncePayload.data || {};
      const expectedDomain = expectedSiweDomain();
      if (!nonce || !domain || String(domain).trim().toLowerCase() !== expectedDomain) throw new Error("SIWE domain is not trusted");
      const message = buildSiweMessage(expectedDomain, address, nonce);
      const signature = await provider.request({ method: "personal_sign", params: [message, address] }) as string;
      const verifyResponse = await fetch("/api/pump/v1/auth/siwe/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyPayload.data?.token) throw new Error(verifyPayload.error || "SIWE verification failed");
      sessionStorage.setItem("bitbt_pump_session", verifyPayload.data.token);
      const verifiedAddress = verifyPayload.data.address || address;
      syncedAddressRef.current = verifiedAddress.toLowerCase();
      setAddress(verifiedAddress);
      onConnected?.(verifiedAddress);
      window.dispatchEvent(new CustomEvent("bitbt:pump-wallet", { detail: verifiedAddress }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Wallet connection failed"); }
    finally { setBusy(false); }
  };

  return <div className="pump-wallet-connect flex flex-col items-start gap-2"><button type="button" onClick={() => { if (!address) void connect(); }} disabled={busy || !!address} className={`${compact ? "px-4 py-2 text-xs" : "px-6 py-3.5 text-sm"} rounded-full bg-[#d9ff46] font-semibold text-[#101210] transition hover:bg-white disabled:cursor-default disabled:opacity-60`}>{busy ? "Connecting…" : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"}</button>{error && <p role="alert" className="max-w-xs text-xs text-red-300">{error}</p>}</div>;
}
