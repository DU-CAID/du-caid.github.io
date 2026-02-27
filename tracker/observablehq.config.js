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
