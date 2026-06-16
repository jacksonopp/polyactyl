# Feature Specification: Run Individual Requests

**Feature Branch**: `001-run-individual-requests`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "explore the codebase and use the mcp server to come up with some suggestions for improvements. A specific thing that I want is the ability to choose which http request to run in a .http file that contains multiple requests. Also suggest other things."

## Overview

A `.http`/`.rest` file commonly contains many requests separated by `###`. Today, pressing **Send** always executes the *entire* file, top to bottom. This feature lets a user run exactly the request they care about, navigate quickly between requests in a file, stop a request that is taking too long, send from the keyboard, and export a response after it returns.

These capabilities are delivered as independently shippable slices, prioritized so that the most-requested behavior (running a single request) is the MVP.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a single request inline (Priority: P1)

A user editing a multi-request file wants to run just one of the requests without running the others. An inline **Send** affordance appears directly above each request in the editor. Clicking it runs only that request and shows its response.

**Why this priority**: This is the explicitly requested core capability and the primary daily pain point. The supporting backend (single-request execution by name/line) already exists; only the in-editor affordance and wiring are missing. Delivers immediate, standalone value.

**Independent Test**: Open a file with three requests, click the inline Send above the second request, and confirm that only the second request is executed and its response is displayed.

**Acceptance Scenarios**:

1. **Given** a file with multiple requests is open, **When** the user clicks the inline Send affordance above a specific request, **Then** only that request is sent and its response is shown in the response viewer.
2. **Given** the selected environment(s) are set, **When** the user runs a single request inline, **Then** the request is executed against those same selected environment(s).
3. **Given** a request is already in progress, **When** the user clicks an inline Send, **Then** the app does not start a second overlapping run (the affordances are disabled or queued per the app's existing single-flight behavior).
4. **Given** a file with one request, **When** the user clicks its inline Send, **Then** the behavior matches sending the whole file.
5. **Given** a request has no explicit name, **When** the user clicks its inline Send, **Then** the correct request is still identified and run (by its position in the file).

---

### User Story 2 - Navigate and run from a request outline (Priority: P2)

A user with a long file wants to see every request at a glance, jump to one, and optionally run it from the list.

**Why this priority**: Improves orientation in large files and reuses the same per-request metadata the P1 work surfaces. Valuable but secondary to actually running a single request.

**Independent Test**: Open a file with several named and unnamed requests, open the outline, click an entry, and confirm the editor scrolls/moves focus to that request; trigger run from the outline and confirm only that request runs.

**Acceptance Scenarios**:

1. **Given** a file with multiple requests is open, **When** the user views the request outline, **Then** every request in the file is listed in document order with its name (or a sensible label like method + URL when unnamed).
2. **Given** the outline is shown, **When** the user selects an entry, **Then** the editor moves to that request's location.
3. **Given** the outline is shown, **When** the user runs a request from the outline, **Then** only that request is executed.
4. **Given** the active file changes or its contents change, **When** requests are added or removed, **Then** the outline reflects the current set of requests.

---

### User Story 3 - Send from the keyboard and cancel in-flight requests (Priority: P3)

A keyboard-driven user wants to send without reaching for the mouse, and any user wants to stop a request that is hanging.

**Why this priority**: Quality-of-life and resilience. Builds naturally on P1 (the keyboard send targets the request at the cursor) and addresses a current gap where an in-flight request cannot be stopped.

**Independent Test**: Place the cursor inside a request and press the send shortcut to confirm only that request runs; start a slow request and use the cancel control to confirm it stops and the UI returns to a ready state.

**Acceptance Scenarios**:

1. **Given** the cursor is inside a request, **When** the user presses the send keyboard shortcut, **Then** that request is sent.
2. **Given** the cursor is not inside any request (e.g., in file-level variables), **When** the user presses the send shortcut, **Then** the app falls back to a clearly defined behavior (run whole file) rather than doing nothing silently.
3. **Given** a request is in progress, **When** the user activates cancel, **Then** the request stops, no response is recorded as successful, and the UI returns to a state where new requests can be sent.
4. **Given** a request completes normally, **When** the user looks for the cancel control, **Then** it is no longer active.

---

### User Story 4 - Export or copy a response (Priority: P4)

After a request returns, a user wants to save the response body to a file or copy it for use elsewhere.

**Why this priority**: Useful follow-on once responses can be produced precisely, but not required for the core run-selection workflow.

**Independent Test**: Run a request that returns a body, use the export/copy action, and confirm the saved file (or clipboard contents) matches the displayed body.

**Acceptance Scenarios**:

1. **Given** a response with a body is displayed, **When** the user chooses to copy the body, **Then** the clipboard contains the body exactly as shown.
2. **Given** a response with a body is displayed, **When** the user chooses to save the body, **Then** the user can pick a location and the saved file contents match the body.
3. **Given** a response has no body, **When** the user looks for export/copy actions, **Then** they are disabled or clearly unavailable.

---

### Edge Cases

- A file with zero requests (only variables/comments): inline Send affordances do not appear; whole-file send behaves as today.
- A request inside a disabled/commented region: it is either not offered an inline Send or, if run, the system reports it as disabled rather than failing opaquely.
- Two requests sharing the same name: selection still targets the specific request the user acted on (by position), not the first match.
- Unsaved edits in the editor: running a single request uses the current in-editor content, consistent with how whole-file send already uses live content.
- Request boundaries shift as the user types: the inline affordance and outline stay aligned with the request they belong to.
- Cancel pressed after the request already completed (race): the app does not error and the response (if any) is shown or discarded consistently.
- Very large response body: copy/save still works without freezing the interface.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display an inline "Send" affordance associated with each individual request in an open `.http`/`.rest` file.
- **FR-002**: The system MUST execute only the targeted request when its inline Send affordance is activated.
- **FR-003**: The system MUST run individually-selected requests against the same environment selection currently chosen for the file.
- **FR-004**: The system MUST correctly identify the targeted request whether or not it has an explicit name, including when multiple requests share a name.
- **FR-005**: The system MUST use the current (possibly unsaved) editor content when running an individual request.
- **FR-006**: The system MUST prevent overlapping concurrent runs consistent with the app's existing single-send behavior.
- **FR-007**: The system MUST present a navigable outline listing every request in the active file in document order, each with a name or a sensible fallback label.
- **FR-008**: The system MUST move the editor to a request's location when its outline entry is selected.
- **FR-009**: The system MUST allow running a request directly from the outline.
- **FR-010**: The system MUST keep the outline in sync as requests are added, removed, or renamed in the active file.
- **FR-011**: The system MUST provide a keyboard shortcut that sends the request containing the text cursor.
- **FR-012**: The system MUST define and apply a deterministic fallback when the keyboard send is invoked with the cursor outside any request (run the whole file).
- **FR-013**: The system MUST allow the user to cancel an in-flight request and return the UI to a ready state.
- **FR-014**: The system MUST clearly indicate when a request is in progress and when cancellation is available.
- **FR-015**: The system MUST allow the user to copy a displayed response body to the clipboard.
- **FR-016**: The system MUST allow the user to save a displayed response body to a file of their choosing.
- **FR-017**: The system MUST disable or hide export/copy actions when there is no response body.

### Key Entities *(include if data involved)*

- **Request region**: A single executable request within a file, characterized by its name (optional), its position in the file (start/end), method, and target URL. Used to target individual execution, drive the outline, and resolve the cursor's containing request.
- **Response**: The result of executing a request, characterized by status, headers, body, and timings. Source for export/copy actions.
- **Run selection**: The user's choice of what to execute — a specific request (by name or position) versus the whole file — passed to the execution engine.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an open multi-request file, a user can run a chosen request in a single action (one click) without running any other request.
- **SC-002**: When a single request is run, no other request in the file is executed (0 unintended executions), verified across named, unnamed, and duplicate-named requests.
- **SC-003**: A user can locate and jump to any request in a file with 25+ requests in under 5 seconds using the outline.
- **SC-004**: A user can send the request at the cursor entirely from the keyboard, with no pointer interaction.
- **SC-005**: An in-flight request can be stopped, and the app returns to a ready-to-send state within 2 seconds of cancellation.
- **SC-006**: A displayed response body can be copied or saved with contents byte-identical to what is shown.
- **SC-007**: The existing whole-file send behavior remains available and unchanged.

## Assumptions

- The existing single-request execution capability in the backend (selecting a request by name or by line/position) is reused; no new execution engine is required.
- Individual-request runs reuse the existing environment selection and live-content model already used by whole-file send.
- "Cancel" means stopping the current run from the user's perspective and restoring a ready UI state; the precise network-abort semantics are an implementation detail to be settled in planning, but the user-visible outcome (UI ready, no successful response recorded) is fixed by this spec.
- Response export targets the response body. Exporting full request/response metadata (headers, timings) as a bundle is out of scope for this version.
- The request outline scope is the currently active file; cross-file search/navigation is out of scope here (a command palette already exists for file switching).
- Desktop keyboard conventions apply for the send shortcut (a modifier+Enter style binding), chosen during planning to avoid conflicts with existing shortcuts (e.g., Save).

## Out of Scope

- Running an arbitrary multi-selection of several (but not all) requests in one action.
- Request history / persisting past responses across sessions.
- cURL import/export and code generation.
- Cross-file request search or a global request index.
