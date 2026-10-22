// Runs synchronously in <head>, before React, so the chosen theme is on <html> at first paint.
// Keep the list in sync with THEMES in @ghosted/shared.
(function () {
  var themes = [
    "ghosted-dark",
    "ghosted-light",
    "dracula",
    "night",
    "nord",
    "coffee",
    "synthwave",
    "cupcake",
  ];
  var theme = "system";
  try {
    theme = localStorage.getItem("ghosted-theme") || localStorage.getItem("chat-theme") || "system";
  } catch (e) {
    /* storage unavailable */
  }
  if (theme !== "system" && themes.indexOf(theme) === -1) theme = "system";
  if (theme === "system") {
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    theme = dark ? "ghosted-dark" : "ghosted-light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
