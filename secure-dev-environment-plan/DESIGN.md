# DESIGN.md — Secure Development Environment Plan

## 0. Design Basis

No preset branch matched (academic / consulting / red-gold). This deck is a technical proposal discussion, not a paper, a consulting report, or a government briefing, so general design principles apply. Visual source: the local demo UI the client has already seen (the SENTINEL console) — white background, deep green as the primary color, and monospace type for status and file names. Goal: the deck and the live demo speak the same visual language, so the client does not feel they are two different things.

Style keywords: restrained, auditable, engineering-minded, no showing off, low saturation.

## 1. Canvas and Master

- Canvas: 1280 × 720 px (16:9)
- Slide padding: top 26 px, bottom 18 px, left and right 64 px
- A · Title block: y 0–118 (title baseline y=44, 36 px bold; subtitle y=88, 17 px)
- B · Content area: y 118–660 (542 px usable)
- C · Footer bar: y 660–702; left side `SENTINEL · Secure Development Environment Plan`, right side `NN / 15`, both 14 px, color #6B7A72
- Cover / section divider / closing slide omit the C-area page number and use a 14 px section marker in the bottom-right corner instead.

## 2. Colors (4 hex values + semi-transparent)

| Role | hex | Use | Area |
|---|---|---|---|
| Background | `#FFFFFF` | Base for the whole deck | Main color field |
| Primary | `#167762` | Titles, color blocks, flow nodes, table headers | ≤ 40% |
| Ink | `#0F1E19` | Body text, emphasized numbers | Neutral |
| Accent | `#C2410C` | Only for "risk / not verified / needs a decision" markers | ≤ 8% |

Semi-transparent strategy:
- Light fill blocks `rgba(22,119,98,0.07)`, for card backgrounds and the second layer below table headers
- Divider lines `rgba(15,30,25,0.12)`
- Light risk fill `rgba(194,65,12,0.08)`

Gradient: allowed in one place only, the cover and section dividers: `linear-gradient(135deg, #167762 0%, #0F1E19 100%)`. Everywhere else, solid colors. No gradients across the whole deck.

## 3. Fonts

| Level | Font | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Cover title | Microsoft YaHei | 72 | bold | 1.15 | -0.5 |
| Section headline | Microsoft YaHei | 64 | bold | 1.1 | 0 |
| Oversized number | Consolas | 96 | bold | 1.0 | -2 |
| Page title | Microsoft YaHei | 36 | bold | 1.3 | 0 |
| Card subtitle | Microsoft YaHei | 22 | bold | 1.4 | 0 |
| Body | Microsoft YaHei | 19 | normal | 1.65 | 0 |
| Table text | Microsoft YaHei | 16 | normal | 1.45 | 0 |
| Notes / eyebrow labels | Microsoft YaHei | 15 | normal | 1.5 | 0.5 |
| Footer | Microsoft YaHei | 14 | normal | 1.4 | 0 |

Two font families: titles and body use Microsoft YaHei; numbers and file names use Consolas. No third family.

## 4. Density and White Space

- Regular content slides: total body text ≥ 180 characters; white space ≤ 35%
- Cards at least 380 px tall need ≥ 100 characters of body text; at least 480 px need ≥ 130 characters
- Container fill ratio ≥ 85%. Anchor the last element in a card to the bottom with `marginTop: 'auto'`
- Hero slides (P01 / P09 / P15) may use up to 40% white space, but it must surround a focal element

## 5. Image System

This deck does not use photographs. A security plan is about boundaries and flows, and photos would weaken credibility.

- L1 main visual: structure diagrams, flow diagrams, large color blocks; at least 40% of area B
- L2 supporting figure: comparison tables and small structure diagrams, at least 280×180
- L3 corner marks: the project name at the bottom left of the footer, and the section-number color block on the left, in the same position across the deck

Structure diagrams are always built from Box + Text (flex layout), never bitmaps, so they stay editable in PowerPoint and do not blur.

## 6. Page Mapping Table

| # | File | Type | Role | Layout | L1 file | Words | White space | Color allocation | Key constraint |
|---|---|---|---|---|---|---|---|---|---|
| 01 | 01.slide | cover | hero | full-bleed visual with title overlapping the edge | deep-green gradient block | 40 | 35% | primary 60% + ink 30% | Left 58% is a color block; the title sits on top of it |
| 02 | 02.slide | catalog | supporting | title left + content right | — | 140 | 28% | primary 20% + neutral | Each of the three chapters carries a page range |
| 03 | 03.slide | section | transition | full-screen visual + large title | oversized 01 | 30 | 45% | primary 45% | Left-hand number takes 40% |
| 04 | 04.slide | content | supporting | asymmetric two columns 60:40 | left-column comparison table | 240 | 20% | primary 25% | Left 60: table; right 40: quote-to-understanding mapping |
| 05 | 05.slide | content | supporting | title left + content right | left color-block title bar | 230 | 22% | primary 30% | Left column 30%, vertical title |
| 06 | 06.slide | section | transition | full-screen visual + large title | oversized 02 | 30 | 45% | primary 45% | Same structure as P03, different number and copy |
| 07 | 07.slide | content | supporting | chart + insight | three-column comparison table | 260 | 18% | primary 25% + accent 8% | Table takes 62%; insight box sits bottom right |
| 08 | 08.slide | content | supporting | large diagram on top + cards below | internal-network boundary diagram | 210 | 22% | primary 35% | Diagram 58% on top, three cards below |
| 09 | 09.slide | content | hero | asymmetric two columns 65:35 | five-level vertical flow | 220 | 25% | primary 40% + accent 8% | Left 65% flow; right 35% oversized 26 |
| 10 | 10.slide | content | supporting | large figure left + text right | four-step retrieval flow | 200 | 24% | primary 30% | Left 55% flow; right 45% text |
| 11 | 11.slide | content | supporting | asymmetric two columns 60:40 | capability / cost comparison | 250 | 20% | primary 25% | Left 60: comparison; right 40: disaster recovery |
| 12 | 12.slide | section | transition | full-screen visual + large title | oversized 03 | 30 | 45% | primary 45% | Same structure as P03 |
| 13 | 13.slide | content | supporting | chart + insight | two-column status table | 250 | 18% | primary 25% + accent 10% | Green left, brick red right; strict separation |
| 14 | 14.slide | content | supporting | title left + content right | left numbered color blocks | 220 | 24% | primary 30% | Left column 30%; five numbered items |
| 15 | 15.slide | ending | hero | centered quote / oversized number | large centered text | 40 | 40% | primary 50% | Quote at 44 px; small sign-off line |
