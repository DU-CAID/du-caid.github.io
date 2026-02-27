export default {
  title: "AI Policy Tracker",
  pages: [
    {name: "Overview",     path: "/index"},
    {name: "Bill Browser", path: "/bills"},
    {name: "Trends",       path: "/trends"},
  ],
  base: "/tracker/",
  style: "style.css",
  theme: "light",

  // Injected into <head> — runs before any external stylesheet.
  // Overrides Observable's CSS font variables so Source Serif 4 is
  // never applied (prevents the font-swap flash entirely).
  // Also kills all CSS transitions/animations that cause the shaky
  // reflow when DuckDB cells render.
  head: `<style>
  :root {
    --sans-serif: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    --serif:      system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  *, *::before, *::after {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif !important;
    animation-duration:   0.001ms !important;
    animation-delay:      0s      !important;
    transition-duration:  0.001ms !important;
    transition-delay:     0s      !important;
  }
</style>`,

  header: `<div class="caid-topbar">
  <a class="caid-topbar-brand" href="https://du-caid.github.io/">
    <img src="https://du-caid.github.io/assets/img/CAID_logo_square_compressed.png" alt="CAID logo" width="32" height="32">
    <span>DU CAID</span>
  </a>
  <nav class="caid-topbar-nav">
    <a href="https://du-caid.github.io/about.html">About</a>
    <a href="https://du-caid.github.io/projects.html">Projects</a>
    <a href="https://du-caid.github.io/people.html">People</a>
    <a href="https://du-caid.github.io/contact.html">Contact</a>
  </nav>
</div>`,
};
