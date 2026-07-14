---
name: TxPools Visual Framework
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363940'
  surface-container-lowest: '#0b0e14'
  surface-container-low: '#191c22'
  surface-container: '#1d2026'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2eb'
  on-surface-variant: '#cec2d8'
  inverse-surface: '#e1e2eb'
  inverse-on-surface: '#2e3037'
  outline: '#978da1'
  outline-variant: '#4c4355'
  surface-tint: '#d8b9ff'
  primary: '#d8b9ff'
  on-primary: '#450086'
  primary-container: '#9945ff'
  on-primary-container: '#ffffff'
  inverse-primary: '#7f21e5'
  secondary: '#a0ffc3'
  on-secondary: '#00391f'
  secondary-container: '#00ec91'
  on-secondary-container: '#00653b'
  tertiary: '#00e290'
  on-tertiary: '#003920'
  tertiary-container: '#008855'
  on-tertiary-container: '#ffffff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eddcff'
  primary-fixed-dim: '#d8b9ff'
  on-primary-fixed: '#290055'
  on-primary-fixed-variant: '#6300bb'
  secondary-fixed: '#56ffa8'
  secondary-fixed-dim: '#00e38b'
  on-secondary-fixed: '#002110'
  on-secondary-fixed-variant: '#00522f'
  tertiary-fixed: '#52ffac'
  tertiary-fixed-dim: '#00e290'
  on-tertiary-fixed: '#002111'
  on-tertiary-fixed-variant: '#005231'
  background: '#10131a'
  on-background: '#e1e2eb'
  surface-variant: '#32353c'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  data-tabular:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  max-width: 1280px
---

## Brand & Style

The brand personality is technical, confident, and radically transparent. This design system avoids the saturated, loud aesthetic of traditional gambling apps in favor of a sophisticated, data-driven "Protocol" aesthetic. It emphasizes the cryptographic nature of the platform—focusing on settlement, verification, and precision.

The visual direction follows a **Modern Tech** aesthetic with **Glassmorphic** accents. High-quality execution is achieved through:
- **Precision:** Thin, sharp lines and tabular alignment.
- **Depth:** Layered translucent surfaces that suggest a "stack" of data.
- **Clarity:** A focus on legibility and technical proof over marketing fluff.
- **Trust:** Utilizing a "Settlement Green" to indicate confirmed cryptographic actions.

## Colors

The palette is rooted in a deep, multi-tonal dark mode. The core interaction color is a Solana-inspired gradient used for high-intent actions and branding elements. 

- **Primary & Secondary:** Used exclusively for high-level brand moments and primary CTAs.
- **Electric Green (#00FFA3):** Reserved for "Live" status indicators, positive ROI, and "Transaction Confirmed" states.
- **Neutral/Slate:** Used for secondary information, metadata, and inactive states to keep the interface calm.
- **Borders:** A singular, consistent border color (#1E232D) is used to define glass panels without breaking the dark-mode immersion.

## Typography

The system uses **Inter** for all UI elements to maintain a clean, professional, and neutral tone. It is critical that **JetBrains Mono** (or a similar monospaced font) is used for all "Data Cells"—including betting odds, wallet addresses, and timestamps. This ensures that columns of numbers remain perfectly aligned, enhancing the technical feel of the platform.

- **Headlines:** Use Semi-bold weight to create hierarchy against data-heavy backgrounds.
- **Labels:** Use uppercase for category headers and "Proof" metadata to differentiate from actionable content.
- **Mobile:** Scale `display-lg` down to `headline-sm` for mobile views to ensure data density is maintained.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. A strict 4px baseline grid ensures technical precision.

- **Data Density:** Content should be densely packed but organized. Use 16px gutters between cards to allow the background glass effect to "breathe."
- **Horizontal Scrolling:** On mobile, categories (Leagues/Sports) should use horizontal overflow to preserve vertical space for active pools.
- **Alignment:** All data points within cards should be center-aligned vertically to the baseline to ensure the technical "ledger" look.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism** rather than traditional shadows.

1.  **Floor (Level 0):** Deep navy (#0B0E14) - The base canvas.
2.  **Surface (Level 1):** Near-black (#12161F) - Used for primary layout containers and sections.
3.  **Glass (Level 2):** Semi-transparent (Alpha 60%) with a 12px background blur and a 1px solid border (#1E232D). This is used for interactive cards and prediction pools.
4.  **Overlay (Level 3):** Modal windows or tooltips. Use a slightly lighter border and a higher blur value (20px) to indicate a higher z-index.

**Shadows:** Avoid soft, diffused shadows. Use a subtle, crisp 1px "outer glow" with 10% opacity of the accent color for active or "Live" cards.

## Shapes

The design uses a consistent **12px radius** (`rounded-lg`) for all primary containers and prediction cards. This balances the "Technical" sharpness with a "Modern" premium feel. 

- **Buttons:** Use 8px (`rounded-md`) for a slightly tighter, more functional appearance.
- **Input Fields:** Match the button radius (8px).
- **Status Pills:** Use a full pill shape (999px) for "Live" or "Settled" indicators to make them instantly recognizable as status markers.

## Components

### Buttons
- **Primary:** Gradient background (Purple to Cyan), white text, 8px radius. High-gloss finish.
- **Secondary:** Ghost style. 1px border (#1E232D) with a subtle hover state that increases background opacity.
- **Ghost/Tertiary:** Clear background, Slate text. Used for "View Details" or "Share."

### Prediction Cards
- **Structure:** 1px border, background-blur (glass). 
- **Header:** Team icons/flags (24px) with Bold Inter labels.
- **Body:** Odds displayed in `data-tabular` (JetBrains Mono).
- **Footer:** Technical metadata (Pool size, Time remaining) in Slate color.

### Inputs & Selectors
- **Search:** Deep background (#0B0E14) with a subtle inset shadow to appear recessed.
- **Toggle:** Solana-green for 'on' state. Flat, no-depth switch to maintain the modern aesthetic.

### Technical Elements
- **Verification Badge:** A small "Proof" icon with a monospaced transaction hash snippet next to settled results.
- **Live Indicator:** Electric Green pulse icon next to the "Live" text label.
- **Progress Bars:** Use for pool distribution. No rounded ends on the internal bar to keep it looking like a data instrument.