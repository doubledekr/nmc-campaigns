/* Startup: load data, fetch the provider list from the shell, wire the update bar, first render. */
(async function () {
  "use strict";
  await App.load();
  if (App.desktop) { try { App.providerCatalog = await window.nmc.providers(); } catch (e) {} }
  if (!App.S.ui.screen) App.S.ui.screen = App.L.leads.length ? "campaigns" : "leads";
  if (App.S.ui.screen === "campaign" && !App.cur()) App.S.ui.screen = "campaigns";
  App.render();

  if (App.desktop && window.nmc.update) {
    window.nmc.update.onStatus(st => {
      const bar = document.getElementById("upd");
      if (st.state === "ready") { bar.innerHTML = `<div class="updbar">Version ${App.esc(st.version)} is ready.<button class="btn" id="updGo">Restart to update</button></div>`; document.getElementById("updGo").onclick = () => window.nmc.update.install(); }
      else if (st.state === "manual") { bar.innerHTML = `<div class="updbar">Version ${App.esc(st.version)} is available.<button class="btn" id="updGo">Download</button></div>`; document.getElementById("updGo").onclick = () => window.nmc.update.openReleases(); }
    });
  }
  window.addEventListener("beforeunload", () => App.saveNow());
})();
