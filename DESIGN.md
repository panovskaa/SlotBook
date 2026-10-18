# Design System — Office Hours

## 1. Design Direction

Create a premium, minimalist interface inspired by Apple's website design language.

The experience should feel:

- Clean, sophisticated, modern, and calm.
- Spacious, with generous whitespace and carefully controlled visual hierarchy.
- Typography-led, with large headlines and short, confident copy.
- Interactive and polished, with subtle animations and smooth transitions.
- Functional and trustworthy, suitable for a professional appointment-booking platform.

Use restraint. Every element should have a purpose. Avoid visual clutter, excessive decoration, unnecessary gradients, and generic SaaS dashboard aesthetics.

Do not copy Apple's branding, logos, or proprietary page designs. Apply the underlying design principles to our own product identity.

## 2. Color Palette

Use a neutral, light-first palette with near-black text, soft gray surfaces, and one restrained accent color.

### Core colors

- Primary background: `#FFFFFF`
- Secondary background: `#F5F5F7`
- Tertiary background: `#EBEBF0`
- Primary text: `#1D1D1F`
- Secondary text: `#6E6E73`
- Muted text: `#86868B`
- Borders and dividers: `#D2D2D7`
- Primary accent: `#0071E3`
- Accent hover: `#0077ED`
- Accent subtle background: `#EAF3FF`

### Semantic colors

- Success: `#248A3D`
- Success background: `#EAF6EC`
- Warning: `#9A6700`
- Warning background: `#FFF4D6`
- Error: `#D70015`
- Error background: `#FFF0F0`

### Color rules

- Prefer white backgrounds and subtle gray section backgrounds.
- Use the accent color primarily for primary actions, links, focus states, and selected calendar dates.
- Use dark backgrounds sparingly for a dramatic hero section or a clearly separated feature section.
- Never use multiple competing accent colors.
- Do not use gradients unless they serve a specific, justified design purpose.
- Maintain accessible text contrast.

## 3. Typography

Use a clean system font stack that feels native on each platform.

### Font family

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "Helvetica Neue",
  Arial,
  sans-serif;
```

Use system fonts first. Do not assume Apple's proprietary fonts are installed on Windows or Android.

### Type scale

- Hero headline: `clamp(3rem, 7vw, 5.5rem)`
- Page headline: `clamp(2.25rem, 5vw, 4rem)`
- Section headline: `clamp(1.75rem, 3vw, 2.75rem)`
- Card headline: `1.25rem–1.5rem`
- Body text: `1rem–1.125rem`
- Secondary text: `0.875rem`
- Small labels: `0.75rem–0.8125rem`

### Typography rules

- Use bold, large headlines with tight letter spacing.
- Hero headlines should have a line-height of approximately `0.98–1.08`.
- Body copy should be readable, with a line-height of `1.5–1.7`.
- Keep text blocks relatively narrow to improve readability.
- Use font weight and spacing to establish hierarchy instead of adding decorative elements.
- Avoid excessive uppercase text and unnecessary letter spacing.
- Use short, natural, confident copy.

## 4. Layout and Spacing

- Use a centered content container with a maximum width of approximately `1200px`.
- Use consistent horizontal page padding: `24px` on desktop and `20px` on mobile, reducing when necessary for small screens.
- Use a spacing scale based on multiples of `8px`: `8, 16, 24, 32, 48, 64, 80, 96`.
- Give major sections generous vertical padding, typically `80–120px` on desktop and `48–72px` on mobile.
- Align section headings, descriptions, and content to a consistent grid.
- Avoid filling every empty space. Whitespace is a deliberate part of the design.
- Make responsive behavior intentional, not simply a scaled-down desktop layout.

## 5. Shapes and Surfaces

- Buttons: pill-shaped or softly rounded, depending on their importance.
- Primary button radius: `999px`.
- Cards: `16–24px` radius.
- Inputs: `12–16px` radius.
- Large feature panels: `24–32px` radius.
- Use thin, subtle borders rather than heavy outlines.
- Use shadows sparingly and only to communicate depth or interaction.
- Avoid excessive glassmorphism, floating cards, and layers of nested containers.

Prefer simple, flat surfaces over unnecessary decoration.

## 6. Buttons and Interactions

### Primary buttons

- Accent-colored background with white text.
- Rounded pill shape.
- Clear, concise labels such as "Book a session" or "View availability".
- Subtle color transition on hover.
- Visible keyboard focus state.

### Secondary buttons

- Neutral background, subtle border, or text-only treatment.
- Visually subordinate to the primary action.

### Interaction states

Every interactive element must have appropriate:

- Default state.
- Hover state.
- Focus-visible state.
- Active state.
- Disabled state.
- Loading state where relevant.

Use transitions of approximately `150–250ms` for simple hover and focus effects.

## 7. Motion and Animation

Use motion to make the interface feel responsive and refined, never distracting.

- Use GSAP for complex entrance sequences, scroll-triggered effects, or coordinated animation.
- Use CSS transitions for simple hover, focus, and color changes.
- Prefer subtle opacity changes and small translations over dramatic movement.
- Hero content may animate into view with a short fade and upward movement.
- Animate section entrances only when it improves the experience.
- Avoid excessive parallax, bouncing, spinning, and continuous decorative movement.
- Keep animations performant and avoid animating layout-heavy properties unnecessarily.
- Respect `prefers-reduced-motion`.
- Ensure all essential content remains accessible when animations are disabled.
- Clean up GSAP animations correctly when React components unmount.

## 8. Booking Experience

The design must prioritize making a booking effortless.

- Present available time slots clearly and make their selection state unmistakable.
- Distinguish available, selected, booked, and unavailable slots.
- Use the accent color for selected slots and primary actions.
- Use restrained semantic colors for confirmation, warnings, and errors.
- Keep booking forms short, well-spaced, and easy to scan.
- Use clear labels and helpful validation messages.
- Make the confirmation state feel reassuring without excessive celebration.
- Never rely on color alone to communicate availability or errors.
- Make the calendar and time-slot selection easy to use on touchscreens.

## 9. Navigation

- Keep navigation minimal and easy to scan.
- Use a clean header with a simple product wordmark.
- Make the primary booking action easy to find.
- Avoid unnecessary navigation items, oversized dropdown menus, and dashboard-style sidebars unless the product genuinely requires them.
- On mobile, ensure navigation remains compact and accessible.

## 10. Responsive Design

- Design mobile, tablet, and desktop layouts intentionally.
- Avoid horizontal overflow.
- Make buttons and interactive targets comfortable to tap.
- Stack complex layouts vertically on small screens.
- Scale typography fluidly using `clamp()` where appropriate.
- Keep booking forms and calendars usable on narrow screens.
- Test at multiple viewport sizes.

## 11. Accessibility

- Use semantic HTML and accessible form labels.
- Ensure full keyboard navigation.
- Provide visible focus indicators.
- Maintain sufficient contrast.
- Respect reduced-motion preferences.
- Communicate errors and booking states through text as well as color.
- Use accessible names for icon-only buttons.
- Never sacrifice usability for visual minimalism.

## 12. Implementation Rules

Before implementing a new page or component:

1. Read this file and follow its design tokens.
2. Inspect the existing project structure and styling conventions.
3. Reuse existing components and dependencies where appropriate.
4. Avoid introducing a new UI library or animation library without a clear reason.
5. Keep components consistent with the established visual language.
6. Do not introduce arbitrary colors, font sizes, radii, or spacing values when existing tokens cover the need.
7. Test the result at desktop and mobile sizes.
8. Check loading, empty, error, disabled, and success states where applicable.

When asked to design a page, first consider its purpose, hierarchy, and user flow. Do not merely decorate a generic template.

**Guiding principle:** Make the interface feel effortless. Every detail should contribute to clarity, confidence, or delight.
