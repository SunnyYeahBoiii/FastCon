# Design System Document: The Logical Architect

## 1. Overview & Creative North Star
**Creative North Star: The Logical Architect**
In the world of competitive programming, clarity is synonymous with speed. This design system moves away from the cluttered, "dashboard-heavy" aesthetics of legacy platforms and instead embraces a high-end editorial approach. We treat code as art and logic as the narrative. By utilizing intentional asymmetry, expansive breathing room, and a sophisticated tonal hierarchy, we create an environment that feels less like a tool and more like a professional workstation.

The "template" look is discarded in favor of **Layered Precision**. We replace rigid, high-contrast borders with subtle shifts in surface luminosity, guiding the eye through the logic of the interface without the visual noise of traditional structural lines.

---

## 2. Colors & Surface Philosophy
The palette is a curated spectrum of technical blues and clinical whites, designed to minimize cognitive load during long-form problem solving.

### The "No-Line" Rule
To achieve a signature, premium feel, **1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined through:
- **Background Color Shifts:** Placing a `surface-container-low` component on a `surface` background.
- **Tonal Transitions:** Using depth to signify the end of one logical block and the start of another.

### Surface Hierarchy & Nesting
We treat the UI as a series of nested physical layers.
- **Base Layer:** `surface` (#f7f9fb)
- **Primary Content Area:** `surface-container-low` (#f2f4f6)
- **Interactive Cards/Elements:** `surface-container-lowest` (#ffffff)
- **Elevated Modals/Overlays:** `surface-bright` (#f7f9fb) with Glassmorphism.

### The "Glass & Gradient" Rule
Standard flat colors feel "out-of-the-box." To elevate the experience:
- **Floating Navigation:** Use `surface` with 80% opacity and a `20px` backdrop blur.
- **Main CTAs:** Apply a subtle linear gradient (135°) from `primary` (#003d9b) to `primary-container` (#0052cc). This provides a "soul" to the action buttons that flat fills lack.

---

## 3. Typography: Be Vietnam Pro
We use **Be Vietnam Pro** for its geometric clarity and exceptional legibility in technical contexts.

- **Display (lg/md/sm):** Used for "Problem Solved" states and high-impact stats. Use `-0.02em` letter spacing to feel more "editorial."
- **Headline (lg/md/sm):** Reserved for problem titles. These are the anchors of the page.
- **Title (lg/md/sm):** Used for section headers within a problem description.
- **Body (lg/md):** Optimized for long-form reading of problem statements. Line height should be a generous `1.6` to prevent eye fatigue.
- **Label (md/sm):** Used for metadata (Time limit, memory limit, difficulty tags). Always in `Medium` or `SemiBold` weight.

---

## 4. Elevation & Depth
Hierarchy is conveyed through **Tonal Layering** rather than structural scaffolding.

### The Layering Principle
Depth is achieved by stacking the surface-container tiers. Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a natural "lift" that feels integrated into the architecture.

### Ambient Shadows
When an element must float (e.g., a dropdown or a syntax-help tooltip), use **Ambient Shadows**:
- **Blur:** `24px` to `40px`
- **Opacity:** `4% - 8%`
- **Color:** Use a tinted version of `on-surface` (#191c1e). Never use pure black.

### The "Ghost Border" Fallback
If containment is required for accessibility (especially in the Dark Theme), use a **Ghost Border**:
- **Token:** `outline-variant` (#c3c6d6)
- **Opacity:** `15%`
- **Weight:** `1px`

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), white text, `md` (0.375rem) rounding.
- **Secondary:** `surface-container-high` background, `primary` text. No border.
- **Tertiary:** Transparent background, `primary` text, `outline-variant` Ghost Border on hover.

### Input Fields & Selects
Inputs must feel like a part of the workspace. 
- **Style:** Use `surface-container-highest` with a `sm` (0.125rem) rounding for a "square-ish" but professional look. 
- **Focus State:** Transition the background to `surface-container-lowest` and add a `2px` `primary` bottom-border only (an "editorial underline") to minimize boxy-ness.

### Code Editor Surface
The editor is the sanctum of the platform.
- **Background:** `surface-container-lowest` (Light) or `inverse-surface` (Dark).
- **Rounding:** Use `none` on the code area itself, but `md` (0.375rem) on the container holding it to frame the logic.
- **Nesting:** The editor should sit "inside" the page, using a `surface-dim` shadow to look recessed.

### Cards & Problem Lists
- **Rule:** **No divider lines.**
- **Separation:** Use `1.5rem` to `2rem` of vertical whitespace (Gap) or alternate background tints between `surface-container-low` and `surface-container-lowest`.

### Chips (Tags)
- **Style:** `sm` rounding. Use `secondary-container` for background and `on-secondary-container` for text. Keep padding tight: `4px 12px`.

---

## 6. Do's and Don'ts

### Do:
- **Use "Signature Whitespace":** Give complex algorithmic problems room to breathe. If it feels too empty, add more margin, not more borders.
- **Use Tonal Nesting:** Always place a lighter container inside a darker section (in Light mode) to draw the eye inward toward the content.
- **Apply Glassmorphism:** Use for code-completion dropdowns and floating action menus to maintain a sense of depth.

### Don't:
- **Never use 100% opaque borders:** They break the "editorial" flow and make the platform look like a generic bootstrap site.
- **Avoid standard drop shadows:** Use the Ambient Shadow values; high-contrast, tight shadows are forbidden.
- **Don't use dividers in lists:** Use the Spacing Scale to create logical grouping. If you feel you need a line, you actually need more whitespace.
- **No fully circular buttons:** Keep the "Logical Architect" vibe with `md` (0.375rem) or `lg` (0.5rem) rounding; pills are too soft for a competitive environment.