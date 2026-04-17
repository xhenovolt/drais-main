# Dashboard Frontend Data Flow
_Generated: 2026-04-17_

## File: `/app/dashboard/page.tsx`

### API Calls
| SWR Key                          | Endpoint                      | Used By              |
|----------------------------------|-------------------------------|----------------------|
| `/api/dashboard/overview`        | GET with school_id, from, to  | KPIs, TopPerformers  |

### Rendering Logic
- Single SWR hook fetches `overviewData` on load, refreshes every 30s
- `overview = overviewData?.data` passed as prop to child components
- **5 mode tabs** controlled by `mode` state: `command | simple | advanced | analytics | duplicates`
- `CommandCenter` (default), `DashboardKPIs`, `SchoolHealthDashboard`, `PredictiveAnalyticsDashboard`, `DuplicateDetection`

### Responsiveness Issues
❌ Mode toggle bar overflows on mobile (horizontal scroll required)  
❌ `CommandCenter` component has unknown layout — not mobile-grid-enforced  
❌ `PredictiveAnalyticsDashboard` makes its own internal API calls (unknown depth)  
❌ `AdvancedDashboard` and `SchoolHealthDashboard` are conditionally rendered but always mounted in DOM?  
❌ Date range picker shown at top — not useful on mobile (hidden behind overflow)  
❌ No single-column enforced layout for small screens  

### Component Imports (11 dashboard components)
```
DashboardKPIs, TopPerformers, WorstPerformers, FeesSnapshot,
SubjectStats, AttendanceToday, AIInsightCard, AdvancedDashboard,
PredictiveAnalyticsDashboard, AdmissionsAnalytics, DeviceStatusWidget,
SetupChecklist, QuickActions, CommandCenter, SchoolHealthDashboard, DuplicateDetection
```
→ **All 16 imported** but only some rendered depending on mode — still affects bundle size

### What Needs To Change (Phase 5)
- Replace 5-mode tab system with single focused view
- Dashboard becomes signal layer: 5–7 intelligence signals MAX
- Add "View Full Analysis →" link to `/intelligence`
- Remove: analytics tab, duplicates tab (move to dedicated pages)
- Mobile-first: stack cards, no horizontal scroll, grid-cols-1 md:grid-cols-2
