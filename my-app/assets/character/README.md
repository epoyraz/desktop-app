# Character Assets

## mascot.default.svg
Placeholder anthropomorphic blob mascot. Simple rounded silhouette, eyes, subtle smile.
Body color: `#7fb3d0` (blue-grey). See `tokens.ts` `ONBOARDING_COLORS.mascotBody`.

Replace with a Lottie animation file (`mascot.anim.lottie`) in v0.2.

## Required font files (not bundled in session)

Place font `.woff2` files in `my-app/public/fonts/` before building.

| Family | Weight | File path |
|--------|--------|-----------|
| Geist | 400 | `public/fonts/Geist/Geist-Regular.woff2` |
| Geist | 500 | `public/fonts/Geist/Geist-Medium.woff2` |
| Geist | 600 | `public/fonts/Geist/Geist-SemiBold.woff2` |
| Geist | 700 | `public/fonts/Geist/Geist-Bold.woff2` |
| Berkeley Mono | 400 | `public/fonts/BerkeleyMono/BerkeleyMono-Regular.woff2` |
| Berkeley Mono | 700 | `public/fonts/BerkeleyMono/BerkeleyMono-Bold.woff2` |
| JetBrains Mono | 400 | `public/fonts/JetBrainsMono/JetBrainsMono-Regular.woff2` |
| JetBrains Mono | 500 | `public/fonts/JetBrainsMono/JetBrainsMono-Medium.woff2` |

### Sources
- **Geist**: https://vercel.com/font — OFL license, free
- **Berkeley Mono**: https://berkeleygraphics.com/typefaces/berkeley-mono/ — commercial license required
- **JetBrains Mono**: https://www.jetbrains.com/lp/mono/ — OFL license, free

Until font files are present, the system-ui / ui-monospace fallbacks render cleanly.

## v0.2 roadmap
- `mascot.anim.lottie` — idle float + blink loop + loading spin variants
- `mascot.variants/` — color/character variants (purple, green, orange, pink, teal) matching the bottom row in the onboarding screenshot
- `mascot.loading.svg` — alternate pose for agent-working state
