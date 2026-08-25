import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// React je při buildu nahrazen Preactem (preact/compat) — výrazně menší a rychlejší JS
// při zachování stejného API. JSX se transformuje výchozím automatickým runtime
// (emituje import z "react/jsx-runtime"), který se aliasem přesměruje na Preact.
// Typy stále poskytuje @types/react (tsc kontroluje zdroj).
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    // Pořadí = od nejkonkrétnějšího; regexy s kotvami zabrání chybnému prefix-matchi.
    alias: [
      { find: /^react-dom\/client$/, replacement: "preact/compat/client" },
      { find: /^react-dom$/, replacement: "preact/compat" },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
      { find: /^react$/, replacement: "preact/compat" },
    ],
  },
  build: {
    // Cíl iOS 15+ / moderní prohlížeče → menší bundle, méně transpilace.
    target: "es2020",
  },
  server: {
    port: 5180,
  },
});
