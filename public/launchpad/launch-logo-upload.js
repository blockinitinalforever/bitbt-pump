(() => {
  const input = document.getElementById("token-logo-file");
  const button = document.querySelector("[data-launch-file]");
  if (!input || !button) return;
  const MAX_LOGO_BYTES = 5 * 1024 * 1024;
  const toast = (message) => window.dispatchEvent(new CustomEvent("bitbt:toast", { detail: message }));
  const fileName = document.querySelector("[data-launch-file-name]");
  const uploadError = (error, status = 0) => {
    const message = String(error?.message || error || "");
    if (status === 413 || /too large|payload_too_large/i.test(message)) return "图片不能超过 5MB，请压缩后重新选择";
    if (status === 401 || /SIWE session|required.*session|登录已过期/i.test(message)) return "登录已过期，请重新连接钱包后上传";
    if (status === 429 || /rate limit|too many/i.test(message)) return "上传过于频繁，请一分钟后重试";
    if (status >= 500 || /S3 upload|temporarily unavailable|service unavailable/i.test(message)) return "图片服务暂时不可用，请稍后重试";
    if (error?.name === "AbortError" || /timeout|timed out/i.test(message)) return "上传超时，请检查网络后重试";
    if (/failed to fetch|networkerror|network error|load failed|connection/i.test(message)) return "网络连接中断，请检查网络后重试";
    if (/unsupported|invalid image|file type/i.test(message)) return "图片格式无效，请选择 PNG、JPG 或 WEBP";
    return /[\u3400-\u9fff]/.test(message) ? message : "Logo 上传失败，请稍后重试";
  };
  button.addEventListener("click", () => { input.value = ""; input.click(); });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      input.value = "";
      if (fileName) fileName.textContent = "文件过大";
      toast("图片不能超过 5MB，请压缩后重新选择");
      return;
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      input.value = "";
      if (fileName) fileName.textContent = "格式不支持";
      toast("图片格式无效，请选择 PNG、JPG 或 WEBP");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => { if (fileName) fileName.textContent = "读取失败"; toast("无法读取图片，请重新选择文件"); };
    reader.onabort = () => { if (fileName) fileName.textContent = "已取消"; toast("已取消读取图片"); };
    reader.onload = async () => {
      const session = sessionStorage.getItem("bitbt_pump_session");
      if (!session) { if (fileName) fileName.textContent = "请先连接钱包"; toast("请先连接并验证钱包后上传 Logo"); return; }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      try {
        button.disabled = true;
        if (fileName) fileName.textContent = "正在上传…";
        const response = await fetch("/api/pump/v1/upload/image", { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${session}` }, body: JSON.stringify({ image: reader.result, filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "-") }), cache: "no-store", signal: controller.signal });
        const raw = await response.text();
        let payload = {};
        try { payload = JSON.parse(raw); } catch { payload = { error: response.status === 413 ? "Image too large" : "Invalid upload response" }; }
        const url = payload?.data?.url;
        if (!response.ok || !url) { const error = new Error(payload?.error || "Logo upload failed"); error.status = response.status; throw error; }
        document.documentElement.dataset.launchLogoUrl = url;
        const art = document.getElementById("create-art");
        if (art) { art.textContent = ""; art.style.background = `url(${JSON.stringify(url)}) center/cover no-repeat`; }
        if (fileName) fileName.textContent = "已上传到 S3";
        toast("Logo 上传成功");
      } catch (error) {
        if (fileName) fileName.textContent = "上传失败，请重试";
        toast(uploadError(error, Number(error?.status || 0)));
      } finally { window.clearTimeout(timeout); button.disabled = false; }
    };
    reader.readAsDataURL(file);
  });
  const originalFetch = window.fetch.bind(window);
  window.addEventListener("bitbt:launch-reset", () => { document.documentElement.dataset.launchLogoUrl = ""; });
  window.fetch = async (inputValue, init = {}) => {
    if (String(inputValue).includes("/api/pump/v1/token/prepare-launch") && typeof init.body === "string") {
      const body = JSON.parse(init.body);
      const logoUrl = document.documentElement.dataset.launchLogoUrl;
      if (logoUrl) init = { ...init, body: JSON.stringify({ ...body, logo_url: logoUrl }) };
    }
    return originalFetch(inputValue, init);
  };
})();
