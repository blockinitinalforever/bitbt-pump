(() => {
  const input = document.getElementById("token-logo-file");
  const button = document.querySelector("[data-launch-file]");
  if (!input || !button) return;
  const toast = (message) => window.dispatchEvent(new CustomEvent("bitbt:toast", { detail: message }));
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      input.value = "";
      toast("请选择 5MB 以内的 PNG、JPG 或 WEBP 图片");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        button.disabled = true;
        const session = sessionStorage.getItem("bitbt_pump_session");
        const response = await fetch("/api/pump/v1/upload/image", { method: "POST", headers: { accept: "application/json", "content-type": "application/json", ...(session ? { authorization: `Bearer ${session}` } : {}) }, body: JSON.stringify({ image: reader.result, filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "-") }), cache: "no-store" });
        const payload = await response.json();
        const url = payload?.data?.url;
        if (!response.ok || !url) throw new Error(payload?.error || "Logo 上传失败");
        document.documentElement.dataset.launchLogoUrl = url;
        const art = document.getElementById("create-art");
        if (art) { art.textContent = ""; art.style.background = `url(${JSON.stringify(url)}) center/cover no-repeat`; }
        const fileName = document.querySelector("[data-launch-file-name]");
        if (fileName) fileName.textContent = "已上传到 S3";
        toast("Logo 上传成功");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Logo 上传失败");
      } finally { button.disabled = false; }
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
