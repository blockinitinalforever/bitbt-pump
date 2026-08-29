(() => {
  const input = document.getElementById("token-logo-file");
  const button = document.querySelector("[data-launch-file]");
  if (!input || !button) return;
  const MAX_LOGO_BYTES = 5 * 1024 * 1024;
  const toast = (message) => window.dispatchEvent(new CustomEvent("bitbt:toast", { detail: message }));
  const fileName = document.querySelector("[data-launch-file-name]");
  let selectedLogo = null;
  let uploadedUrl = "";
  let uploadPromise = null;
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
    reader.onload = () => {
      selectedLogo = { image: reader.result, filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "-"), key: `${file.name}:${file.size}:${file.lastModified || 0}` };
      uploadedUrl = "";
      uploadPromise = null;
      document.documentElement.dataset.launchLogoUrl = "";
      document.documentElement.dataset.launchLogoSelection = selectedLogo.key;
      const art = document.getElementById("create-art");
      if (art) { art.textContent = ""; art.style.background = `url(${JSON.stringify(reader.result)}) center/cover no-repeat`; }
      if (fileName) fileName.textContent = "已选择，发币成功后上传";
      toast("Logo 已选择，将在代币创建成功后上传");
    };
    reader.readAsDataURL(file);
  });
  window.bitbtUploadSelectedLaunchLogo = async () => {
    if (!selectedLogo) return "";
    if (uploadedUrl) return uploadedUrl;
    if (uploadPromise) return uploadPromise;
    uploadPromise = (async () => {
      const session = sessionStorage.getItem("bitbt_pump_session");
      if (!session) throw new Error("SIWE session required for image upload");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      try {
        button.disabled = true;
        if (fileName) fileName.textContent = "代币已创建，正在上传 Logo…";
        const response = await fetch("/api/pump/v1/upload/image", { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${session}` }, body: JSON.stringify({ image: selectedLogo.image, filename: selectedLogo.filename }), cache: "no-store", signal: controller.signal });
        const raw = await response.text();
        let payload = {};
        try { payload = JSON.parse(raw); } catch { payload = { error: response.status === 413 ? "Image too large" : "Invalid upload response" }; }
        const url = payload?.data?.url;
        if (!response.ok || !url) { const error = new Error(payload?.error || "Logo upload failed"); error.status = response.status; throw error; }
        uploadedUrl = url;
        document.documentElement.dataset.launchLogoUrl = url;
        if (fileName) fileName.textContent = "Logo 已上传";
        return url;
      } catch (error) {
        if (fileName) fileName.textContent = "代币已创建，Logo 上传失败";
        const wrapped = new Error(uploadError(error, Number(error?.status || 0)));
        wrapped.cause = error;
        throw wrapped;
      } finally {
        window.clearTimeout(timeout);
        button.disabled = false;
        uploadPromise = null;
      }
    })();
    return uploadPromise;
  };
  window.bitbtLaunchLogoSelectionKey = () => selectedLogo?.key || "";
  window.addEventListener("bitbt:launch-reset", () => { selectedLogo = null; uploadedUrl = ""; uploadPromise = null; document.documentElement.dataset.launchLogoUrl = ""; document.documentElement.dataset.launchLogoSelection = ""; });
})();
