/**
 * /students/list — src/app/students/list/page.tsx, lines 1487–2600: the render of
 * StudentsListPage (live popup, header, toolbar, table, pagination, bulk bar, modals).
 */
const notes: Record<string, string> = {
  'StudentsListPage.render#1': 'The page layout: a full-height column (`h-screen`, only the table scrolls) with the live-scan popup, a sticky header band (title, tabs, Add student), a sticky toolbar (search, filters, capture mode, export and tools), the table with sticky header and client-side pagination footer, the floating bulk-action bar, and every modal/drawer.',

  // ── frame + live popup ─────────────────────────────────────────────────────
  'lines:1488': 'Outer frame: full viewport height, column layout, `overflow-hidden` so the page itself never scrolls — the table area (line 1845) is the scroll container. Light/dark backgrounds.',
  'lines:1492-1506': `StudentsListLivePopup receives a light copy of every loaded learner (both tabs) so that, when a punch arrives, it can show name, photo, class and balance from memory without a server lookup. Balance prefers the live balances map, then the row's own value. Rebuilt on every render of the page (a new array each time).`,

  // ── header band ────────────────────────────────────────────────────────────
  'lines:1510': 'Header band: sticky at the top (z-50), 56 px high, white / slate-900.',
  'lines:1511-1516': 'Title "Students" and the count of the active tab, formatted for the language (Arabic digits).',
  'lines:1519-1533': 'Tab toggle (segmented control), "Enrolled" button: switches tab, clears the selection and resets to page 1; highlighted when active; badge with the enrolled count. `ml-2` is a physical margin.',
  'lines:1534-1548': '"Admitted" button — same pattern.',
  'lines:1550': 'Spacer pushing the CTA to the end.',
  'lines:1553-1557': 'Primary action: link to /students/admit ("Add student").',

  // ── toolbar ────────────────────────────────────────────────────────────────
  'lines:1560': 'Toolbar: sticky under the header (top-14, z-40), translucent with backdrop blur.',
  'lines:1563-1573': 'Search box: icon, input bound to `search` (every keystroke refetches — see effect#5 — and resets the page), widens on focus. The "⌘K" hint is decorative: there is no keyboard shortcut handler anywhere on the page. Icon/kbd positions use physical left/right (not mirrored in RTL).',
  'lines:1576-1601': `Class filter (Enrolled tab, hidden below sm): "All classes" plus the classes grouped into <optgroup>s by programme (programme name, or a translated "General").

The "flat list" shortcut compares the group key with the literal 'General' — in Arabic the key is the translation, so the optgroup is always used there (cosmetic).`,
  'lines:1603-1613': 'Year filter: option 0 = current ("current term" label), then every academic year (Arabic digits). Choosing a year switches the API to historical mode.',
  'lines:1615-1622': '× button clearing class, year and gender filters — shown only when one of them is set.',
  'lines:1625-1636': 'Gender filter (both tabs): all / male / female — applied in the browser (filteredData).',
  'lines:1637-1644': 'On the Admitted tab the class/year clear button does not exist, so a separate × clears the gender filter.',
  'lines:1647-1649': 'Two identical flex spacers (one is redundant).',
  'lines:1652': 'Right-hand action group.',
  'lines:1655-1667': 'Last-enrolled panel (green): name, device PIN ("UID"), time; tooltip with device and full time; × to dismiss. Times use the browser locale.',
  'lines:1670-1683': 'Capture-mode button: icon and colour show the mode (Wi-Fi = local, radio = relay, globe = cloud/ADMS); tooltip names the IP or device. The wrapper holds `modeSettingsRef` for outside-click detection.',
  'lines:1685-1690': 'Popover (when open): a full-screen transparent layer that closes it on click (redundant with effect#2\'s outside-click listener), and the panel itself with its title. `right-0` — physical side.',
  'lines:1691-1722': 'Three mode buttons — Cloud (ADMS), Relay, Local — each with an icon, name and one-line hint; the active one is highlighted. Selecting only changes `captureMode` (saved to localStorage by effect#1).',
  'lines:1724-1740': 'Relay mode: device serial input (trimmed on every change) and a note that the relay agent must be running.',
  'lines:1741-1754': 'Local mode: device IP input (placeholder is the same hard-coded school IP as the default).',
  'lines:1755-1758': 'Close the panel, the popover fragment and the wrapper.',
  'lines:1761-1782': 'Export menu: icon button, outside-click layer, and CSV / Excel items exporting `filteredData` (the whole filtered list, not just this page; not the selection). Disabled while exporting.',
  'lines:1784-1787': 'Link to /students/promote (promotion).',
  'lines:1789-1792': 'Link to /students/trash (soft-deleted learners).',
  'lines:1795-1810': 'Fees toggle (Enrolled tab): green when the column is visible; spinner while balances refresh.',
  'lines:1812-1820': 'Import → /students/import-v2 (the redesigned importer). The legacy ImportModal is still mounted at line 2512 but nothing on the page opens it any more (`setShowImportModal(true)` is never called).',
  'lines:1822-1828': 'Folder photo upload (FolderPhotoUploadModal).',
  'lines:1830-1833': 'Sync from device (SyncDeviceModal).',
  'lines:1835-1838': 'Delete ALL learners — a red bin in the same toolbar as everyday tools, guarded by two confirmations (handleDeleteAllLearners).',
  'lines:1840-1841': 'Close the action group and the toolbar.',

  // ── table head ─────────────────────────────────────────────────────────────
  'lines:1844-1846': 'Table area: fills the remaining height; the inner div scrolls in both directions; the table has a 640 px minimum width (narrow screens scroll sideways).',
  'lines:1848-1854': 'Sticky header row; first column: select-this-page checkbox (handleSelectPage).',
  'lines:1855-1860': 'Biometric column header (fingerprint + face icons).',
  'lines:1861-1862': 'Student and Reg No columns.',
  'lines:1863-1869': 'Enrolled tab only: Class (≥ sm), Stream and Type (≥ md).',
  'lines:1870-1872': 'Admitted tab only: Admitted date (≥ sm).',
  'lines:1873-1875': 'Status; Gender and Residency only on large screens (≥ lg) — on smaller screens these inline editors are hidden.',
  'lines:1876-1878': 'Balance column (Enrolled + Fees on), right-aligned.',
  'lines:1879-1881': 'Empty header cell above the row actions; end of head.',

  // ── body states ────────────────────────────────────────────────────────────
  'lines:1882-1884': 'Body: while loading, 12 skeleton rows.',
  'lines:1885-1901': 'Empty state: icon, "No results for <search>" or "No enrolled / admitted learners", and "Clear search" when searching. colSpan 11 / 8 (the real column counts vary with Fees and the tab — harmless, the cell just spans to the end).',
  'lines:1902-1911': 'One row per learner of this page: cast to EnrolledStudent for enrolled-only fields, selected state, zebra striping, indigo when selected; `group` lets the action buttons appear on row hover. Key combines tab and id.',
  'lines:1913-1917': 'Row checkbox (handleSelectStudent).',

  // ── biometric cell ─────────────────────────────────────────────────────────
  'lines:1920-1922': 'Biometric cell: fingerprint button and face button side by side.',
  'lines:1923-1954': 'While a capture is running, the fingerprint slot shows its step instead of the button: spinner (waking), pulsing fingerprint (sent / waiting for the finger), green check (success), red alert (failed); the tooltip carries the progress message.',
  'lines:1955-1968': 'Idle: compute the level from the rich status (label, finger count, face) — none / pending / problem / one / two / many — and build the tooltip: level, which fingers (translated), PIN, device, and "click to add another finger". Without rich status it falls back to the legacy boolean ("Active" / "Not enrolled", with English literals as inputs to fingerprintLevel).',
  'lines:1969-1979': 'The fingerprint button, coloured by level (inline style colour); click → handleQuickCapture. Clicking again adds the NEXT finger, it never overwrites (server behaviour).',
  'lines:1980-1989': 'Face slot: spinner while a face request is in flight.',
  'lines:1990-2008': 'Otherwise the face button: green when captured, amber when requested on the device, grey otherwise; click → handleFaceCapture.',
  'lines:2009-2010': 'Close the biometric cell.',

  // ── data cells ─────────────────────────────────────────────────────────────
  'lines:2013-2015': 'Name cell (NameCell — inline edit in English, Arabic display in Arabic), max 220 px.',
  'lines:2018-2020': 'Admission number (monospace) or "—".',
  'lines:2023-2043': 'Enrolled: one chip per enrollment — "<programme>: <class>" — so a multi-programme learner shows every class. Uses the raw `class_name`, not the localized `class_name_display` (unlike NameCell\'s subtitle). `mr-0.5` physical margin.',
  'lines:2044-2046': 'Stream (raw name) or "—".',
  'lines:2047-2055': 'Enrollment type chip (raw value, capitalised by CSS — not translated).',
  'lines:2058-2062': 'Admitted: admission date formatted with the en-GB locale regardless of language.',
  'lines:2065-2067': 'Status badge: the row\'s `status` if present (set by bulk status), else the enrollment status (Enrolled) or "admitted".',
  'lines:2070-2072': 'Gender (GenderCell), ≥ lg.',
  'lines:2075-2077': 'Residency (ResidencyCell), ≥ lg.',
  'lines:2080-2109': 'Balance (Enrolled + Fees on): pulsing bar while refreshing; otherwise a pill linking to /students/:id/fees — red when owing (> 0), green when fees were charged and nothing is owed, grey when nothing was charged; tooltip shows charged and paid with 2 decimals; the value is formatted without decimals in the interface language.',

  // ── row actions ────────────────────────────────────────────────────────────
  'lines:2112-2113': 'Action cell: buttons invisible until the row is hovered (`opacity-0 group-hover:opacity-100`). On touch screens there is no hover, so they stay invisible (they remain tappable if you know where they are). [recommended] show them always on touch devices.',
  'lines:2114-2118': 'Enrolled: Eye → /students/:id (profile).',
  'lines:2119-2130': 'Pencil → QuickEditDrawer with the row\'s fields (several read through `any` because the row types do not declare them).',
  'lines:2131-2137': 'Activity → LearnerSnapshotModal.',
  'lines:2138-2144': 'RowMore menu: Fees ledger link and Soft delete (danger).',
  'lines:2145-2157': 'Admitted: Enroll (opens EnrollmentModal) and RowMore with Soft delete and Permanent delete. **[defect]** Permanent delete is offered for learners that are NOT soft-deleted, but /api/students/delete-permanent refuses anything not already soft-deleted (400 "Student must be soft-deleted first") — so this menu item always fails here; it only makes sense on the Trash page.',
  'lines:2158-2163': 'Close the action cell, the row, the map and the body ternary.',
  'lines:2164-2166': 'Close body, table and the scroll container.',

  // ── pagination ─────────────────────────────────────────────────────────────
  'lines:2169-2173': 'Footer (only with rows): "Showing a–b of N" — numbers passed raw to the translation.',
  'lines:2174-2181': 'Previous page (disabled on page 1); chevron flips in RTL.',
  'lines:2182-2194': 'Up to 5 page pills centred on the current page: `mid` keeps the window inside 1…totalPages; the current page is indigo; numbers in Arabic digits.',
  'lines:2195-2205': 'Next page; close the footer and the table area.',

  // ── modals ─────────────────────────────────────────────────────────────────
  'lines:2208-2226': 'EnrollmentModal (single learner): the form, its setter (which also re-validates), the error, the validity flags, every option list, toggleProgram, and handleEnroll as submit.',
  'lines:2229-2242': 'Floating bulk-action bar (only with a selection): springs up from the bottom centre (framer-motion); the outer wrapper ignores pointer events so only the bar itself is clickable; selected count.',
  'lines:2243-2250': '"Move class" (English literal) → ReassignClassModal.',
  'lines:2251-2258': '"Enroll" (English) → BulkEnrollModal — shown on both tabs, although enrolling is meant for admitted learners.',
  'lines:2259-2289': '"Assign Program" (Enrolled tab): look at the selected learners\' programme names; if everyone only has "theology" suggest "secular" and vice versa (programme names matched in English, lower-case — schools with other programme names get no suggestion); open BulkAssignProgramModal.',
  'lines:2290-2312': '"Status" menu: active / suspended / graduated / left — the raw codes are shown (capitalised by CSS), not translated → handleBulkStatus.',
  'lines:2313-2335': '"Residency" menu: day / boarding (raw codes) → handleBulkResidency.',
  'lines:2336-2347': `Two buttons both labelled "Message": teal → the in-page composer (handleBulkMessage via /api/admin/comm/broadcast), sky → BulkSmsModal. Same label and icon for two different paths — the user cannot tell them apart.`,
  'lines:2348-2353': 'Photos → BulkPhotoUploadModal for the selected learners.',
  'lines:2354-2364': '× clears the selection (the bar animates away).',
  'lines:2367-2375': 'ReassignClassModal: submit → handleReassignClass(newClassId, reason).',
  'lines:2378-2390': 'BulkAssignProgramModal with every option list and the suggested programme.',
  'lines:2391-2419': 'Its submit (inline): POST /api/enrollments/bulk-assign {student_ids, program_id, class_id, term_id, academic_year_id, study_mode_id?, stream_id?}. apiFetch shows a success toast and line 2408 another one (two toasts). Close, clear selection, reload.',
  'lines:2422-2433': 'BulkEnrollModal with option lists.',
  'lines:2434-2462': 'Its submit: POST /api/students/bulk/enroll with the chosen ids (zeros sent as undefined). Again two success toasts. Close, clear, reload.',
  'lines:2465-2483': 'BulkPhotoUploadModal — always mounted (opens via `open`); receives the SELECTED learners of the active tab only; on completion closes, toasts and reloads.',
  'lines:2486-2509': 'FolderPhotoUploadModal — receives ALL learners of the active tab (to match file names); on completion applies the returned id → photo URL map optimistically, toasts the count, and reloads anyway.',
  'lines:2512-2518': 'Legacy ImportModal — mounted but never opened (see line 1812).',
  'lines:2525-2529': 'DeviceSelector for capture: closing it also forgets the pending learner; choosing a device → handleDeviceSelected.',
  'lines:2532-2537': 'SyncDeviceModal with the remembered local IP and relay serial as defaults.',
  'lines:2540-2547': 'In-page bulk message composer (teal "Message"): backdrop closes on mousedown unless sending; the panel stops propagation; title "Messages — Guardians"; hint with the selected count.',
  'lines:2548-2558': 'Textarea (max 1600 characters) with a live character count.',
  'lines:2559-2567': 'Cancel and Send (English literal "Send"); Send disabled while sending or when empty.',
  'lines:2570-2575': 'LearnerSnapshotModal for the chosen learner.',
  'lines:2578-2583': 'BulkSmsModal for the selection; on success an English toast "Message sent to N recipient(s)" and the selection is cleared.',
  'lines:2586-2598': 'QuickEditDrawer: classes as {value, label}; on save merge the updated fields into the row in both lists and toast.',
};

export default notes;
