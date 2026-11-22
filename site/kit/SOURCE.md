# site/kit: a synced export

The look of the site (the clay direction: tokens, base styles, motion and the small runtime that runs
the theme toggle) is copied from `@garkpit/page-kit` 0.1.0, commit `b4b59c4`.

Do not edit these files by hand. Site-specific styles live in `site/site.css`; replace this folder
wholesale to take a newer kit.

| File | What it is |
|---|---|
| `tokens.css` | Colours, type scale, spacing and shadows for the clay direction, light and dark |
| `base.css` | Reset, typography and layout shared by every direction |
| `clay.css` | The clay direction's own styles |
| `motion.css`, `page-kit.js` | Entrance effects and the theme toggle |
| `head.js` | Applies the reader's stored theme before first paint |
