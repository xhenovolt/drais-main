# DRAIS 1.200.0

DRAIS is a School Operational Intelligence Infrastructure for schools. It is designed to give institutions a more structured and accountable view of the day-to-day operations that shape the school experience — attendance, learner records, staff administration, biometric identity, communication, passout activity, fee operations, and reporting.

DRAIS is not just an attendance tool. Attendance is a critical foundation, but a school’s operational reality extends far beyond whether a learner was present. DRAIS brings key operational information into one managed environment so school leaders, administrators, teachers, and support teams can work from more reliable institutional signals.

## What DRAIS is

DRAIS helps schools move beyond fragmented record-keeping and disconnected tools. It provides a connected operational layer for:

- learner and staff administration
- school attendance intelligence
- biometric person identification and device-linked attendance records
- communication with parents and guardians
- passout and permission management
- identity, issuance, and institutional records
- finance, fees, and staff-related administration
- dashboards, reports, and operational oversight

The current codebase indicates a mature operational platform for schools, particularly in Uganda, with web, desktop, and Android delivery surfaces.

## Who it is for

DRAIS is built around the people who run a school day to day:

- school leadership and management
- administrators and school operations teams
- teachers and class managers
- bursars and finance staff
- security and movement-management personnel
- parents and guardians
- learners

The platform’s implementation supports these institutional roles through role-aware workflows, school-scoped data, and operational reporting.

## What it currently delivers

### School Operational Visibility

DRAIS gives schools a more coherent operational view of attendance, learner records, device-related activity, communication, and administrative status. Instead of relying on paper registers, isolated spreadsheets, ad hoc logs, and disconnected notifications, the platform helps convert those signals into a managed school record.

### Learner & Staff Management

The system supports the structured administration of learners, staff, teacher allocations, and institutional profiles. This includes key school data management needed to support attendance, communication, reporting, and day-to-day administration.

### Biometric Attendance

DRAIS integrates with biometric device infrastructure and supports identity resolution for attendance events. This is operationally important because it helps schools connect a real person to a recorded attendance event with traceable evidence, rather than relying on purely manual or ambiguous records.

### Attendance Intelligence

Attendance is not only about presence or absence. DRAIS evaluates attendance activity against configured rules, reconciles device timing and identity information, and surfaces operational signals that help schools review attendance more reliably. The codebase reflects a strong emphasis on time intelligence, rule evaluation, raw-event auditability, and device-clock resolution.

### Communication

The platform includes communication mechanisms for sending institutionally relevant information to parents and guardians, with notification policies and outbox processing built into the system. This is a real delivery mechanism, not just a placeholder architecture.

### Passout & Permission Management

DRAIS supports request, approval, verification, and gate-event handling for learner movement and permission workflows. This helps schools manage controlled exits and returns with more accountability, including the ability to tie actions to verification methods and notification rules.

### Identity & ID Cards

The system supports learner, staff, and institutional identity data as part of school operations. It also includes issuance-related functionality for institutional documentation and identity surfaces such as ID cards.

### Reporting & Management Information

DRAIS includes report generation and management reporting capabilities, with structured data pipelines for academic reporting and operational summaries. It supports schools in reviewing records, performance, and institutional activity in a more disciplined way.

## Why DRAIS exists

Schools generate large amounts of operational information every day, but that information often remains fragmented across paper registers, spreadsheets, device logs, communication channels, staff records, and administrative processes.

DRAIS exists to bring relevant school information into a more structured environment so that operational data is easier to manage, interpret, and act upon. It is designed to improve visibility, accountability, and consistency in the systems schools use to run daily operations.

## Current Release

### DRAIS 1.200.0

This is the current product baseline for the platform.

DRAIS 1.200.0 represents a stable and dependable operating baseline for institutional use: continuity, maintainability, predictable operations, and a controlled path for product evolution. It is intended to be a mature release point for schools rather than a transient development snapshot.

## Platform scope

DRAIS is delivered through multiple surfaces:

- Web application
- Desktop application for Windows and Linux
- Android APK build
- Progressive web application support

The project is built on Next.js, React, TypeScript, and a MySQL-compatible backend model with TiDB Cloud support in production. The codebase also includes operational tooling for database management, device integration, school health checks, and platform administration.

## Repository structure

```text
src/
app/               Next.js application pages and routes
lib/               the platform’s operational engines
components/        shared user-interface components
locales/           user-facing English and Arabic strings
data/              structured product data such as changelog metadata
docs/              engineering documentation
workers/             device and relay automation
android/            Android build configuration
scripts/            build, migration, and maintenance tooling
electron/           desktop shell
```

## Documentation

- [docs/README.md](docs/README.md) — engineering documentation index
- [docs/adr/README.md](docs/adr/README.md) — architecture decision records
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, testing, and contribution workflow
- [src/lib/attendance/README.md](src/lib/attendance/README.md) — attendance engine
- [src/lib/biometric/README.md](src/lib/biometric/README.md) — biometric identity and enrollment
- [src/lib/passouts/README.md](src/lib/passouts/README.md) — passout and gate logic
- [src/lib/notifications/README.md](src/lib/notifications/README.md) — notification queue and fanout

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

For production builds and platform packaging, see the project scripts in `package.json`. The current application version is:

```text
Current release
1.200.0
```

The changelog metadata used by the application lives in `src/data/changelog.json`.

## Ownership

DRAIS is designed, built, and maintained by Xhenvolt. It is a production platform for schools and institutional operations.

## License

Proprietary. All rights reserved.
