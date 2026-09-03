# SNDF Management – Live Image Fix

All local raster images were converted to PNG and all HTML/CSS references were updated to use root-level PNG files.

- Removed live dependency on `.jfif` and `.webp` assets.
- Converted the logo to `assets-logo.png`.
- Converted service/background images to PNG.
- Kept the original SVG icon assets and also generated PNG icon copies (`*-icon.png`).
- Fixed stale `service-assets/images/...` paths left by the earlier flattened build.
- Removed external Unsplash image dependencies from the home page and Medical Team card.

Upload this ZIP to the same GitHub repository and let Railway redeploy.
