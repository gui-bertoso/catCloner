# Delivery Roadmap — catCloner 4.0

Deadline: **7 days**  
Current Version: **4.3.2**  
Goal: Deliver a stable commercial version for creating authorized offline visual snapshots, with navigable pages and subpages.

---

# Delivery Definition

Version 4.0 will be considered complete when it can:

- Capture a rendered page including HTML, CSS, images, fonts, and supported media;
- Capture internal subpages within selected limits;
- Generate offline navigation between captured pages;
- Neutralize remote scripts, forms, and sensitive data;
- Pause for manual CAPTCHA solving without blocking user interaction;
- Generate ZIP files and reliable diagnostic reports;
- Fail clearly when a website cannot be reproduced;
- Pass the minimum regression testing matrix without critical issues.

## Not included in this release:

- Functional checkout, payments, orders, or offline login systems;
- CAPTCHA, DRM, paywall, or access control bypass;
- Reproduction of APIs or server-side systems;
- Guarantee of perfect reproduction of every existing website;
- Automatic Chrome Web Store publishing if the account or review process is not ready.

---

# Priorities

## P0 — Required for Release

- ZIP generation always completes or provides a clear error;
- Main HTML opens without black screens or infinite loading;
- CSS and images work locally through `file://`;
- Captured subpages open through local links;
- CAPTCHA pauses and resumes correctly;
- Form data is removed;
- Reports register failed pages and resources;
- Regression tests cover selected target websites.

---

## P1 — Important, but can receive post-release fixes

- Result summary interface;
- Capture cancellation;
- Estimated ZIP size limit;
- More readable subpage filenames;
- Improved open Shadow DOM support;
- Detection of stuck overlays and skeleton loaders;
- Refinement, reordering, and editing of Visual Flow steps.

---

## P2 — Post-launch

- Full recovery after browser restart;
- Individual adapters for major online stores;
- Export formats beyond ZIP;
- Automatic updates and optional telemetry;
- Complete captured project dashboard.

---

# Seven-Day Schedule

## Day 1 — Baseline and Reproducible Testing

### Objective:
Stop fixing problems without being able to reproduce them.

Tasks:

- Create a fixed list of test URLs;
- Run captures of single pages and three-page crawls for each website;
- Store ZIP files, `clone-report.json`, and screenshots of results;
- Classify each failure as HTML, CSS, image, link, block, or download related;
- Create a manual regression checklist;
- Freeze new features that are not P0.

Expected output:

Initial test matrix completed and prioritized failure list created.

---