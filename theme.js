(function () {
  var key = "theme";

  function stored() {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function current() {
    var saved = stored();
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  apply(current());

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".theme");
    if (!btn) return;

    function sync() {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
    }

    sync();
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(key, next);
      } catch (e) {}
      apply(next);
      sync();
    });
  });
})();
