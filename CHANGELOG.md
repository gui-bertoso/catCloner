# Changelog

## 4.4.0 — 2026-10-30

- Renamed the application to duckCloner and the repository to duck-cloner.
- Replaced nested cards, tiny badges and gradients with a compact, readable popup.
- Added a duck icon and a plain capture notice with actual progress.
- Removed the decorative terminal and unused full-page capture overlay.
- Clarified empty, recording, progress, cancellation and error states.
- Disabled capture on unsupported pages and unavailable recording actions.
- Kept existing recording storage keys and capture-engine APIs for compatibility.

## 4.3.2 — 2026-08-06

### Changes

- Removed the floating Previous/Next controller from exported Visual Flows.
- Navigation now uses the pages' own cards, links, forms and buttons.
- Product selection continues to propagate silently between steps.

## 4.3.1 — 2026-08-06

### Fixes

- The step panel no longer appears in Snapshot mode.
- The Snapshot/Visual Flow selection persists when the popup closes.
- Reopening the popup during recording restores Flow mode and its step list.

## 4.3.0 — 2026-08-06

### Added

- Snapshot cancellation through the popup or floating overlay.
- Cancellation of page discovery, CSS processing, downloads and compression.
- Active network requests are aborted immediately.
- Visual Flows can be canceled and fully cleared.
- Individual steps can be removed before ZIP generation.
- Remaining steps are renumbered after removal.
- Finalization and cancellation safely wait for concurrent operations.

## 4.2.0 — 2026-08-06

### Added

- Automatic Visual Flow recording tied to the current tab.
- Initial capture once the DOM stabilizes.
- Observer reinstallation after full-page navigation.
- Route-change and stable-state detection in single-page applications.
- Recording state persists when the popup closes.
- Page-fingerprint deduplication.
- Finalization waits for the last capture before generating the ZIP.
- Closing the recorded tab automatically ends the session.

## 4.1.0 — 2026-08-06

### Added

- Visual Flow catalogs can route multiple cards to a local product template.
- Selection carries the title, image and price through later steps using local parameters only.
- Previous/Next navigation preserves the selected product.
- Simulated forms retain selection through warranty and checkout steps.
- Generic heuristics recognize product routes across different store layouts.

## 4.0.1 — 2026-08-06

### Fixes

- New privacy engine masks rendered email, phone, Brazilian CPF/CNPJ identifiers, postal codes and card numbers.
- Simple address and username blocks are replaced in Visual Flows.
- Report URLs are stripped of tokens, sessions, checkout IDs and tracking parameters.
- Failure reports receive the same sensitive-URL sanitization.

## 4.0.0 — 2026-08-06

First stable release of catCloner's modular architecture.

### Added

- Separate engines for HTML, CSS, images, links, JavaScript safety and video.
- Page and internal-subpage capture with configurable limits and depth.
- Prioritization of products, articles and detail pages.
- Responsive-image preservation and removal of CSP incompatible with local files.
- Resource retries and detailed failure reports.
- Compact overlay with a real-event terminal and progress display.
- Automatic pause for manual CAPTCHA completion.
- Sanitization of forms, hidden fields and editable content.
- Persistent, multi-screen Visual Flows in a single ZIP.
- Local navigation between steps, simulated forms, buttons, tabs and safe accordions.
- Redesigned interface, originally introduced in Portuguese.

### Known limitations

- Applications requiring APIs, login, DRM or servers do not work completely offline.
- Payment frames and original scripts are deliberately removed.
- Site structure changes may require future adjustments.
- Protected, temporary or anti-bot-blocked resources may not be downloadable.
