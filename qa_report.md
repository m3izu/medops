# MedOPS Inventory System — Expert QA Bug & Vulnerability Report

This document compiles the identified bugs, logical loopholes, security vulnerabilities, and design contradictions discovered during a comprehensive codebase review of the **Healing Hands Center / MedOPS Inventory System**. 

The findings are cross-referenced with the specifications in the [Implementation Plan](file:///z:/MedOPS/App/implementation_plan.md).

---

## Executive Summary of Actionable Items

| # | Title | Severity | Impact | File Reference |
| :--- | :--- | :--- | :--- | :--- |
| **1** | [Concurrency Race Conditions in Stock Deductions](#1-concurrency-race-conditions-in-stock-deductions) | **Critical** | Quantity on hand / batch quantities can become negative or corrupted under simultaneous requests. | [requisition.controller.js](file:///z:/MedOPS/App/server/controllers/requisition.controller.js)<br/>[discard.controller.js](file:///z:/MedOPS/App/server/controllers/discard.controller.js) |
| **2** | [Medication Stocktake Positive Discrepancy Failure](#2-medication-stocktake-positive-discrepancy-failure) | **High** | Stock levels and batch balances permanently fall out of sync when medication counts increase without active batches. | [stocktake.controller.js](file:///z:/MedOPS/App/server/controllers/stocktake.controller.js) |
| **3** | [CSV Bulk Import Medication Batch Mismatch](#3-csv-bulk-import-medication-batch-mismatch) | **High** | Medications imported with initial stock are locked from clinical dispensing due to missing `ItemBatch` entries. | [import.controller.js](file:///z:/MedOPS/App/server/controllers/import.controller.js) |
| **4** | [Stocktake Count Entry Blocked for Clinical Staff](#4-stocktake-count-entry-blocked-for-clinical-staff) | **High** | Regular staff (Nurses/Supply Officers) cannot input counts because the UI and routes are restricted to managers only. | [App.jsx](file:///z:/MedOPS/App/client/src/App.jsx)<br/>[Layout.jsx](file:///z:/MedOPS/App/client/src/components/Layout.jsx) |
| **5** | [Invalid Prisma Query Silently Empties Low-Stock Reports](#5-invalid-prisma-query-silently-empties-low-stock-reports) | **Medium** | Low-stock and out-of-stock sections in the monthly reports are always empty due to an invalid column-to-column comparison. | [report.controller.js](file:///z:/MedOPS/App/server/controllers/report.controller.js) |
| **6** | [Insecure Patient List and Details Endpoints (HIPAA Concern)](#6-insecure-patient-list-and-details-endpoints-hipaa-concern) | **High** | Any logged-in user can access full patient records (emergency contacts, diagnoses, chart numbers) without permission checks. | [patient.routes.js](file:///z:/MedOPS/App/server/routes/patient.routes.js) |
| **7** | [Insecure Requisition Get Detail Endpoint](#7-insecure-requisition-get-detail-endpoint) | **Medium** | Any authenticated user can read other users' requisitions and sensitive patient clinical request details. | [requisition.controller.js](file:///z:/MedOPS/App/server/controllers/requisition.controller.js) |
| **8** | [Overlapping Top Admin Permission Mapping](#8-overlapping-top-admin-permission-mapping) | **Medium** | The Top Admin is granted commenting privileges on logs, violating the dynamic permission matrix constraint. | [permissions.js](file:///z:/MedOPS/App/server/lib/permissions.js) |
| **9** | [Fixed JWT Lifetime Prevents Active Session Renewal](#9-fixed-jwt-lifetime-prevents-active-session-renewal) | **Medium** | Users are abruptly logged out during active operations because the backend cookie lacks sliding session extension. | [AuthContext.jsx](file:///z:/MedOPS/App/client/src/context/AuthContext.jsx)<br/>[auth.controller.js](file:///z:/MedOPS/App/server/controllers/auth.controller.js) |
| **10** | [Insecure Notification Read Update Endpoint](#10-insecure-notification-read-update-endpoint) | **Low** | Users can mark other users' notifications as read by brute-forcing/guessing notification IDs. | [notification.controller.js](file:///z:/MedOPS/App/server/controllers/notification.controller.js) |
| **11** | [Duplicate Stock Alert Spam](#11-duplicate-stock-alert-spam) | **Low** | Multiple duplicate warning/critical notifications flood managers on every subsequent transaction under threshold. | [stock.controller.js](file:///z:/MedOPS/App/server/controllers/stock.controller.js) |
| **12** | [Missing Puppeteer PDF Report Generation](#12-missing-puppeteer-pdf-report-generation) | **Low** | PDF generation is performed client-side via print instead of using server-side Puppeteer rendering as specified. | [report.controller.js](file:///z:/MedOPS/App/server/controllers/report.controller.js) |
| **13** | [Missing Expiry Date Validation on Stock Receipt](#13-missing-expiry-date-validation-on-stock-receipt) | **Medium** | Expired medications can be accepted into active stock via direct API calls due to lack of backend validation. | [stock.controller.js](file:///z:/MedOPS/App/server/controllers/stock.controller.js) |
| **14** | [Bypassable Medication Discard Batch Validation](#14-bypassable-medication-discard-batch-validation) | **Medium** | Medications with zero active batches can be discarded without batch subtraction, corrupting stock reconciliation. | [discard.controller.js](file:///z:/MedOPS/App/server/controllers/discard.controller.js) |

---

## Detailed Bug Findings & Loopholes

### 1. Concurrency Race Conditions in Stock Deductions
* **Type**: Critical Bug (Race Condition)
* **API Endpoints**: 
  * `PATCH /api/requisitions/:id/lines/:lineId/approve`
  * `POST /api/discards`
* **Vulnerable Code**:
  * In `requisition.controller.js` ([approveLine](file:///z:/MedOPS/App/server/controllers/requisition.controller.js#L114-L221)):
    ```javascript
    const item = await prisma.item.findUnique({
      where: { id: line.itemId },
      include: { stockLevel: true, batches: { where: { quantityRemaining: { gt: 0 } }, orderBy: { expiryDate: 'asc' } } },
    });
    const currentStock = item.stockLevel?.quantityOnHand ?? 0;
    if (currentStock < approvedQty) {
      return res.status(400).json({ error: 'Insufficient stock...' });
    }
    await prisma.$transaction(async (tx) => { ... });
    ```
  * In `discard.controller.js` ([logDiscard](file:///z:/MedOPS/App/server/controllers/discard.controller.js#L4-L71)):
    ```javascript
    if (!item.stockLevel || item.stockLevel.quantityOnHand < quantity) {
      return res.status(400).json({ error: 'Insufficient stock...' });
    }
    await prisma.$transaction(async (tx) => { ... });
    ```
* **Loophole Description**:
  The checks to verify if the clinic has sufficient quantity on hand (and if batch quantities are sufficient) are performed **outside** of the database transaction block. 
  In high-traffic environments, two concurrent requests can simultaneously query the stock level, bypass the condition check, and enter the transaction block. This will decrement `quantityOnHand` or `quantityRemaining` twice, leading to negative stock counts. In addition, `item.batches` is queried outside the transaction, meaning batch allocations inside the transaction are applied based on stale data.
* **Fix Action**: Move the item stock level and batch query inside the `$transaction` block, and perform count validation inside the transaction.

---

### 2. Medication Stocktake Positive Discrepancy Failure
* **Type**: Major Logical Bug
* **API Endpoint**: `PATCH /api/stocktakes/:id/complete`
* **Vulnerable Code**:
  * In `stocktake.controller.js` ([complete](file:///z:/MedOPS/App/server/controllers/stocktake.controller.js#L126-L138)):
    ```javascript
    } else if (line.discrepancy > 0) {
      // Add stock discrepancy to the oldest active batch
      const oldestBatch = await tx.itemBatch.findFirst({
        where: { itemId: line.itemId, quantityRemaining: { gt: 0 } },
        orderBy: { expiryDate: 'asc' }
      });
      if (oldestBatch) {
        await tx.itemBatch.update({
          where: { id: oldestBatch.id },
          data: { quantityRemaining: { increment: line.discrepancy } }
        });
      }
    }
    ```
* **Loophole Description**:
  If there is a positive stocktake discrepancy (e.g. system shows 0 units, but staff physically counts 5 units), the system attempts to allocate this excess count to the oldest active batch (`quantityRemaining > 0`). 
  If system count is 0, it is highly likely that there are **no active batches** with `quantityRemaining > 0`. As a result, `oldestBatch` resolves to `null`. The code checks `if (oldestBatch)` and silently skips batch incrementing. 
  This causes the global `StockLevel` to increase to 5 (via `stockLevel.update`), while all related batch quantities remain at 0, permanently breaking FIFO medication tracking and causing future approvals to fail.
* **Fix Action**: If `oldestBatch` is null, either find the most recently expired batch, create a default "reconciliation batch", or prompt the user to assign the excess count to a specific batch.

---

### 3. CSV Bulk Import Medication Batch Mismatch
* **Type**: Major Functional Bug
* **API Endpoint**: `POST /api/import`
* **Vulnerable Code**:
  * In `import.controller.js` ([importCsv](file:///z:/MedOPS/App/server/controllers/import.controller.js#L102-L136)):
    ```javascript
    const newItem = await prisma.item.create({
      data: {
        ...,
        stockLevel: {
          create: {
            quantityOnHand: initialQty,
            lastUpdated: new Date()
          }
        }
      }
    });
    ```
* **Loophole Description**:
  When migrating paper records of medications with initial quantities, the system creates the `Item` and the global `StockLevel` record, but fails to create any corresponding `ItemBatch` records. 
  Since medications in the system require co-verification and FIFO deduction from active batches, any attempt to request or approve these imported medications will fail. The manager approval will throw an exception ("Insufficient Medication batch quantities remaining to fulfill this request") because no batches exist, rendering the imported stock unusable.
* **Fix Action**: If `itemType === 'MEDICATION'` and `initialQty > 0`, require importing a batch number and expiry date in the CSV row and create an initial `ItemBatch` record alongside the item.

---

### 4. Stocktake Count Entry Blocked for Clinical Staff
* **Type**: Major Workflow Bug
* **Files**:
  * `client/src/App.jsx` ([Line 144](file:///z:/MedOPS/App/client/src/App.jsx#L144))
  * `client/src/components/Layout.jsx` ([Line 260](file:///z:/MedOPS/App/client/src/components/Layout.jsx#L260))
  * `client/src/pages/Stocktake.jsx` ([Line 31, 296, 324](file:///z:/MedOPS/App/client/src/pages/Stocktake.jsx#L296))
  * `server/routes/stocktake.routes.js` ([Line 10](file:///z:/MedOPS/App/server/routes/stocktake.routes.js#L10))
* **Specification Contradiction**:
  The Implementation Plan specifies:
  * **Workflow 6**: "Staff physically counts and enters actual quantities."
  * **Default Permission Matrix**: `Initiate stocktake` is reserved for Top Admin and Inventory Manager. Other staff (Nurses, Supply Officers) do not have this permission.
* **Loophole Description**:
  The React route `/stocktake`, the sidebar item in `Layout.jsx`, and the input fields/save buttons on the count sheet are all protected by the `initiate_stocktake` permission. Furthermore, the API endpoint to save counts (`PATCH /api/stocktakes/:id/lines/:lineId`) enforces the `initiate_stocktake` permission on the backend.
  Consequently, clinical staff (Nurses and Supply Officers) are completely locked out of the stocktake interface and cannot enter physical counts. Only Top Admins and Inventory Managers can type and save counts.
* **Fix Action**: Introduce a separate permission key for `submit_stocktake_count` or allow any authenticated clinic staff to modify lines, reserving the `complete` (approval/adjustment application) action for administrators.

---

### 5. Invalid Prisma Query Silently Empties Low-Stock Reports
* **Type**: Code Bug
* **API Endpoints**: 
  * `POST /api/reports/generate`
  * `GET /api/reports/:id`
* **Vulnerable Code**:
  * In `report.controller.js` ([Line 42](file:///z:/MedOPS/App/server/controllers/report.controller.js#L42) and [Line 185](file:///z:/MedOPS/App/server/controllers/report.controller.js#L185)):
    ```javascript
    prisma.item.findMany({
      where: {
        isArchived: false,
        stockLevel: { quantityOnHand: { lte: prisma.item.fields?.warningLevel } },
      },
      include: { stockLevel: true },
    }).catch(() => [])
    ```
* **Loophole Description**:
  Prisma does not support direct column-to-column comparisons within the `where` filter block (comparing the relation field `stockLevel.quantityOnHand` to the parent field `warningLevel` using `prisma.item.fields?.warningLevel`). 
  This query is syntactically invalid and always rejects. The `.catch(() => [])` handles the rejection to prevent report generation from crashing, but causes the "Low-stock and out-of-stock items" section of the monthly report to **always return empty**.
* **Fix Action**: Query all items with their stock levels first, and filter them programmatically in Node.js before saving the report data, or use a raw SQL query.

---

### 6. Insecure Patient List and Details Endpoints (HIPAA Concern)
* **Type**: Security Vulnerability (Information Disclosure)
* **API Endpoints**:
  * `GET /api/patients`
  * `GET /api/patients/:id`
* **Vulnerable Code**:
  * In `patient.routes.js` ([Line 7, 9](file:///z:/MedOPS/App/server/routes/patient.routes.js#L7)):
    ```javascript
    router.get('/', authenticate, c.list);
    router.get('/:id', authenticate, c.getOne);
    ```
* **Vulnerability Description**:
  While creation and updates require the `manage_patients` permission, listing patients and fetching patient charts are accessible by **any authenticated user**. 
  This includes Viewer/Auditor, Nurse, and Management Office roles. There is no authorization check, meaning any logged-in user can access full dialysis patient logs, emergency contact details, clinical schedule configurations, and diagnoses.
* **Fix Action**: Enforce read permissions or limit the patient list response based on user role (e.g., Nurses should only see names and IDs for requisition lookups, while Management Office users should have restricted access to raw patient details).

---

### 7. Insecure Requisition Get Detail Endpoint
* **Type**: Security Vulnerability (Insecure Direct Object Reference)
* **API Endpoint**: `GET /api/requisitions/:id`
* **Vulnerable Code**:
  * In `requisition.controller.js` ([getOne](file:///z:/MedOPS/App/server/controllers/requisition.controller.js#L68-L87)):
    ```javascript
    const req_ = await prisma.requisition.findUnique({
      where: { id: req.params.id },
      include: { ... }
    });
    ```
* **Vulnerability Description**:
  The `list` endpoint filters requisitions by `submittedById` if the user is a `NURSE`. However, the `getOne` endpoint has no such check.
  A Nurse can query `/api/requisitions/:id` for *any* requisition ID and receive detailed clinical records, medication requests, and patient names for requests submitted by other clinical staff.
* **Fix Action**: If the requesting user's role is `NURSE`, enforce that the requisition's `submittedById` matches `req.user.id`. For other roles, ensure they have appropriate viewer permissions.

---

### 8. Overlapping Top Admin Permission Mapping
* **Type**: Logical Specification Loophole
* **File**: `server/lib/permissions.js` ([Line 47](file:///z:/MedOPS/App/server/lib/permissions.js#L47))
* **Vulnerable Code**:
  ```javascript
  const DEFAULT_ROLE_PERMISSIONS = {
    TOP_ADMIN: Object.values(PERMISSIONS), // all permissions
    ...
  }
  ```
* **Loophole Description**:
  The permission matrix specifies that only the **Management Office** role has permission to "Comment / flag on log entries" (`comment_on_logs`), while all clinic roles (including Top Admin) are strictly marked with `❌`. 
  However, assigning `Object.values(PERMISSIONS)` to `TOP_ADMIN` maps all keys—including `comment_on_logs`—to the Top Admin, giving them access to management-only features and violating the dual-dashboard separation guidelines.
* **Fix Action**: Exclude `comment_on_logs` from the default `TOP_ADMIN` permission array during initialization.

---

### 9. Fixed JWT Lifetime Prevents Active Session Renewal
* **Type**: Usability / Design Defect
* **File**: `server/controllers/auth.controller.js` ([Line 32-43](file:///z:/MedOPS/App/server/controllers/auth.controller.js#L32))
* **Vulnerable Code**:
  ```javascript
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: `${timeoutMinutes}m` }
  );
  ```
* **Loophole Description**:
  The client-side `AuthContext` implements an inactivity timer that resets on user activity (e.g. mouse movement, keypresses). However, the backend cookie is issued with a fixed `maxAge` and the JWT token has a fixed `expiresIn` duration calculated from the login timestamp.
  Because there is no sliding token renewal on API requests, if the Top Admin configures a timeout of 10 minutes, an active user will be abruptly logged out after exactly 10 minutes of continuous, active usage because the token cookie expires on the server.
* **Fix Action**: Implement a sliding session mechanism on the server where the authentication middleware issues an updated cookie with an extended expiry date if the current session token is near expiration.

---

### 10. Insecure Notification Read Update Endpoint
* **Type**: Security Vulnerability (Broken Object-Level Authorization)
* **API Endpoint**: `PATCH /api/notifications/:id/read`
* **Vulnerable Code**:
  * In `notification.controller.js` ([markRead](file:///z:/MedOPS/App/server/controllers/notification.controller.js#L15-L23)):
    ```javascript
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    ```
* **Vulnerability Description**:
  The endpoint updates a notification record using only the notification's ID. It does not check if the notification's `userId` matches the authenticated requester's ID.
  Any logged-in user can mark other staff members' notifications as read by guessing notification IDs.
* **Status**: ✅ **Fixed**. The query was updated to use `updateMany` filtering by both the notification ID and the authenticated user's ID (`userId: req.user.id`).

---

### 11. Duplicate Stock Alert Spam
* **Type**: Usability / Performance Defect
* **File**: `server/controllers/stock.controller.js` ([Line 4-34](file:///z:/MedOPS/App/server/controllers/stock.controller.js#L4))
* **Vulnerable Code**:
  ```javascript
  const message = `${alertLevel} stock alert: ${item.name} has ${qty} ${item.unit} remaining`;
  await prisma.notification.createMany({
    data: recipients.map(u => ({
      userId: u.id,
      eventType: `STOCK_${alertLevel}`,
      message,
      link: `/items/${itemId}`,
    })),
  });
  ```
* **Loophole Description**:
  Whenever a stock transaction takes place and the stock level is below the warning or critical threshold, `checkAndFireAlerts` is triggered. 
  Unlike `checkAndFireExpiryAlerts` (which verifies if an alert already exists in the database for the batch), this function creates new database notification records for every transaction. If stock is critical (e.g. threshold is 5, current is 2) and nurses perform 10 individual transactions of 1 unit, the managers will receive 10 duplicate alert notifications, clogging their inbox.
* **Status**: ✅ **Fixed**. Added a database check to verify if an unread notification of the same `eventType` and link already exists for each recipient before creating a new duplicate notification.

---

### 12. Missing Puppeteer PDF Report Generation
* **Type**: Unimplemented Specification Gap
* **File**: `server/controllers/report.controller.js`
* **Specification Contradiction**:
  The tech stack table in the implementation plan specifies:
  * **PDF Generation**: "Puppeteer (server-side, full report rendering)"
* **Loophole Description**:
  The monthly report endpoints compile and return JSON data to the React client. There is no server-side Puppeteer rendering engine configured, and the `pdfPath` column in the database is never populated. 
  PDF generation is handled client-side using browser-based stylesheet formatting triggered via `window.print()`. If the browser environment restricts print operations or lacks print-to-PDF drivers, the user cannot export reports.
* **Fix Action**: Implement server-side Puppeteer PDF rendering as specified in Phase 9, saving the output files to disk and returning the static PDF link.

---

### 13. Missing Expiry Date Validation on Stock Receipt
* **Type**: Clinical Safety Loophole
* **API Endpoint**: `POST /api/stock/receive`
* **Vulnerable Code**:
  * In `stock.controller.js` ([receiveStock](file:///z:/MedOPS/App/server/controllers/stock.controller.js#L36-L91)):
    ```javascript
    expiryDate: expiryDate ? new Date(expiryDate) : null,
    ```
* **Loophole Description**:
  While the frontend prevents users from entering past expiry dates for medications, the backend does not validate the `expiryDate` parameter. 
  A direct API call can register expired medication batches into active inventory, introducing a critical patient safety risk.
* **Fix Action**: Add backend checks to reject `expiryDate` values that represent dates in the past.

---

### 14. Bypassable Medication Discard Batch Validation
* **Type**: Logical Integrity Vulnerability
* **API Endpoint**: `POST /api/discards`
* **Vulnerable Code**:
  * In `discard.controller.js` ([logDiscard](file:///z:/MedOPS/App/server/controllers/discard.controller.js#L26-L38)):
    ```javascript
    if (batchId) { ... }
    ```
  * In `Discards.jsx` ([Line 106-110](file:///z:/MedOPS/App/client/src/pages/Discards.jsx#L106)):
    ```javascript
    const hasBatches = selectedItemDetails?.batches && selectedItemDetails.batches.length > 0;
    if (hasBatches && !batchId) { ... }
    ```
* **Loophole Description**:
  The system assumes that medication discards will specify a `batchId` to correctly decrement the batch quantity. 
  However, because of the CSV import bug, medications may exist without batch records. To accommodate this, the frontend only requires `batchId` if the item has registered batches (`hasBatches`). The backend does not enforce `batchId` for medications either, checking only `if (batchId)`. 
  This allows users to discard medications with `batchId: null`, which updates the global inventory count but bypasses batch allocation updates, leaving batch counts and global counts permanently desynchronized.
* **Fix Action**: Enforce that any item with type `MEDICATION` **must** provide a valid `batchId` in the discard payload, both in the UI and backend validation.
