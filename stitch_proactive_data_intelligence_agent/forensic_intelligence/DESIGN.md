---
name: Forensic Intelligence
colors:
  surface: '#081425'
  surface-dim: '#081425'
  surface-bright: '#2f3a4c'
  surface-container-lowest: '#040e1f'
  surface-container-low: '#111c2d'
  surface-container: '#152031'
  surface-container-high: '#1f2a3c'
  surface-container-highest: '#2a3548'
  on-surface: '#d8e3fb'
  on-surface-variant: '#c0c6d5'
  inverse-surface: '#d8e3fb'
  inverse-on-surface: '#263143'
  outline: '#8a919f'
  outline-variant: '#414753'
  surface-tint: '#a7c8ff'
  primary: '#a7c8ff'
  on-primary: '#003061'
  primary-container: '#3291ff'
  on-primary-container: '#002a55'
  inverse-primary: '#005eb2'
  secondary: '#bec6e0'
  on-secondary: '#283044'
  secondary-container: '#3f465c'
  on-secondary-container: '#adb4ce'
  tertiary: '#b7c8e1'
  on-tertiary: '#213145'
  tertiary-container: '#8292aa'
  on-tertiary-container: '#1a2b3e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a7c8ff'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#004788'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#081425'
  on-background: '#d8e3fb'
  surface-variant: '#2a3548'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-base:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
  label-caps:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  stack-compact: 8px
  stack-dense: 4px
---

## Brand & Style
The design system is engineered for the high-stakes environment of private intelligence and data forensics. The brand personality is **proactive, authoritative, and precise**, moving away from soft consumer-tech trends in favor of a "terminal-plus" aesthetic. It balances the information density of a financial workstation with the streamlined efficiency of modern AI tools.

The visual style is **Corporate Modern with subtle Brutalist structural influences**. It prioritizes extreme legibility, logical hierarchy, and rapid scanning. The emotional response should be one of total confidence and professional rigor—evoking the feeling of a sophisticated "command center" for business operators and analysts.

## Colors
The palette has transitioned to a **Dark Mode** foundation to provide a focused, low-strain environment suitable for long-duration analysis and high-stakes monitoring.

- **Intelligence Blue (#2E90FF):** Reserved strictly for primary actions, active states, and critical paths.
- **Deep Navy & Slate:** Used for structural typography and iconography to maintain a grounded, "forensic" feel against the dark backdrop.
- **Semantic Anomalies:** 
    - **High Severity (Coral/Red):** For immediate threats or data anomalies.
    - **Medium (Amber):** For warnings and items requiring attention.
    - **Resolved (Emerald):** For validated data and completed tasks.
- **Backgrounds:** Use a tiered system of deep slates and navies to differentiate between the primary workspace background and interactive containers.

## Typography
This design system utilizes **Geist** for its neutral, technical clarity and exceptional readability at small sizes. For data points, timestamps, and log entries, **JetBrains Mono** is employed to reinforce the forensic, precise nature of the platform.

- **Data Density:** Use `body-sm` as the primary size for table data and dashboard content. 
- **Hierarchy:** Maintain high contrast between labels (`label-caps`) and values. 
- **Responsiveness:** On mobile, `display-lg` should scale down to 24px. Ensure that mono-spaced data elements maintain a minimum of 12px for accessibility during field reviews.

## Layout & Spacing
The system follows a **4px base grid** with a focus on **compact density**. The layout philosophy is a **Fluid-Fixed Hybrid**: sidebars and navigation are fixed-width to preserve utility, while the main dashboard area is fluid to maximize screen real estate on ultra-wide monitors.

- **Dashboards:** Utilize a 12-column grid with 16px gutters. Elements should snap to the grid to maintain structural alignment.
- **Side Panels:** Use a standard 320px width for "Forensic Details" or "Entity Inspector" panels.
- **Mobile:** Reflow 12-column layouts into a single vertical stack with 16px horizontal margins. Hide secondary metadata behind "View Details" drawers to prevent visual noise.

## Elevation & Depth
Depth is communicated through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows. This maintains a clean, digital-first feel in the dark interface.

- **Level 0 (Background):** Primary background surface (deepest layer).
- **Level 1 (Cards/Panels):** Defined using subtle tonal shifts (slightly lighter than background) and low-opacity borders.
- **Level 2 (Modals/Popovers):** Highest tonal contrast with a very soft, dark shadow to provide separation from Level 1 surfaces.
- **Interactive States:** Use a subtle "Intelligence Blue" border change on hover to indicate interactivity without shifting the layout.

## Shapes
The shape language is **Soft (0.25rem)**. This provides enough of a modern touch to feel premium while remaining sharp enough to feel professional and technical. 

- **Primary Elements:** Buttons and input fields use the 4px (`0.25rem`) radius.
- **Large Containers:** Dashboard cards and main content areas may use up to 8px (`0.5rem`) for subtle differentiation.
- **Status Badges:** Use a strict 2px radius or remain sharp-edged to distinguish them from interactive buttons.

## Components
- **Buttons:** Primary buttons are solid "Intelligence Blue" with high-contrast text. Secondary buttons use a slate border. For "Destructive" forensic actions, use a subtle red outline.
- **Status Badges:** 
    - `NEW`: Intelligence Blue, outlined.
    - `ONGOING`: Amber background, black text.
    - `RESOLVED`: Emerald background, white text.
- **Data Tables:** High-density, no vertical borders. Use zebra-striping on hover only. Headers should use `label-caps`.
- **Input Fields:** Defined by subtle borders with a focus state that adds a 1px "Intelligence Blue" ring.
- **Charts:** Use a refined palette of blues, teals, and grays. Avoid excessive color; use color only to highlight the specific data anomaly being analyzed.
- **Entity Cards:** Compact containers housing a title, a "Confidence Score" indicator, and a small mono-spaced preview of the source data.