# Capture quality backlog

## Live camera guidance — implemented, physical-device acceptance pending

The in-browser camera now has advisory local preview checks (see
`ui/live-capture-quality-assist.md`) for:

- blur and camera movement;
- darkness and uneven lighting;
- glare;
- receipt edges and cropping;
- moving closer or holding steady;
- suggesting section capture for a long receipt before upload.

These hints are not processor diagnoses and never block capture. Existing later
failure handling still uses explicit processor reason codes or the general
unreadable-receipt recovery message. Physical Pixel/Samsung/iPhone testing remains
an acceptance gate; do not infer it from browser emulation. Future improvements to
contour reliability and device calibration must preserve this advisory boundary.
