# Walkthrough: Resolved Bugs & Vulnerabilities

This walkthrough outlines the implementations to address the 11 Critical, High, and Medium severity bugs and security vulnerabilities identified in the system.

## Summary of Changes

---

### 1. Concurrency Race Conditions in Stock Deductions (Critical)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [requisition.controller.js](file:///z:/MedOPS/App/server/controllers/requisition.controller.js)
  * [discard.controller.js](file:///z:/MedOPS/App/server/controllers/discard.controller.js)
* **Changes**: 
  * Requisition approval and waste discard stock checks are now performed **inside** the Prisma database transaction (`$transaction`). Stale memory calculations are prevented, making deductions robust against concurrent race conditions.

---

### 2. Medication Stocktake Positive Discrepancy Failure (High)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [stocktake.controller.js](file:///z:/MedOPS/App/server/controllers/stocktake.controller.js)
* **Changes**: 
  * Modified the stocktake `complete` logic. If there is a positive count discrepancy for a medication, the system will fall back to updating any active/expired batch if the oldest active batch is `null`. If no batches exist at all (e.g., system quantity was 0), it automatically provisions a new reconciled batch (`RECONCILED`) to maintain FIFO integrity.

---

### 3. CSV Bulk Import Medication Batch Mismatch (High)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [import.controller.js](file:///z:/MedOPS/App/server/controllers/import.controller.js)
* **Changes**: 
  * When importing medications with `initialQty > 0`, the system now automatically creates a corresponding default medication batch (`IMPORT-[SKU]`) and links it to the inbound transaction log. This prevents imported medications from being locked out of co-verification or dispensing.

---

### 4. Stocktake Count Entry Blocked for Clinical Staff (High)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [permissions.js](file:///z:/MedOPS/App/server/lib/permissions.js)
  * [App.jsx](file:///z:/MedOPS/App/client/src/App.jsx)
  * [Layout.jsx](file:///z:/MedOPS/App/client/src/components/Layout.jsx)
  * [Stocktake.jsx](file:///z:/MedOPS/App/client/src/pages/Stocktake.jsx)
  * [stocktake.routes.js](file:///z:/MedOPS/App/server/routes/stocktake.routes.js)
* **Changes**: 
  * Created a new permission `enter_stocktake_count` and mapped it to TOP_ADMIN, INVENTORY_MANAGER, NURSE, and SUPPLY_OFFICER roles. 
  * Updated UI route guards, sidebar link visibility, and line entry count inputs in the Stocktake panel to check for `enter_stocktake_count` instead of `initiate_stocktake`. Regular clinical staff can now contribute physical count inputs, while the initiation and final completion/adjustments remain secured for administrators.

---

### 5. Insecure Patient List and Details Endpoints (HIPAA Concern) (High)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [patient.routes.js](file:///z:/MedOPS/App/server/routes/patient.routes.js)
* **Changes**: 
  * Secured `/patients` list endpoint to only allow users with `manage_patients`, `submit_requisition`, or `view_inventory_logs` permissions.
  * Secured `/patients/:id` patient charts detailed endpoint to strictly require the `manage_patients` permission, protecting sensitive medical history.

---

### 6. Invalid Prisma Query Silently Empties Low-Stock Reports (Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [report.controller.js](file:///z:/MedOPS/App/server/controllers/report.controller.js)
* **Changes**: 
  * Replaced the invalid column-to-relation Prisma comparison with programmatic, in-memory filtering in Node.js. Section 2 ("Low-stock and out-of-stock items") of the monthly report now compiles and reports correctly.

---

### 7. Insecure Requisition Get Detail Endpoint (Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [requisition.controller.js](file:///z:/MedOPS/App/server/controllers/requisition.controller.js)
* **Changes**: 
  * Enforced requisition details ownership verification. If the requester has the `NURSE` role, they are strictly blocked from fetching requisitions unless they are the original submitter.

---

### 8. Overlapping Top Admin Permission Mapping (Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [permissions.js](file:///z:/MedOPS/App/server/lib/permissions.js)
* **Changes**: 
  * Filtered out `comment_on_logs` from the default `TOP_ADMIN` permission keys array, ensuring Top Admins are restricted from leaving management-level audit flags/comments, adhering to the RBAC guidelines.

---

### 9. Fixed JWT Lifetime Prevents Active Session Renewal (Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [authenticate.js](file:///z:/MedOPS/App/server/middleware/authenticate.js)
* **Changes**: 
  * Implemented sliding session renewal on the server-side authentication middleware. If a valid authenticated user performs an API request and less than 10 minutes (or half of the token lifetime) remains, a new cookie containing an extended JWT token is issued.

---

### 10. Missing Expiry Date Validation on Stock Receipt (Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [stock.controller.js](file:///z:/MedOPS/App/server/controllers/stock.controller.js)
* **Changes**: 
  * Added validation in `receiveStock` to reject requests that attempt to register a new medication batch with a past expiry date.

---

### 11. Bypassable Medication Discard Batch Validation (Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [discard.controller.js](file:///z:/MedOPS/App/server/controllers/discard.controller.js)
  * [Discards.jsx](file:///z:/MedOPS/App/client/src/pages/Discards.jsx)
* **Changes**: 
  * Enforced medication batch validation in the discard workflow. The backend discard API and front-end discard form now strictly require a `batchId` if the item is a medication.

---

### 12. Stocktake Layout, Notification Deep Link, & Robustness Fixes
* **Status**: ✅ Fixed
* **Files Modified**:
  * [stocktake.controller.js](file:///z:/MedOPS/App/server/controllers/stocktake.controller.js)
  * [Stocktake.jsx](file:///z:/MedOPS/App/client/src/pages/Stocktake.jsx)
* **Changes**:
  * **Deep Link Correction**: Corrected the backend notification link for initiated stocktakes from the non-existent `/stocktakes/:id` client route to `/stocktake`.
  * **Initial Auto-Select**: Configured the `/stocktake` view to automatically detect and select any active `IN_PROGRESS` stocktake session on initial page load, immediately displaying the count sheet to counting staff.
  * **Custom React Confirmation Modal**: Replaced the native browser `confirm()` popup (which was getting blocked/ignored by certain browser settings or extensions, preventing the initiation from firing) with a custom React confirmation modal.
  * **Modal CSS Class Restoration**: Corrected class styling for both the "Initiate Stocktake" and "Complete Stocktake" modals from `modal-backdrop`/`modal` to the correct design system's `modal-overlay`/`modal-content` classes. This fixes their positioning and ensures they display as beautiful, centered overlay boxes with background dimming and blur.
  * **Layout Columns Auto-Fit**: Applied explicit, well-proportioned widths to the table header columns in the stocktake count sheet to prevent the right side of the sheet (physical counts, discrepancies, actions) from overflowing and clipping in the two-column layout.
  * **Database Upsert Resilience**: Upgraded the stock level reconciliation step to use `upsert` instead of `update`, ensuring that completing a stocktake succeeds even if a global stock level record for an item is temporarily missing or deleted.

---

### 13. Insecure Notification Read Update Endpoint (Low)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [notification.controller.js](file:///z:/MedOPS/App/server/controllers/notification.controller.js)
* **Changes**:
  * Upgraded `markRead` to use `updateMany` filtering by both the notification `id` and the user's `userId: req.user.id`. This blocks IDOR attacks where a user could guess IDs to modify other staff members' notifications.

---

### 14. Duplicate Stock Alert Spam (Low)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [stock.controller.js](file:///z:/MedOPS/App/server/controllers/stock.controller.js)
* **Changes**:
  * Optimized `checkAndFireAlerts` to check for existing unread notifications of the same event type and item link before creating new ones. Managers are no longer flooded with redundant warnings on consecutive stock updates.

---

### 15. Notification Dropdown Layering Fix (UI/UX)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [index.css](file:///z:/MedOPS/App/client/src/index.css)
* **Changes**:
  * Added `position: relative;` and `z-index: 99;` to the `.navbar` top header container. This correctly places the top navigation bar and all its overlay panels (such as the notification bell dropdown and user profile popup) above any positioned widgets, tables, and cards in the main page content layout.

![Notification Dropdown Open Overlay](/C:/Users/rfsga/.gemini/antigravity-ide/brain/4b955bd3-3195-4931-8ee6-577331a9b9ef/notification_dropdown_open_1783404834940.png)

---

### 16. Return Item Concurrency & Safety Fixes (Critical/Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [return.controller.js](file:///z:/MedOPS/App/server/controllers/return.controller.js)
  * [requisition.controller.js](file:///z:/MedOPS/App/server/controllers/requisition.controller.js)
  * [ReturnItem.jsx](file:///z:/MedOPS/App/client/src/pages/ReturnItem.jsx)
* **Changes**:
  * **Concurrency Lock**: Added dummy updates at the start of return transactions to acquire exclusive write locks in SQLite, preventing race conditions on concurrent return requests.
  * **Expired Batch Validation**: Added check to prevent returning stock to expired batches, eliminating phantom inventory.
  * **Multi-batch Requisition Returns**: Requisition line returns now properly distribute the returned quantity across the multiple batches from which the items were originally outbound, LIFO-style.
  * **Archived Item Block**: Blocked returns of archived items in both dispense and requisition pathways.
  * **Ownership Scoping**: Added role and ownership verification checks to `getReturnedQty` to protect user privacy.
  * **Requisition Improvements**: Added integer checks to line approvals and blocked nurses from co-verifying their own requisition line items.
  * **Frontend Upgrades**: Filtered out fully-returned logs from dropdowns and rounded quantity inputs to integers.

---

### 17. Return & Requisition Logic Fixes — Part 2 (High/Medium)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [return.controller.js](file:///z:/MedOPS/App/server/controllers/return.controller.js)
  * [requisition.controller.js](file:///z:/MedOPS/App/server/controllers/requisition.controller.js)
  * [dispense.controller.js](file:///z:/MedOPS/App/server/controllers/dispense.controller.js)
  * [Dispense.jsx](file:///z:/MedOPS/App/client/src/pages/Dispense.jsx)
  * [user.controller.js](file:///z:/MedOPS/App/server/controllers/user.controller.js)
  * [user.routes.js](file:///z:/MedOPS/App/server/routes/user.routes.js)
* **Changes**:
  * **Auto-discard Expired Returns**: Modified the return controller to automatically log a discard event (and net-zero stock adjustment) when expired items are returned, solving the physical waste deadlock.
  * **Bedside Co-Verification for Direct Medication Dispense**: Enforced bedside co-verification for direct dispense of medications. Added a secure endpoint `/api/users/co-verifiers` for co-verifier listings, updated the frontend direct dispense form to conditionally require a second clinical staff selection, and logged co-verifier names in the notes field.
  * **Requisition Cancellation Guard**: Blocked requisition cancellations if any of the line items are already approved.
  * **Deleted Batch Protection**: Handled deleted batch anomalies gracefully by routing deletion checks to a clean 400 bad request error.

---

### 17. Return & Requisition Workflow Safeguards (Medium/High)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [return.controller.js](file:///z:/MedOPS/App/server/controllers/return.controller.js)
  * [requisition.controller.js](file:///z:/MedOPS/App/server/controllers/requisition.controller.js)
* **Changes**:
  * **Expired Return Auto-Discard**: If a clinical return is made against an expired batch, the system now automatically accepts the return for audit integrity, but instantly marks the items as discarded (`EXPIRED` reason) in the same transaction. This prevents stock-level deadlocks and orphan physical waste logging.
  * **Deleted Batch Graceful Handling**: Added check to prevent server crashes if the batch has been deleted from the database.
  * **Requisition Cancellation Guard**: Implemented check in the cancellation process to block users from cancelling requisitions that have already had line items approved, eliminating race condition inconsistencies.

---

## Verification & Testing
The fixes have been successfully validated using a programmatic test harness [verify_fixes.js](file:///C:/Users/rfsga/.gemini/antigravity-ide/brain/4b955bd3-3195-4931-8ee6-577331a9b9ef/scratch/verify_fixes.js).

Verification results:
- **Requisition Cancellation**: Blocked from cancelling requisitions with approved lines.
- **Auto-Discard of Expired Returns**: Verified that returning an expired medication logs both the return transaction and an immediate auto-discard transaction, preserving net stock at zero and correctly registering physical waste.
- **Deleted Batch Return**: Succeeded without crashing when batch is missing.

---

### 18. 200-Day Supplier Return Warning for Batch-Tracked Items
* **Status**: ✅ Implemented
* **Files Modified**:
  * [Items.jsx](file:///c:/medops/medops/client/src/pages/Items.jsx)
  * [report.controller.js](file:///c:/medops/medops/server/controllers/report.controller.js)
  * [Reports.jsx](file:///c:/medops/medops/client/src/pages/Reports.jsx)
* **Changes**:
  * **Inventory Batches Modal**: Added a dedicated `📦 Supplier Return Warning (X days left)` status badge for active batches with $\le$ 200 days remaining before expiration.
  * **Supplier Return Report Integration**: Expanded backend expiring report query in `report.controller.js` to cover the 200-day supplier return window and attached supplier names and days remaining.
  * **Report Drill-Down Display**: Updated `Reports.jsx` to render Default Supplier, Storage Location, and Return Window Status tags (`EXPIRED`, `Critical`, `Expiring`, `Supplier Return Warning`, `OK`).

---

### 19. Atomic Stock Transfer Deductions & Batch Expiry Preservation (Bug #1 & Bug #4)
* **Status**: ✅ Fixed
* **Files Modified**:
  * [stock.controller.js](file:///c:/medops/medops/server/controllers/stock.controller.js)
* **Changes**:
  * **Bug #1 (Atomic Deductions)**: Replaced raw `.update()` calls in `approveTransfer` with atomic `.updateMany({ where: { quantityOnHand: { gte: qty } } })` and `{ quantityRemaining: { gte: qty } }`. Prevents negative stock levels under concurrent transfer approvals.
  * **Bug #4 (Batch Expiry Preservation)**: Ensured transferred batches created in destination locations explicitly inherit the source batch's exact `expiryDate`, `supplierId`, and `batchNo`. Eliminates loss of supplier expiration dates during inter-pool transfers.

---

### 20. Batch & Expiry Visibility on Stocktake Count Sheet
* **Status**: ✅ Implemented
* **Files Modified**:
  * [stocktake.controller.js](file:///c:/medops/medops/server/controllers/stocktake.controller.js)
  * [Stocktake.jsx](file:///c:/medops/medops/client/src/pages/Stocktake.jsx)
* **Changes**:
  * **Backend Query Expansion**: Updated `getOne` in `stocktake.controller.js` to retrieve active `batches` for each line item sorted by expiration date.
  * **Count Sheet UI**: Rendered an inline **"📦 Registered Batches"** card under each item row in `Stocktake.jsx`, displaying location-filtered **Lot Numbers**, **Expiration Dates**, **Batch Balances**, and **Expiry Status Badges** to assist staff during physical counts.



