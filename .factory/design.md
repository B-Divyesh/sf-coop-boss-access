# Co-op Boss Access — visual thesis

## Direction: night-market neon signage

The game should feel like friends have found a tiny after-hours arcade stall: hand-painted signboards, punchy neon tubes, and a paper-dragon boss looming beyond the counter. The shared display is theatrical, while phones become plain, unmistakable control placards. Decoration always reinforces a role, target, or state.

This is intentionally a single dark treatment. A light theme would dilute the night-market metaphor and add glare on a shared television. High-contrast mode removes translucent surfaces, adds white keylines, and strengthens every shape cue without changing the semantic palette.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#090713` | Painted-night background |
| Stall | `#171129` | Primary surface |
| Raised | `#25183d` | Controls and elevated signs |
| Paper | `#fff8df` | Primary text (18.1:1 on Ink) |
| Chalk | `#c9c1d8` | Secondary text (10.4:1 on Ink) |
| Lantern | `#ffd23f` | Primary action / exposed target |
| Lantern ink | `#171006` | Text on Lantern |
| Jade | `#55efc4` | Ward role / success |
| Electric | `#75a7ff` | Surge role / information |
| Chili | `#ff6b6b` | Danger / boss attack |
| Plum | `#8e5bd9` | Atmospheric trim only |

Color is never the only signal. Ward always uses a hexagonal shield and the word “WARD”; Surge always uses a four-point bolt and the word “SURGE”; boss warnings also carry an icon, label, and solid meter pattern.

## Type and spacing

- Display: locally bundled **Bowlby One SC**, used sparingly for stall-name scale and round outcomes. Its chunky, hand-painted geometry reads like market signage.
- Utility/body: locally bundled **Atkinson Hyperlegible**, chosen for differentiated letterforms and quick controller scanning.
- Scale: 16, 18, 22, 30, 44, and fluid 64 px. Body line height is 1.5; display line height is 0.95.
- Space follows a 4/8 px rhythm: 4, 8, 12, 16, 24, 32, 48, 64. Touch targets are at least 56 px on controllers and 44 px elsewhere.
- Host layout is a wide stage with a narrow status marquee; at phone widths it becomes a controller-first stack and drops atmospheric roof trim, never game state.

## Interaction grammar

- Filled yellow signs are decisive actions: create, join, start, play again.
- Ward interactions are left-positioned hexagonal placards; Surge interactions are right-positioned clipped-diamond placards.
- Each controller exposes exactly two large buttons: build the personal meter, then share the earned team effect. A short written cause-and-effect line sits above them.
- Immediate pressed states use a 2 px downward transform and reduced shadow. Server acknowledgement updates a numeric meter and an `aria-live` sentence.
- Host announcements are a single marquee: “Incoming hit”, “Shield caught it”, “Surge ready”, or the end result. There is no floating notification stack.
- Demo mode keeps the same arena and role geometry, then places two compact sample-phone placards below it. A sticky plum-and-lantern strip keeps the sandbox boundary, reset action, and exit action visible without competing with battle state.
- The 404 screen uses a tilted, hand-painted number sign with the same Ward and Surge marks. It returns visitors to the game without pretending the missing address is a valid screen.

## Depth and ground clarity

The dragon and team platform are layered like flat paper theatre, not rendered in perspective. Optional ground markers place a vertically aligned, solid ring directly below the target. This communicates position with alignment, outline, label, and pattern—independent of blur or conventional shadows. High-contrast mode changes the markers to white double-lines.

## Motion policy

- UI transitions last 180–240 ms and use opacity/transform only.
- The boss “breathes” with a slow 3.6 s vertical drift; action confirmation is one 220 ms signboard bump; the incoming-hit cue grows once over 800 ms. Nothing flashes.
- With reduced motion enabled in the game or `prefers-reduced-motion`, all movement, smooth scrolling, and animated progress transitions become instant; emphasis switches to border weight and text. The setting is local to the current browser and is never sent to the server.

## Original asset plan and provenance

### Prompt sheet

Subject: a friendly but formidable origami night dragon guarding a tiny cooperative arcade stall; two empty player plinths below it, one hexagonal ward motif and one four-point spark motif. World/materials: layered cut paper, screen-printed ink, weathered painted wood, neon tubes, night-market canopy. Light/lens: straight-on theatrical stage, orthographic feel, crisp vertical alignment, deep indigo night with warm lantern rim light. Palette words: ink black, paper cream, lantern yellow, jade, electric blue, chili coral, restrained plum. Negative list: no text, no watermark, no logos, no brands, no real people, no copyrighted characters, no UI, no perspective floor, no blurry shadows, no strobe effects.

- `assets/src/night-market-dragon.png` and exported `public/art/night-market-dragon.webp`: generated with the factory image model (`factory-image`, Azure OpenAI image generation), 2026-08-27, using the prompt sheet above. Original to this product; used as the host-screen stage backdrop.
- All role icons, patterns, meters, and ground markers are hand-authored CSS/SVG primitives in this repository, MIT licensed with the code.

Generated imagery is disclosed in the footer. It is atmosphere only; all interactive and state information remains real text and CSS geometry.
