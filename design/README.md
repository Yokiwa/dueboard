# design/ — mockups and drafts

Things that are **about design but are not built into the extension**. No production code here.

```
design/
  mockups/     mockups, screenshots, PNG/SVG exported from Figma (date in the name: 2026-11-20-header-v2.png)
  incoming/    code drafts not yet moved into src/ (one folder each time: date-name/, with a README saying which file each one belongs to)
```

## Rules

1. **UI changes meant to ship go straight into the files in `src/ui/`, through a pull request.** Don't upload `.tsx` / `.css` to the repository root.
2. A design you want to show first → put it in `mockups/` and discuss it in an issue with the image.
3. If you can't use Git and can only upload code through the website → put it in `incoming/date-name/`, add a README table saying which file in `src/` each file belongs to, and open an issue (choose "UI / design") so whoever merges it knows.

Global colors, fonts and spacing are in `src/ui/tokens.css`, components in `src/ui/components/`, screens in `src/ui/views/`.
