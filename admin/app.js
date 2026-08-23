(() => {
  "use strict";

  const state = {
    members: [],
    contactsPage: 1,
    contactsPageSize: 20,
    contactsTotal: 0,
    deletingMember: null,
    identities: [],
    deletingIdentity: null,
    activeView: "team",
  };

  const byId = (id) => document.getElementById(id);
  const ui = {
    boot: byId("boot-screen"),
    login: byId("login-screen"),
    admin: byId("admin-screen"),
    accountActions: byId("account-actions"),
    sessionUsername: byId("session-username"),
    loginForm: byId("login-form"),
    loginButton: byId("login-button"),
    loginError: byId("login-error"),
    logoutButton: byId("logout-button"),
    globalMessage: byId("global-message"),
    teamView: byId("team-view"),
    verificationView: byId("verification-view"),
    contactsView: byId("contacts-view"),
    teamLoading: byId("team-loading"),
    teamList: byId("team-list"),
    verificationLoading: byId("verification-loading"),
    identityList: byId("identity-list"),
    contactsLoading: byId("contacts-loading"),
    contactsList: byId("contacts-list"),
    contactsSummary: byId("contacts-summary"),
    pagination: byId("pagination"),
    previousPage: byId("previous-page"),
    nextPage: byId("next-page"),
    pageStatus: byId("page-status"),
    memberDialog: byId("member-dialog"),
    memberForm: byId("member-form"),
    memberDialogTitle: byId("member-dialog-title"),
    memberFormError: byId("member-form-error"),
    saveMemberButton: byId("save-member-button"),
    deleteDialog: byId("delete-dialog"),
    deleteDialogCopy: byId("delete-dialog-copy"),
    confirmDeleteButton: byId("confirm-delete-button"),
    identityDialog: byId("identity-dialog"),
    identityForm: byId("identity-form"),
    identityDialogTitle: byId("identity-dialog-title"),
    identityFormError: byId("identity-form-error"),
    saveIdentityButton: byId("save-identity-button"),
    deleteIdentityDialog: byId("delete-identity-dialog"),
    deleteIdentityDialogCopy: byId("delete-identity-dialog-copy"),
    confirmDeleteIdentityButton: byId("confirm-delete-identity-button"),
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setError(node, message) {
    node.textContent = message || "";
    node.hidden = !message;
  }

  function setBusy(button, busy, busyLabel) {
    if (busy) button.dataset.originalLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.originalLabel || button.textContent;
  }

  async function api(path, options = {}, redirectOnUnauthorized = true) {
    const request = {
      credentials: "include",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options,
    };
    if (request.body && !request.headers["Content-Type"]) {
      request.headers["Content-Type"] = "application/json";
    }

    const response = await fetch(path, request);
    if (response.status === 401 && redirectOnUnauthorized) {
      showLogin("Your session has expired. Please sign in again.");
      throw new Error("Unauthorized");
    }
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (body.error) message = body.error;
      } catch {
        // Keep the status-based message for non-JSON responses.
      }
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function showLogin(message = "") {
    ui.boot.hidden = true;
    ui.admin.hidden = true;
    ui.accountActions.hidden = true;
    ui.login.hidden = false;
    setError(ui.loginError, message);
    byId("password").value = "";
    byId("username").focus();
  }

  async function showAdmin(username) {
    ui.boot.hidden = true;
    ui.login.hidden = true;
    ui.admin.hidden = false;
    ui.accountActions.hidden = false;
    ui.sessionUsername.textContent = username || "admin";
    await loadTeam();
  }

  async function checkSession() {
    try {
      const response = await fetch("/api/admin/session", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Session check failed");
      const session = await response.json();
      if (session.authenticated) {
        await showAdmin(session.username);
      } else {
        showLogin();
      }
    } catch {
      ui.boot.hidden = true;
      showLogin("Unable to reach the admin service. Please try again.");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError(ui.loginError, "");
    setBusy(ui.loginButton, true, "Signing in…");
    try {
      const session = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: byId("username").value.trim(),
          password: byId("password").value,
        }),
      }, false);
      await showAdmin(session.username);
    } catch (error) {
      if (error.message === "unauthorized" || error.message === "Unauthorized") {
        setError(ui.loginError, "Invalid username or password.");
      } else {
        setError(ui.loginError, error.message);
      }
    } finally {
      setBusy(ui.loginButton, false);
    }
  }

  async function handleLogout() {
    setBusy(ui.logoutButton, true, "Logging out…");
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch {
      // Return to login even if the server-side session already expired.
    } finally {
      setBusy(ui.logoutButton, false);
      showLogin();
    }
  }

  function showGlobalError(message) {
    setError(ui.globalMessage, message);
  }

  function emptyState(message) {
    return element("div", "empty-state", message);
  }

  async function loadTeam() {
    ui.teamLoading.hidden = false;
    ui.teamList.replaceChildren();
    showGlobalError("");
    try {
      const response = await api("/api/admin/team");
      state.members = response.items || [];
      renderTeam();
    } catch (error) {
      if (error.message !== "Unauthorized") showGlobalError(error.message);
    } finally {
      ui.teamLoading.hidden = true;
    }
  }

  function addTagList(container, tags) {
    const list = element("div", "member-tags");
    (tags || []).forEach((tag) => list.append(element("span", "tag", tag)));
    container.append(list);
  }

  function actionButton(label, symbol, handler, disabled = false) {
    const button = element("button", "icon-button", symbol);
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.disabled = disabled;
    button.addEventListener("click", handler);
    return button;
  }

  function renderTeam() {
    ui.teamList.replaceChildren();
    if (!state.members.length) {
      ui.teamList.append(emptyState("No team members yet."));
      return;
    }

    state.members.forEach((member, index) => {
      const card = element("article", "member-card");
      card.append(element("span", "member-position", String(index + 1).padStart(2, "0")));

      const identity = element("div");
      identity.append(element("p", "member-name", member.name));
      const status = element("span", `status${member.is_active ? "" : " inactive"}`, member.is_active ? "Active" : "Hidden");
      identity.append(status);
      card.append(identity);

      const info = element("div", "member-info");
      const roles = element("p", "member-roles");
      roles.append(element("span", "", member.role_en));
      roles.append(element("span", "", member.role_zh));
      info.append(roles);
      addTagList(info, [...(member.tags_en || []), ...(member.tags_zh || [])]);
      card.append(info);

      const actions = element("div", "member-actions");
      actions.append(
        actionButton(`Move ${member.name} up`, "↑", () => reorderMember(index, index - 1), index === 0),
        actionButton(
          `Move ${member.name} down`,
          "↓",
          () => reorderMember(index, index + 1),
          index === state.members.length - 1,
        ),
        actionButton(`Edit ${member.name}`, "Edit", () => openMemberDialog(member)),
        actionButton(`Delete ${member.name}`, "×", () => openDeleteDialog(member)),
      );
      card.append(actions);
      ui.teamList.append(card);
    });
  }

  async function reorderMember(from, to) {
    if (to < 0 || to >= state.members.length) return;
    const reordered = [...state.members];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    showGlobalError("");
    try {
      const response = await api("/api/admin/team/reorder", {
        method: "PUT",
        body: JSON.stringify({ ids: reordered.map((member) => member.id) }),
      });
      state.members = response.items || reordered;
      renderTeam();
    } catch (error) {
      if (error.message !== "Unauthorized") showGlobalError(error.message);
    }
  }

  async function loadIdentities() {
    ui.verificationLoading.hidden = false;
    ui.identityList.replaceChildren();
    showGlobalError("");
    try {
      const response = await api("/api/admin/official-identities");
      state.identities = response.items || [];
      renderIdentities();
    } catch (error) {
      if (error.message !== "Unauthorized") showGlobalError(error.message);
    } finally {
      ui.verificationLoading.hidden = true;
    }
  }

  function channelLabel(type) {
    const labels = {
      website: "Website",
      telegram: "Telegram",
      email: "Email",
      phone: "Phone",
      linkedin: "LinkedIn",
      x: "X / Twitter",
    };
    return labels[type] || type;
  }

  function renderIdentities() {
    ui.identityList.replaceChildren();
    if (!state.identities.length) {
      ui.identityList.append(emptyState("No official identities yet."));
      return;
    }

    state.identities.forEach((identity, index) => {
      const card = element("article", "member-card");
      card.append(element("span", "member-position", String(index + 1).padStart(2, "0")));

      const identityType = element("div");
      identityType.append(element("p", "member-name", channelLabel(identity.channel_type)));
      identityType.append(
        element(
          "span",
          `status${identity.is_active ? "" : " inactive"}`,
          identity.is_active ? "Active" : "Inactive",
        ),
      );
      card.append(identityType);

      const info = element("div", "member-info");
      const values = element("p", "member-roles");
      values.append(element("span", "", identity.value));
      values.append(element("span", "", `Match key: ${identity.normalized_value}`));
      info.append(values);
      card.append(info);

      const actions = element("div", "member-actions");
      actions.append(
        actionButton(`Edit ${identity.value}`, "Edit", () => openIdentityDialog(identity)),
        actionButton(`Delete ${identity.value}`, "×", () => openDeleteIdentityDialog(identity)),
      );
      card.append(actions);
      ui.identityList.append(card);
    });
  }

  function openIdentityDialog(identity = null) {
    ui.identityForm.reset();
    setError(ui.identityFormError, "");
    ui.identityDialogTitle.textContent = identity ? "Edit identity" : "Add identity";
    byId("identity-id").value = identity ? identity.id : "";
    byId("identity-channel-type").value = identity ? identity.channel_type : "website";
    byId("identity-value").value = identity ? identity.value : "";
    byId("identity-active").checked = identity ? identity.is_active : true;
    ui.identityDialog.showModal();
    byId("identity-value").focus();
  }

  async function saveIdentity(event) {
    event.preventDefault();
    setError(ui.identityFormError, "");
    const id = byId("identity-id").value;
    const payload = {
      channel_type: byId("identity-channel-type").value,
      value: byId("identity-value").value.trim(),
      is_active: byId("identity-active").checked,
    };

    setBusy(ui.saveIdentityButton, true, "Saving…");
    try {
      await api(
        id
          ? `/api/admin/official-identities/${encodeURIComponent(id)}`
          : "/api/admin/official-identities",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      ui.identityDialog.close();
      await loadIdentities();
    } catch (error) {
      if (error.message !== "Unauthorized") setError(ui.identityFormError, error.message);
    } finally {
      setBusy(ui.saveIdentityButton, false);
    }
  }

  function openDeleteIdentityDialog(identity) {
    state.deletingIdentity = identity;
    ui.deleteIdentityDialogCopy.textContent = `${identity.value} will no longer be recognized by the public verification tool. This cannot be undone.`;
    ui.deleteIdentityDialog.showModal();
    ui.confirmDeleteIdentityButton.focus();
  }

  async function deleteIdentity() {
    if (!state.deletingIdentity) return;
    setBusy(ui.confirmDeleteIdentityButton, true, "Deleting…");
    try {
      await api(
        `/api/admin/official-identities/${encodeURIComponent(state.deletingIdentity.id)}`,
        { method: "DELETE" },
      );
      ui.deleteIdentityDialog.close();
      state.deletingIdentity = null;
      await loadIdentities();
    } catch (error) {
      if (error.message !== "Unauthorized") showGlobalError(error.message);
      ui.deleteIdentityDialog.close();
    } finally {
      setBusy(ui.confirmDeleteIdentityButton, false);
    }
  }

  function tagsFromInput(id) {
    return byId(id)
      .value.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function openMemberDialog(member = null) {
    ui.memberForm.reset();
    setError(ui.memberFormError, "");
    ui.memberDialogTitle.textContent = member ? "Edit member" : "Add member";
    byId("member-id").value = member ? member.id : "";
    byId("member-name").value = member ? member.name : "";
    byId("member-role-en").value = member ? member.role_en : "";
    byId("member-role-zh").value = member ? member.role_zh : "";
    byId("member-tags-en").value = member ? (member.tags_en || []).join(", ") : "";
    byId("member-tags-zh").value = member ? (member.tags_zh || []).join(", ") : "";
    byId("member-sort-order").value = member ? member.sort_order : "";
    byId("member-active").checked = member ? member.is_active : true;
    ui.memberDialog.showModal();
    byId("member-name").focus();
  }

  async function saveMember(event) {
    event.preventDefault();
    setError(ui.memberFormError, "");
    const id = byId("member-id").value;
    const sortValue = byId("member-sort-order").value;
    const payload = {
      name: byId("member-name").value.trim(),
      role_en: byId("member-role-en").value.trim(),
      role_zh: byId("member-role-zh").value.trim(),
      tags_en: tagsFromInput("member-tags-en"),
      tags_zh: tagsFromInput("member-tags-zh"),
      is_active: byId("member-active").checked,
    };
    if (id) {
      payload.sort_order = Number(sortValue);
    } else if (sortValue !== "") {
      payload.sort_order = Number(sortValue);
    }

    setBusy(ui.saveMemberButton, true, "Saving…");
    try {
      await api(id ? `/api/admin/team/${encodeURIComponent(id)}` : "/api/admin/team", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      ui.memberDialog.close();
      await loadTeam();
    } catch (error) {
      if (error.message !== "Unauthorized") setError(ui.memberFormError, error.message);
    } finally {
      setBusy(ui.saveMemberButton, false);
    }
  }

  function openDeleteDialog(member) {
    state.deletingMember = member;
    ui.deleteDialogCopy.textContent = `${member.name} will be removed from the admin and public team lists. This cannot be undone.`;
    ui.deleteDialog.showModal();
    ui.confirmDeleteButton.focus();
  }

  async function deleteMember() {
    if (!state.deletingMember) return;
    setBusy(ui.confirmDeleteButton, true, "Deleting…");
    try {
      await api(`/api/admin/team/${encodeURIComponent(state.deletingMember.id)}`, {
        method: "DELETE",
      });
      ui.deleteDialog.close();
      state.deletingMember = null;
      await loadTeam();
    } catch (error) {
      if (error.message !== "Unauthorized") showGlobalError(error.message);
      ui.deleteDialog.close();
    } finally {
      setBusy(ui.confirmDeleteButton, false);
    }
  }

  function detail(label, value, className = "") {
    const wrapper = element("div", className);
    wrapper.append(element("span", "contact-label", label));
    wrapper.append(element("span", "contact-value", value || "—"));
    return wrapper;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function renderContacts(items) {
    ui.contactsList.replaceChildren();
    if (!items.length) {
      ui.contactsList.append(emptyState("No contact submissions found."));
      return;
    }
    items.forEach((submission) => {
      const card = element("article", "contact-card");
      const summary = element("div", "contact-summary");
      summary.append(
        detail("Name", submission.name),
        detail("Company", submission.company),
        detail("Contact", submission.contact),
        detail("Received", formatDate(submission.created_at)),
      );
      const details = element("div", "contact-details");
      details.append(
        detail("ID", submission.id),
        detail("Role", submission.role),
        detail("Title", submission.title),
        detail("Social", submission.social),
        detail("Introduction", submission.intro, "contact-intro"),
      );
      card.append(summary, details);
      ui.contactsList.append(card);
    });
  }

  async function loadContacts(page = 1) {
    ui.contactsLoading.hidden = false;
    ui.contactsList.replaceChildren();
    ui.pagination.hidden = true;
    showGlobalError("");
    try {
      const response = await api(
        `/api/admin/submissions?page=${encodeURIComponent(page)}&page_size=${state.contactsPageSize}`,
      );
      state.contactsPage = response.page;
      state.contactsTotal = response.total;
      renderContacts(response.items || []);

      const totalPages = Math.max(1, Math.ceil(response.total / response.page_size));
      ui.contactsSummary.textContent = `${response.total} submission${response.total === 1 ? "" : "s"} · read only`;
      ui.pageStatus.textContent = `Page ${response.page} of ${totalPages}`;
      ui.previousPage.disabled = response.page <= 1;
      ui.nextPage.disabled = response.page >= totalPages;
      ui.pagination.hidden = response.total === 0;
    } catch (error) {
      if (error.message !== "Unauthorized") showGlobalError(error.message);
    } finally {
      ui.contactsLoading.hidden = true;
    }
  }

  async function switchView(view) {
    state.activeView = view;
    document.querySelectorAll(".nav-item").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    ui.teamView.hidden = view !== "team";
    ui.verificationView.hidden = view !== "verification";
    ui.contactsView.hidden = view !== "contacts";
    showGlobalError("");
    if (view === "verification") await loadIdentities();
    if (view === "contacts") await loadContacts(state.contactsPage);
  }

  ui.loginForm.addEventListener("submit", handleLogin);
  ui.logoutButton.addEventListener("click", handleLogout);
  byId("add-member-button").addEventListener("click", () => openMemberDialog());
  byId("add-identity-button").addEventListener("click", () => openIdentityDialog());
  byId("close-dialog-button").addEventListener("click", () => ui.memberDialog.close());
  byId("cancel-member-button").addEventListener("click", () => ui.memberDialog.close());
  ui.memberForm.addEventListener("submit", saveMember);
  byId("cancel-delete-button").addEventListener("click", () => ui.deleteDialog.close());
  ui.confirmDeleteButton.addEventListener("click", deleteMember);
  byId("close-identity-dialog-button").addEventListener("click", () => ui.identityDialog.close());
  byId("cancel-identity-button").addEventListener("click", () => ui.identityDialog.close());
  ui.identityForm.addEventListener("submit", saveIdentity);
  byId("cancel-delete-identity-button").addEventListener("click", () => ui.deleteIdentityDialog.close());
  ui.confirmDeleteIdentityButton.addEventListener("click", deleteIdentity);
  ui.previousPage.addEventListener("click", () => loadContacts(state.contactsPage - 1));
  ui.nextPage.addEventListener("click", () => loadContacts(state.contactsPage + 1));
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  checkSession();
})();
