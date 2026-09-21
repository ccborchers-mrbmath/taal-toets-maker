# Adjustable generated images

## What will change
- Add compact minus, plus, and reset controls to every generated option image.
- Let users drag an image within its square to reposition the visible subject.
- Show the adjustment immediately in the page preview without regenerating the image.
- Save each image’s zoom and horizontal/vertical position automatically.
- Invalidate the cached question-paper PDF after an adjustment so the next export uses the latest framing.
- Apply the saved zoom and position when rendering each image in the PDF, while keeping the original source quality and clipping only at the existing question-paper box.

## Interaction details
- Zoom will have safe minimum and maximum limits to prevent the image becoming unusably small or excessively enlarged.
- Dragging will work with mouse and touch and remain constrained enough that the image cannot be moved entirely out of view.
- Existing images will retain the current 1.32× framing until adjusted.
- Reset restores the current default framing and centered position.

## Technical details
- Add persistent zoom and X/Y offset fields to image options through a database migration, preserving existing ownership protections.
- Extend the assessment query and local types with those fields.
- Add a focused image-position editor using pointer events and existing design-system buttons.
- Update PDF image placement to read the persisted transform values instead of always applying a fixed centered zoom.
- Verify type safety and test zoom, drag, persistence, reset, and regenerated PDF output.
