# Institutional Knowledge Platform — UI/UX Design Document

**Document:** UI/UX Design Specification  
**Version:** 1.0  
**Status:** MVP Design  
**Date:** 2026-08-13

---

## 1. Design Vision

The interface should feel:

- Simple
- Calm
- Fast
- Trustworthy
- Search-first
- Institutional without feeling bureaucratic

The product must not look like a legacy ERP.

### Design statement

> **Google-like discovery + Notion-like clarity + enterprise-grade governance.**

---

## 2. UX Principles

### 2.1 Search first

The primary action on the home page is search.

### 2.2 Show context, not just files

Do not present users with a folder full of filenames.

Every result should answer:
- What is it?
- Who published it?
- When?
- Why is it relevant?
- Is it current?

### 2.3 Progressive disclosure

Show essential information first. Reveal advanced metadata only when needed.

### 2.4 Source transparency

AI-generated summaries and answers must link back to the source.

### 2.5 Current version wins

Users should not accidentally act on outdated notices.

### 2.6 Mobile-ready by default

Many users will access the system from phones.

---

## 3. Visual Language

### Typography

Recommended:
- Inter
- Geist
- SF Pro-style system stack

Hierarchy:
- Display: 36–48 px
- Page heading: 28–32 px
- Section heading: 18–22 px
- Body: 15–16 px
- Metadata: 13–14 px

### Spacing

Use an 8 px base spacing system.

Example:
- 8
- 16
- 24
- 32
- 48
- 64

### Radius

- Small controls: 8 px
- Cards: 12 px
- Large panels: 16 px

### Color strategy

Prefer neutral UI with one institution/product accent.

Semantic colors:
- Success
- Warning
- Error
- Informational

Do not overuse accent colors.

### Borders

Use subtle borders rather than heavy shadows.

---

## 4. Global Navigation

Desktop:

```text
┌───────────────────────────────────────────────────────────┐
│ Logo   Search...                     🔔   Saved   Profile │
├──────────────┬────────────────────────────────────────────┤
│ Home         │                                            │
│ Search       │                Main Content                │
│ Notices      │                                            │
│ Documents    │                                            │
│ Calendar     │                                            │
│ Saved        │                                            │
│ Notifications│                                            │
│              │                                            │
│ Admin        │                                            │
└──────────────┴────────────────────────────────────────────┘
```

Mobile:
- Top bar.
- Search.
- Bottom navigation for high-frequency destinations.
- Admin controls remain in a separate admin area.

---

## 5. Home Screen

### Purpose

Provide immediate access to search and relevant information.

### Structure

```text
Welcome back

What are you looking for?
┌─────────────────────────────────────────────────────┐
│ 🔍  Search notices, documents, deadlines...         │
└─────────────────────────────────────────────────────┘

Try asking:
"When is exam form submission?"
"Find the hostel fee notice"

─────────────────────────────────────────────────────

Important for you
[Card] [Card] [Card]

Upcoming deadlines
[18 Aug] Examination Form
[22 Aug] Hostel Fee

Recent notices
─────────────────────────────────────────────────────
Notice title
Department · Published date
Summary
```

### UX requirements

- Search bar should autofocus on desktop optionally.
- Search suggestions should appear quickly.
- Search history is optional.
- Avoid dashboard clutter.

---

## 6. Search Experience

### Search input

Support:
- Keyword queries.
- Natural language.
- Partial memory.
- Questions.

Placeholder:

> Search anything in your institution…

### Query examples

> `exam registration`

> `notice about late fee for forms`

> `what was the hostel deadline in August?`

### Search result layout

```text
Search Results

24 results
[All] [Notices] [Circulars] [Forms] [Policies]

Filters                         Results
────────                        ─────────────────────────
Department                     Examination Form Notice
[Examination ▼]                Examination · 08 Aug 2026
                                "Submit examination forms..."
Date
[Last 30 days ▼]               Why this matched:
                                exam + form + late fee
Document type
[All ▼]                        [Open] [Save]
```

### Result card

Required:
- Title
- Document type badge
- Department
- Published date
- Summary
- Match context
- Current/superseded state

Optional:
- Important date
- Tags

---

## 7. Search Filters

Primary filters:
- Department
- Document type
- Date
- Academic year

Secondary:
- Course
- Semester
- Audience
- Tags
- Status

Filters should update results without forcing a full-page transition.

Mobile uses a filter drawer.

---

## 8. Search Empty States

### No results

Do not show only “No results.”

Instead:

> **We couldn't find an official document matching that search.**

Suggestions:
- Try fewer words.
- Remove date terms.
- Search by department.
- Try a broader phrase.

Admin users additionally see:

> **Save this as an unresolved query for review.**

---

## 9. Document Detail Screen

### Layout

```text
← Back

Examination Form Submission Notice
Examination Cell · Published 08 Aug 2026

✓ Official Document
Current version · Version 3

[Open PDF] [Download] [Share] [Save]

Summary
Students must submit the examination form...

Important dates
18 Aug 2026 — Normal deadline
19–22 Aug 2026 — Late fee window

Tags
Examination   B.Tech   Semester 6

Related documents
[Exam Schedule]
[Fee Structure]

Version history
v3 — 08 Aug 2026
v2 — 05 Aug 2026
v1 — 01 Aug 2026
```

### Source priority

The original document must remain prominent.

AI summary is supplementary.

---

## 10. Document Viewer

Use an embedded PDF viewer on desktop.

Mobile:
- Native browser/PDF experience or dedicated viewer.

Viewer actions:
- Page count
- Zoom
- Search within document
- Download
- Share

Persistent metadata panel on desktop.

---

## 11. Important Dates

### Calendar view

Month/week/list modes.

Each event should show:
- Date
- Event title
- Source document
- Institution/department
- Confidence/extraction state if automatically derived

### Date detail

> **18 August 2026**

**Examination Form Submission Deadline**

Source:
`Examination Form Notice — 08 Aug 2026`

[Open source]

---

## 12. Feed

Personal feed categories:

- For You
- Institution
- Department
- Saved topics

Card hierarchy:
1. Important/new indicator
2. Title
3. Short summary
4. Department/date
5. Important deadline
6. CTA

---

## 13. Saved Documents

Views:
- All saved
- By tag
- Recently saved

Optional future feature:
- Collections

Example:

`My Semester 6`

---

## 14. Ask Institution UI

The AI surface should look like a search assistant, not a generic chatbot.

### Example

User:
> When is the last date to submit the exam form?

Assistant:

> The normal deadline is **18 August 2026**.

**Sources**
1. Examination Form Submission Notice — 08 Aug 2026
2. Examination Cell Circular — 05 Aug 2026

[Open source]

### Rules

- Every factual answer gets a source.
- No source = no confident answer.
- Answers should be concise by default.
- Users can expand supporting evidence.

---

## 15. Admin Dashboard

### Top-level cards

- Published documents
- Pending approvals
- Searches this month
- Unresolved searches

### Main table

Columns:
- Document
- Department
- Status
- Version
- Published
- Updated
- Actions

### Quick actions

- Upload document
- Create notice
- Review queue
- Import archive

---

## 16. Upload Flow

### Step 1 — Upload

Drag/drop or file picker.

### Step 2 — Processing

Show:
- Upload
- OCR
- Text extraction
- Metadata extraction

Do not hide processing status.

### Step 3 — Review

Admin sees:

```text
Detected title      [_______________]
Document type       [Notice ▼]
Department          [Examination ▼]
Published date      [08/08/2026]
Academic year       [2026–27]
Important dates     [18/08/2026]
Tags                [exam, form]
Audience            [6th semester]
```

### Step 4 — Publishing

Options:
- Save draft
- Submit for review
- Publish, if authorized

---

## 17. Approval Queue

Each row:
- Document title
- Submitter
- Department
- Submitted date
- Risk/attention flag
- Review action

Review screen:
- PDF
- Extracted metadata
- OCR preview
- Proposed tags
- Audience
- Version relationship

---

## 18. Status Design

Use labels and icons.

- Draft
- In review
- Approved
- Published
- Superseded
- Archived
- Processing
- Processing failed

Never rely solely on color.

---

## 19. Notifications UX

Notification should answer:

> What happened?  
> Why do I care?  
> What should I do?

Example:

**New notice relevant to you**

Examination Cell published a new notice.

**Action:** Submit exam form by 18 Aug.

[Read notice]

---

## 20. Accessibility

- Full keyboard support.
- Focus visible.
- Labels for all form controls.
- Accessible modal/dialog behavior.
- No color-only status.
- Minimum touch target of ~44 px on mobile.
- Alt text for meaningful icons/images.
- Screen-reader-friendly document metadata.

---

## 21. Responsive Breakpoints

Suggested baseline:

- Mobile: < 768 px
- Tablet: 768–1023 px
- Desktop: ≥ 1024 px
- Wide desktop: ≥ 1440 px

The interface should prioritize content over decorative elements.

---

## 22. UX Quality Bar

A successful first-time user should be able to:

1. Search a notice.
2. Understand a result.
3. Open the source.
4. Find the relevant date.
5. Share the source.

without onboarding.

---

## 23. Empty / Error States

### No saved documents

> Documents you save will appear here.

### Processing failed

> We couldn't process this document automatically.

Actions:
- Retry
- Continue manually
- Contact administrator

### Permission denied

> You don't have permission to view this document.

Do not reveal restricted metadata.

---

## 24. Design System Components

Core components:
- Button
- Input
- Search bar
- Select
- Multi-select
- Badge
- Card
- Document row
- Table
- Filter chip
- Date chip
- Modal
- Drawer
- Toast
- Pagination
- Empty state
- Skeleton
- PDF viewer
- Notification item
- Timeline
- Approval stepper

---

## 25. UX Principle for AI

AI should be:

**Helpful → Explainable → Source-backed → Optional**

Never:

**Magical → Unverifiable → Authoritative without evidence**
