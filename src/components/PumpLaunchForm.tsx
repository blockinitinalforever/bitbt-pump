"use client";

import { useCallback, useState } from "react";
import {
  pumpLaunchApi,
  type LaunchFeeInfo,
  type PreparedLaunch,
  type PrepareLaunchInput,
} from "@/lib/pump-api";
import PumpWalletConnect from "@/components/PumpWalletConnect";
import { getQuoteTokenAddress, isAddress } from "@/lib/pump-chain";
import {
  assertBscRuntimeChain,
  assertPreparedLaunchBinding,
  encodeLaunchTokenData,
} from "@/lib/pump-launch";
import { getInjectedEvmProvider, type EvmProvider } from "@/lib/evm-provider";

const GAS_LIMIT = "0x3567e0";

async function waitForReceipt(
  provider: EvmProvider,
  hash: string,
): Promise<{ status?: string }> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    if (receipt && typeof receipt === "object") {
      const typed = receipt as { status?: string };
      if (typed.status !== undefined) return typed;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("Launch receipt timed out; check BscScan");
}

export default function PumpLaunchForm({ zh }: { zh: boolean }) {
  const [address, setAddress] = useState("");
  const [fee, setFee] = useState<LaunchFeeInfo>();
  const [prepared, setPrepared] = useState<PreparedLaunch>();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [quoteToken, setQuoteToken] =
    useState<PrepareLaunchInput["quote_token"]>("BNB");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [classification, setClassification] = useState("Meme");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoName, setLogoName] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const loadFee = useCallback(async () => {
    try {
      setFee(await pumpLaunchApi.fee());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const execute = async () => {
    setError("");
    setPrepared(undefined);
    setTxHash("");
    const provider = getInjectedEvmProvider();
    if (!provider || !address)
      throw new Error(
        zh ? "请先连接 BNB Chain 钱包" : "Connect a BNB Chain wallet first",
      );
    if (!name.trim() || !symbol.trim())
      throw new Error(
        zh ? "请填写代币名称和符号" : "Token name and symbol are required",
      );
    setBusy(true);
    let broadcastHash = "";
    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      const current = Array.isArray(accounts) ? String(accounts[0] || "") : "";
      if (current.toLowerCase() !== address.toLowerCase())
        throw new Error("Connected wallet account changed; reconnect");
      const currentFee = fee || (await pumpLaunchApi.fee());
      if (!isAddress(currentFee.factory_address))
        throw new Error("Launch fee configuration is unavailable");
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x38" }],
      });
      assertBscRuntimeChain(await provider.request({ method: "eth_chainId" }));
      const input: PrepareLaunchInput = {
        creator_address: address,
        token_name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        total_supply: "1000000000",
        decimals: 18,
        mintable: false,
        burnable: false,
        chain_id: "bsc",
        quote_token: quoteToken,
        logo_url: logoUrl || undefined,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        telegram: telegram.trim() || undefined,
        classification: classification.trim() || undefined,
      };
      setPhase(zh ? "准备发币参数…" : "Preparing launch…");
      const nextPrepared = await pumpLaunchApi.prepare(input);
      assertPreparedLaunchBinding(
        nextPrepared,
        currentFee,
        address,
        input,
        getQuoteTokenAddress(input.quote_token),
      );
      setPrepared(nextPrepared);
      const data = encodeLaunchTokenData(nextPrepared);
      const beforeSendAccounts = await provider.request({
        method: "eth_accounts",
      });
      const beforeSendAccount = Array.isArray(beforeSendAccounts)
        ? String(beforeSendAccounts[0] || "")
        : "";
      if (beforeSendAccount.toLowerCase() !== address.toLowerCase())
        throw new Error("Connected wallet account changed; reconnect");
      assertBscRuntimeChain(await provider.request({ method: "eth_chainId" }));
      setPhase(
        zh ? "等待钱包确认发币交易…" : "Waiting for wallet confirmation…",
      );
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: nextPrepared.factory_address,
            data,
            value: `0x${BigInt(currentFee.fee_wei).toString(16)}`,
            gas: GAS_LIMIT,
          },
        ],
      });
      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
        throw new Error("Wallet did not return a launch transaction hash");
      broadcastHash = hash;
      setTxHash(hash);
      setPhase(
        zh
          ? "已广播，等待发币回执…"
          : "Broadcasted; waiting for launch receipt…",
      );
      const receipt = await waitForReceipt(provider, hash);
      if (receipt.status !== "0x1" && receipt.status !== "0x01")
        throw new Error("Token launch transaction failed");
      setPhase(
        zh
          ? "回执成功，确认发币状态…"
          : "Receipt succeeded; confirming launch status…",
      );
      const result = await pumpLaunchApi.confirm({
        launch_id: nextPrepared.launch.id,
        deploy_tx_hash: hash,
      });
      if (result.status !== "deployed" && result.status !== "migrated")
        throw new Error(
          result.rejection_reason || `Launch ended in ${result.status}`,
        );
      setPhase(
        `${zh ? "发币完成" : "Token launched"}: ${result.contract_address || hash}`,
      );
    } catch (cause) {
      if (!broadcastHash) setPrepared(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase(
        broadcastHash
          ? zh
            ? "交易失败，请查看回执"
            : "Transaction failed; inspect the receipt"
          : "",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto mt-16 max-w-7xl rounded-[2rem] border border-black/10 bg-white/70 p-6 sm:p-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#777]">
            {zh ? "外部发币" : "Launch a token"}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] sm:text-5xl">
            {zh ? "从 Web 端发布你的项目" : "Launch your project from the Web"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#666]">
            {zh
              ? "所有参数先由 API 绑定，再由你的 BNB Chain 钱包签名、广播并等待真实回执。"
              : "The API binds every parameter before your BNB Chain wallet signs, broadcasts and confirms the real receipt."}
          </p>
        </div>
        <PumpWalletConnect
          compact
          onConnected={(nextAddress) => {
            setAddress(nextAddress);
            void loadFee();
          }}
        />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[#666]">
          {zh ? "代币名称" : "Token name"}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
            placeholder="My Token"
          />
        </label>
        <label className="text-xs text-[#666]">
          {zh ? "符号" : "Symbol"}
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm uppercase"
            placeholder="MTK"
          />
        </label>
        <label className="text-xs text-[#666]">
          {zh ? "报价币" : "Quote token"}
          <select
            value={quoteToken}
            onChange={(event) =>
              setQuoteToken(
                event.target.value as PrepareLaunchInput["quote_token"],
              )
            }
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
          >
            <option>BNB</option>
            <option>USDT</option>
            <option>USDC</option>
            <option>USD1</option>
          </select>
        </label>
        <label className="text-xs text-[#666] sm:col-span-2">
          {zh ? "项目简介" : "Description"}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
            className="mt-2 min-h-24 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
            placeholder={
              zh ? "项目简介（可选）" : "Project description (optional)"
            }
          />
        </label>
        <label className="text-xs text-[#666]">
          {zh ? "分类" : "Classification"}
          <input
            value={classification}
            onChange={(event) => setClassification(event.target.value)}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
          />
        </label>
        <label className="text-xs text-[#666]">
          Website
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
            placeholder="https://"
          />
        </label>
        <label className="text-xs text-[#666]">
          Telegram
          <input
            value={telegram}
            onChange={(event) => setTelegram(event.target.value)}
            disabled={busy}
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
            placeholder="https://t.me/"
          />
        </label>
      </div>
    <div className="mt-6 rounded-2xl border border-black/10 bg-white p-4 text-sm">
      <label className="text-xs text-[#666]">
        {zh ? "代币 Logo" : "Token logo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || uploadingLogo}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              setError(zh ? "Logo 最大 5MB" : "Logo must be 5MB or smaller");
              return;
            }
            setUploadingLogo(true);
            setError("");
            try {
              const uploaded = await pumpLaunchApi.uploadImage(file);
              setLogoUrl(uploaded.url);
              setLogoName(file.name);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
              setUploadingLogo(false);
            }
          }}
          className="mt-2 block w-full"
        />
        {uploadingLogo ? (
          <span className="mt-1 block text-xs text-[#777]">{zh ? "上传中…" : "Uploading…"}</span>
        ) : logoName ? (
          <span className="mt-1 block truncate text-xs text-[#777]">{logoName}</span>
        ) : null}
      </label>
    </div>
    <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-[#101210] p-5 text-sm text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-white/60">{zh ? "发币费用" : "Launch fee"}</p>
          <p className="mt-1 text-xl font-semibold">
            {fee
              ? `${fee.amount_bnb} BNB + ${fee.gas_reserve_bnb} BNB gas reserve`
              : zh
                ? "加载中…"
                : "Loading…"}
          </p>
          {prepared && (
            <p className="mt-2 break-all text-xs text-white/50">
              Predicted token: {prepared.predicted_token_address}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void execute()}
          disabled={busy || !fee}
          className="rounded-xl bg-[#d9ff46] px-5 py-3 font-semibold text-[#101210] disabled:opacity-50"
        >
          {busy
            ? phase || (zh ? "处理中…" : "Working…")
            : zh
              ? "连接钱包并发币"
              : "Connect and launch"}
        </button>
      </div>
      {phase && (
        <p className="mt-4 break-all text-sm text-[#555]">
          {phase}{" "}
          {txHash && (
            <a
              className="text-[#1769e0]"
              href={`https://bscscan.com/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {txHash}
            </a>
          )}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 break-words rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}
