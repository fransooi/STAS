/*
 *  STAS sprites — catalogue des polices de RENDU.
 *  --------------------------------------------------------------------
 *  Séparation donnée / vue : un sprite stocke des caractères + couleurs,
 *  la police ne change QUE l'affichage (grille + aperçu + export raster).
 *  Elle n'est jamais encodée dans les cellules. Le sélecteur de police de
 *  l'éditeur puise ici. Les polices "web" sont chargées via Google Fonts
 *  par la page ; les autres utilisent les polices système.
 *  --------------------------------------------------------------------
 */

export const FONTS = [
  {
    id: "vt323",
    name: "VT323 (pixel)",
    family: '"VT323", monospace',
    gfont: "VT323",
    web: true,
  },
  {
    id: "pressstart",
    name: "Press Start 2P (pixel)",
    family: '"Press Start 2P", monospace',
    gfont: "Press+Start+2P",
    web: true,
  },
  {
    id: "dotgothic",
    name: "DotGothic16 (pixel, CJK)",
    family: '"DotGothic16", monospace',
    gfont: "DotGothic16",
    web: true,
  },
  {
    id: "mono",
    name: "Monospace (système)",
    family: 'ui-monospace, "Cascadia Mono", "Courier New", monospace',
    web: false,
  },
  {
    id: "serif",
    name: "Serif (système)",
    family: 'Georgia, "Times New Roman", serif',
    web: false,
  },
  {
    id: "sans",
    name: "Sans (système)",
    family: 'system-ui, Arial, sans-serif',
    web: false,
  },
];

/** Retrouve une police par id (repli sur VT323). */
export function fontById(id) {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** URL Google Fonts chargeant toutes les polices "web" du catalogue. */
export function googleFontsUrl() {
  const families = FONTS.filter((f) => f.web).map((f) => f.gfont);
  return (
    "https://fonts.googleapis.com/css2?family=" +
    families.join("&family=") +
    "&display=swap"
  );
}
