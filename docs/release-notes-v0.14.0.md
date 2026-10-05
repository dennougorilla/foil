# FOIL v0.14.0

## New

- **On the home screen (#32).** Install FOIL from the browser and it opens like an app, offline too. A picture sent from a photo app's share menu (Android, desktop Chrome) goes straight onto the card, and a small **Update** chip says when a new version is ready.
- **MP4 for Instagram (#42).** Save or share the card as an MP4 video (1080 × 1350, H.264) where the browser can encode it. The still PNG format is gone; GIF and APNG stay.

## Fixed

- A card kept in the binder keeps its brush strokes and brings them back to the stage (#36).
- A wide trading card sets its words beside the picture, and the text area covers the words alone (#37).

## Known issues

- Snow Globe stays a hand-shaken physics simulation, so its GIF / APNG loop can jump. Finishes that change when you touch them or that run a physics simulation do not have to loop seamlessly in a file (#35).
- Offline, a font the service worker already keeps is still fetched from the network in the background, which logs an unhandled rejection (harmless; the kept font is used).
- Low-end Android performance (#31) and opening every pack at once (#43) come in v0.14.1.
