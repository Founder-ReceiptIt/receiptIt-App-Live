# Capture quality backlog

## P1 — live camera guidance

The beta capture flow does not claim real-time computer-vision guidance. A future capture-quality iteration may add on-device checks for:

- blur and camera movement;
- darkness and uneven lighting;
- glare;
- receipt edges and cropping;
- moving closer or holding steady;
- suggesting section capture for a long receipt before upload.

Until those checks exist, ReceiptIt only shows a specific capture problem when the processor returns an explicit reason code. Otherwise it uses the general unreadable-receipt recovery message.
