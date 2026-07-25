# Stonekeep — Modular 3D Dungeon Builder

A first playable vertical slice of a grid-based 3D dungeon builder. It runs locally in a modern browser and uses Three.js for real-time rendering.

## Run

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev`.
4. Open the local address shown in the terminal (normally `http://127.0.0.1:5173`).

For a production build, run `npm run build`, then `npm run preview`.

## Controls

### Build mode

- **Left-mouse drag:** preview and place a rectangular room
- **Click a room:** select it
- **Right-mouse drag:** orbit the isometric camera
- **Mouse wheel:** zoom
- **WASD / arrow keys:** pan
- **R:** rotate the selected room footprint
- **Delete:** demolish the selected room
- **Ctrl/Cmd+S:** save

### Explore mode

- Select **Explore**, then click the 3D view to capture the mouse
- **Mouse:** look
- **WASD:** move
- **Escape:** release the mouse
- **B:** return to Build mode

## Implemented

- Isometric build camera with pan, zoom, and orbit
- Visible construction grid
- Click-and-drag rectangular placement with green/red validity preview
- Modular tiled floors and automatic perimeter walls
- Automatic arched openings wherever independently placed rooms touch
- Selection, footprint rotation, and deletion
- First-person exploration with collision constrained to built floor tiles
- Data-driven Stone Keep theme with dark masonry, warm torches, atmospheric fog, stone variation, wall caps, and metal torch props
- Local browser save/load of the dungeon layout
- Responsive in-game construction palette, ledger, help, and control hints

## Architecture

`src/main.js` owns room/grid logic and generates geometry. `src/themes.js` contains all visual and atmospheric theme data: materials, lighting, fog, and prop rules. A future theme can be added to `THEMES` and selected without changing placement, adjacency, saving, or exploration logic.

Rooms are saved as compact data (`id`, grid origin, width, depth). Floors, walls, openings, lighting, and props are regenerated from that data, keeping save files small and future-friendly.

## Current limitations

- Single floor only
- Rooms are rectangular; freeform joined shapes are made by placing adjacent rectangles
- Openings appear on each shared tile edge; door style selection is not exposed yet
- Explore collision is intentionally lightweight and currently constrains the player to valid floor tiles rather than performing full capsule-vs-wall physics
- Save/load uses one local browser slot
- Props are procedural atmosphere pieces rather than individually placeable objects

## Next milestones

1. Door and corridor tools with selectable connection points
2. Decoration placement and room-purpose presets
3. Multiple save slots plus JSON import/export
4. Navmesh rebuilding for creatures and heroes
5. Stairs and multi-level construction
6. Additional data-only themes (Ancient Crypt, Infernal Forge, Frozen Ruin)
7. Gameplay layer: traps, inhabitants, resources, and raids
