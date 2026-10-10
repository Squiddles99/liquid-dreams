# Animation reference sequences (for the hero rig)

Andrew generates these in ChatGPT; Claude marks the joints on every frame (as with the face), solves the bone angles
on Shazza's rig, and fills the in-betweens. This folder is git-ignored, like the rest of reference/.

## Rules for every sequence (they keep the frames measurable)
- Start from the mannequin frame named below (`_start/`), image-to-image. Grey mannequin, no hair, no clothes.
- Side-on: the camera square to the board's side, level, the WHOLE board in frame, same zoom and camera spot in
  every frame. Plain light grey background.
- Regular stance (left foot forward) for standing moves; she faces the same way as in the start frame.
- Best: one image holding all the frames in a row or grid (ChatGPT keeps a sheet more consistent than separate
  images). Separate images are fine too: name them 01.png, 02.png, ...
- Optional but helpful for the pop-up and the turns: the same sequence again from the front.
- One folder per sequence: `reference/anim/<name>/`.

## The sequences (key frames, not every frame: I fill the in-betweens)

| # | Folder name | Start frame | Frames | What happens |
|---|---|---|---|---|
| 1 | sit-to-paddle | sit | 8 | Sitting astride waiting, looks over her shoulder at the set, swings the board round, lies down and starts to paddle |
| 2 | paddle-cycle | paddle | 8 | One full stroke cycle, both arms (right arm enters the water, pulls, exits; then the left), so it loops |
| 3 | pop-up | paddle | 8 | Prone → hands under the chest → push up, chest rises → front foot swings under → stands in trim |
| 4 | duck-dive | paddle | 8 | Paddling → hands to the rails → pushes the nose under → knee on the tail → under → resurfaces paddling |
| 5 | bottom-turn | trim | 6 | Trim → compresses low → leans into the turn → drives up out of it |
| 6 | top-turn | trim | 6 | Trim → extends up the face → turns hard at the top (shoulders lead) → back down |
| 7 | tube-crouch | trim | 4 | Trim → crouches low, rear knee drops, back hand trails the wall |
| 8 | wipeout | trim | 6 | Trim → loses balance → arms fly out → falls off the back into the water |

Grommet's bodyboard sequences come later, with his rig.
