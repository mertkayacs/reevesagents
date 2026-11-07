# ReevesAgents brand kit

The ReevesAgents mark is a coral lead node linked to three worker nodes. The logo pairs it with the wordmark `ReevesAgents` set in Inter.

## Files

| Use | File |
|---|---|
| Logo on a light background | `svg/reevesagents-logo-on-light.svg`, `png/reevesagents-logo-on-light-1600.png` |
| Logo on a dark background | `svg/reevesagents-logo-on-dark.svg`, `png/reevesagents-logo-on-dark-1600.png` |
| Mark alone on a light background | `svg/reevesagents-mark.svg`, `png/reevesagents-mark-1024.png` |
| Mark alone on a dark background | `svg/reevesagents-mark-on-dark.svg` |
| App icon (512 px tile, corner radius 112) | `svg/reevesagents-appicon.svg`, `png/reevesagents-appicon-1024.png` |
| Favicon, the app icon tile at small size (reads on light and dark tabs) | `favicon/favicon.svg` |
| The same favicon for older browsers (16, 32 and 48 px in one file) | `favicon/favicon.ico` |
| The same favicon as a 32 px PNG | `favicon/favicon-32.png` |
| Home screen icon (180 px, opaque) | `favicon/apple-touch-icon.png` |

The logo and mark PNGs have transparent backgrounds. The app icon PNG and the favicons have transparent rounded corners. The home screen icon is a full opaque square, because iOS rounds the corners itself.

On light surfaces the lead node uses `#D26D53`, a step deeper than the site coral `#E07A5F`, which measures 2.95:1 on white and misses the 3:1 floor.

## Colour

| Role | Light surfaces | Contrast on #FFFFFF / #FDF8F1 | Dark surfaces | Contrast on #0D1117 / #12171D |
|---|---|---|---|---|
| Ink | `#1A202C` | 16.32 / 15.44 | `#F5F2EB` | 16.93 / 16.11 |
| Accent | `#D26D53` | 3.47 / 3.28 | `#ED967C` | 8.34 / 7.94 |

| App icon | Colour | Contrast on the tile |
|---|---|---|
| Tile | `#1A202C` | |
| Ink | `#F5F2EB` | 14.60 |
| Accent | `#ED967C` | 7.19 |

README icon colour: `#2B858F`, 4.33 on #FFFFFF and 4.37 on #0D1117.

## Usage

- Pick the file that matches the background: on-light files for white or paper, on-dark files for dark surfaces. In a README, use a `<picture>` element with the dark logo as the `prefers-color-scheme: dark` source.
- Keep clear space around the logo of at least half the height of the mark.
- Smallest sizes: 16 px for the mark, 120 px wide for the logo.
- The wordmark is drawn as outlined paths, so it looks the same everywhere. Use the supplied files and leave the letters as they are.
- Do not recolour, rotate, stretch, outline or add effects to the mark.

## Font

Inter, wght 600, opsz 32, tracking -0.01 em. Source: `Inter[opsz,wght].ttf` from [google/fonts](https://github.com/google/fonts/tree/86aced91de05cd4f96a06838124cca45be337b2b/ofl/inter) at commit `86aced91de05`. Licence: SIL Open Font License 1.1. The letters are converted to paths, so the font is not needed to display the logo.
