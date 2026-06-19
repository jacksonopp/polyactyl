# Feature Specification: Fix Remember Last Open Directory

**Feature Branch**: `002-fix-remember-directory`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "the current feature of 'it remembers which directory you had open' doesn't appear to work. Please diagnose and create a spec to fix this issue."

## Diagnosis *(context — what is broken and why)*

The app already intends to remember the last opened folder: when a user opens a
folder (or a file), the chosen directory is meant to be saved as the `lastDirectory`
preference, and on the next launch the file sidebar attempts to restore it.

The restore-on-launch logic and the user preference store are wired up correctly.
The defect is in the persistence layer that reads and writes user preferences: the
preference read/write operations do not actually receive the key (and, for writes,
the value) that the rest of the app passes to them. As a result:

- Saving the last directory silently stores nothing usable — the `lastDirectory`
  value is never persisted under its intended name.
- Reading the last directory on launch always comes back empty.

The net user-visible effect is that the app never reopens the folder you last had
open, even though every other part of the feature behaves as if it should.

This specification defines the corrected, expected behavior. It is scoped to making
the "remember the last opened directory" feature work; persisting other session state
(open tabs/files, scroll position, selected environment) is explicitly out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reopen the last folder on launch (Priority: P1)

A user opens a folder of `.http`/`.rest` files, works in it, and later closes the
app. The next time they launch the app, the same folder is already open in the file
sidebar without any manual action.

**Why this priority**: This is the entire feature and the reported defect. Restoring
the last folder is what makes the app usable across sessions; without it the user
must re-navigate to their working folder on every launch.

**Independent Test**: Open a folder, fully quit the app, relaunch it, and confirm the
same folder's file tree is shown automatically.

**Acceptance Scenarios**:

1. **Given** the app has no previously remembered folder, **When** the user opens a
   folder, **Then** that folder becomes the remembered folder.
2. **Given** the user opened a folder in a previous session and then quit, **When**
   the user relaunches the app, **Then** the file sidebar automatically shows that
   same folder and its file tree.
3. **Given** a folder is already open in the current session, **When** the app
   restores on launch, **Then** it does not discard or override the already-open
   folder.

---

### User Story 2 - Remember the folder after opening an individual file (Priority: P2)

A user opens a single `.http`/`.rest` file rather than a folder. The folder that
contains that file becomes the remembered folder, so it is restored on next launch.

**Why this priority**: Opening a file is a common entry point; users expect the app
to "land" them back in the same working area regardless of whether they opened a
folder or a file. Lower than P1 because the core mechanism is shared with Story 1.

**Independent Test**: Open an individual file (not a folder), quit, relaunch, and
confirm the containing folder is restored in the sidebar.

**Acceptance Scenarios**:

1. **Given** no remembered folder exists, **When** the user opens an individual file,
   **Then** the file's containing folder becomes the remembered folder.
2. **Given** the user opened an individual file in a previous session, **When** they
   relaunch the app, **Then** that file's containing folder is restored in the sidebar.

---

### Edge Cases

- **Remembered folder no longer exists** (moved, renamed, or deleted, e.g. an external
  drive that is unplugged): the app MUST start without a folder open and MUST NOT crash
  or hang. It SHOULD present the normal "no folder open" state so the user can open
  another folder.
- **No folder has ever been opened** (first run / fresh install): the app starts in the
  normal "no folder open" state.
- **Switching folders within a session**: opening a different folder updates the
  remembered folder to the most recently opened one, so the newest choice is restored
  next launch.
- **Corrupted or unreadable preferences store**: the app MUST treat it as "no remembered
  folder" and continue to launch normally, rather than failing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the user opens a folder, the system MUST persist that folder's path
  as the remembered last-opened directory.
- **FR-002**: When the user opens an individual file, the system MUST persist the file's
  containing folder as the remembered last-opened directory.
- **FR-003**: The system MUST persist a saved preference value under the exact name it
  was given, and MUST return that same value when later asked for it by that name.
- **FR-004**: On launch, when no folder is open in the current session, the system MUST
  read the remembered last-opened directory and, if one exists, open it automatically in
  the file sidebar (loading its file tree).
- **FR-005**: On launch, if a folder is already open in the current session (e.g. after a
  hot reload), the system MUST NOT overwrite it with the remembered directory.
- **FR-006**: If the remembered directory cannot be read (missing, inaccessible, or the
  preference store is corrupted), the system MUST fall back to the "no folder open" state
  and continue to function normally.
- **FR-007**: The remembered directory MUST persist across full application restarts (not
  only within a single run).
- **FR-008**: Opening a new folder or file MUST update the remembered directory so the
  most recent choice is what gets restored next launch.

### Key Entities *(include if feature involves data)*

- **Remembered last-opened directory**: The filesystem path of the folder the user most
  recently had open, stored as a named user preference and restored on next launch.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After opening a folder and fully restarting the app, the same folder is
  restored automatically in 100% of launches where the folder still exists.
- **SC-002**: A value saved under a preference name is returned unchanged when read back
  by that same name in 100% of cases (the underlying persistence defect is eliminated).
- **SC-003**: Restoration on launch requires zero manual steps from the user — the folder
  appears without the user clicking "Open Folder".
- **SC-004**: When the remembered folder no longer exists, the app launches successfully
  to the "no folder open" state with no crash or hang, in 100% of such launches.

## Assumptions

- A single "last opened directory" is remembered (the most recent one); a multi-entry
  "recent folders" history is out of scope.
- Restoring other session state — open tabs/files, editor cursor/scroll position, and the
  selected environment — is out of scope for this fix.
- The existing user-preferences store (a JSON file in the app's user-data location) is the
  correct persistence mechanism and is reused as-is; no new storage is introduced.
- The existing restore-on-mount behavior in the file sidebar and the existing in-app
  directory state are correct and are kept; only the preference read/write persistence
  path needs correcting.
- "Folder" and "directory" refer to the same concept throughout this spec.
