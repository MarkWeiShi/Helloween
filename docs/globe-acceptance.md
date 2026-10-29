# Interactive cartoon globe · 2026-10-28

Local preview: http://127.0.0.1:8787/. This revision is not deployed.

The discovery screen now uses a rotatable orthographic globe with sculpted coastlines, softly shaded ocean, miniature trees, mountains and pumpkin lanterns. Geographic anchors have no political boundaries. The old area tabs, region tile grid and character card strip were removed from this screen.

Each of the twenty regions has a directly clickable character image. Nine use existing playable characters; eleven use original visual previews from the proposed roster, marked with a moon and Coming soon. Previews have no playable character ID, candy account, battle or ending. The catalog still has forty playable characters. Their original IDs and player progress remain unchanged.

Selecting a character opens the enlarged character panel; on mobile it scrolls the panel into view. Same-region characters are reached through previous/next controls. The main character image is 335 px on desktop and 295 px on mobile; the two main action buttons are side by side with a 44 px minimum touch height. Selection uses a 240 ms scale/opacity transition, disabled for reduced motion and keyboard clicks. The globe follows dragging directly, does not spin automatically, and also supports keyboard, rotation buttons and a region select for alternate access. Hidden hemisphere markers cannot receive focus or clicks. Canvas frames stop while the document is hidden and handlers are cleaned up on page changes.

Sources and asset provenance:
- src/globe.ts: projection, rendering, marker positioning and interaction lifecycle.
- assets/globe-provenance.json: Natural Earth land data and renderer source.
- assets/globe-preview-art.json: full built-in image_gen prompt and pending-review status.
- public/art/source/globe-previews-atlas.png: eleven original preview figures.
- scripts/prepare-globe-previews.mjs: alpha-preserving sprite extraction; run npm run assets:previews.

Verification:
- TypeScript and Vite production build passed.
- Content validation passed: 20 regions, 40 playable characters, 120 existing story panels and pose assets.
- 30 Node tests passed.
- Browser regression coverage spans desktop Chrome, mobile-size Chrome and iPhone-size WebKit: all 20 region selections, all 40 playable images, all 11 enlarged preview images, switching characters, restoring the previous costume, wallet persistence, reload, no page overflow, larger portrait/smaller action sizes, drag without accidental selection, keyboard rotation, reduced motion, invitation deduplication, cancelled sharing, four leaderboards, HelloTalk links and four real timed duels through a complete ending.
- Drag coverage uses pointer simulation, not a claim of physical iOS/Android device acceptance.

Screenshots: artifacts/chromium-desktop-globe.png, artifacts/chromium-mobile-globe.png, artifacts/webkit-mobile-globe.png, artifacts/globe-selected-jiangshi.png.

Human art/cultural review of the new original previews remains pending. Existing online deployment remains unchanged.

## Character controls revision

The viewer now has a top-right X that hides the character detail and restores focus to the globe. Clicking a globe character reopens it. Previous/next arrows flank the portrait; horizontal pointer swipes and arrow keys can also page through the region's characters. The initial portrait and story progress are retained.

Actions use compact colored emoji buttons: 👻 Scare friend, 🎃 Lantern Duel, and 🍬 Give sweet beneath them. Completed characters retain their story-replay action. Buttons have accessible names; the candy button still opens the existing gift flow. Pending region previews also have a close control above their image stacking layer.

Targeted browser checks cover closing/reopening, paging, horizontal swipes, the three action dialogs, preview close controls and unchanged candy balances. Screenshot: artifacts/character-controls-preview.png.

## Unified modal and viewport revision

Explore now contains only its heading, wish-count collection shortcut, rotating globe and rotation controls. Its root uses a fixed dynamic viewport height and clipped overflow. Visible region labels, the region select and the inline character panel were removed. Accessible marker names still identify cultures for screen readers. The wish-count button retains access to the collection and the rest of the navigation.

Every globe marker opens a native modal dialog, including all eleven future-character previews. The background is inert while the dialog is open. X, Escape and backdrop dismissal return to Explore. Existing actions replace the character dialog with their existing action dialogs. Only the dialog itself may scroll on short screens.

Emoji action graphics are now 56–58 px with transparent backgrounds, no borders and no colored tiles. Hover/press enlarges globe characters to 1.85×. The terrain uses six original built-in image_gen miniatures (snowy mountains, pine forest, tropical waterfall, desert, hills and volcano), projected with geographic anchors on the rotating globe. Full prompt and source file are recorded in assets/globe-terrain-art.json.

Latest validation: build and thirty Node tests passed; all twenty region markers and forty existing characters checked across desktop Chrome, mobile Chrome and mobile WebKit. Each marker opens a native modal; preview art loads. Viewport checks include 375×667 and 812×375. Paging, swipe, transparent emoji action dialogs, share cancellation, invitation deduplication, rotation and collection access passed. Physical-device touch testing and art approval remain separate.

Screenshots: artifacts/chromium-mobile-terrain-explore.png and artifacts/unified-character-modal.png. Local only; no deployment performed.

## Global monochrome terrain revision

Replaced isolated terrain anchors with a stable geographic relief field sampled across global land. Terrain is assigned to latitude/landform zones and clipped to coastlines, sorted by projected depth while rotating. Existing miniature assets now cover continents throughout both hemispheres. Canvas rendering uses a unified cool monochrome treatment; globe spirits and both playable/preview modal portraits use a darker blue-black treatment, with brighter hover/press edges. No content, balance or gameplay changes.

Production build passed. Screenshot: artifacts/monochrome-terrain-globe.png. Local preview only.

## Pumpkin planet (2026-10-29)

The globe now has a broad pumpkin silhouette, shaded vertical grooves, curved top stem and tendril, luminous triangular eyes and carved smile. Existing geographic terrain remains projected on the shell with amber/orange colors. Marker coordinates use the same flattening transform as the map. Image-based ghosts, including the Jiangshi sprite loop and modal portraits, now use a cool blue treatment.

Automatic surface rotation advances 2 degrees/second (one turn in roughly three minutes) and pauses while dragging, hovering with a mouse, keyboard-focusing a marker, showing a dialog, in a hidden document, or with reduced motion enabled. Manual interaction provides a four-second rest. All timer/frame listeners are cleaned up when leaving Explore.

Build and six desktop Chrome/mobile Chrome/mobile WebKit checks passed for rotation/pause, modal interaction, reduced motion, and the existing cute loop. Screenshot: artifacts/chromium-mobile-pumpkin-planet.png. Local only.

### Wider red-orange shell and rotating carvings

Horizontal scale increased from 1.01 to 1.13, with matching marker coordinates. Red-orange base lighting is brighter; stronger lobe normals and fine striations preserve depth. Continents and terrain now use green rather than an orange tint. Eyes and mouth are geographic polygons anchored at 105°E, 23°N, rendered through the same orthographic projection as land; they foreshorten and clip at the horizon instead of remaining screen overlays. Surface-only rotation does not change illumination direction.
