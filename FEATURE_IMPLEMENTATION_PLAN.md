# Amoons POS - Feature Enhancement Plan

## Current System Analysis

### ✅ Existing Features
- **PIN Authentication**: 5-digit PIN system using bcrypt hashing
- **Two users pre-seeded**: Admin (24680), Staff/Maaz (12345)
- **Loyalty/Rewards System**: Complete database schema for points & transactions
- **Order Management**: Full CRUD with status workflow
- **Menu/Catalogue**: Categories & products from database
- **Inventory Tracking**: Stock management with movements
- **Shift Management**: Opening/closing cash registers
- **Reversals**: Order reversal workflow with audit trail

### 🔧 Required Changes

---

## 1. PIN Routing Fix

**Current Behavior:**
- Both 12345 and 24680 → `/admin` panel

**Expected Behavior:**
- PIN `12345` → `/staff` (Home POS Dashboard)
- PIN `24680` → `/admin` (Admin Panel)

**Implementation:**
- Modify `Login.jsx` to check role after successful authentication
- Update line 269 in Login.jsx: Add role-based navigation logic
- Backend already returns correct role in authController.js

**Files to Change:**
- `frontend/src/pages/Login.jsx` (line 269)

---

## 2. Discount Management System

**New Requirements:**
- Apply discount toggle in CurrentOrder component
- Two types: Fixed amount (Rs.) and Percentage (%)
- Quick buttons: Rs. 50, Rs. 100, Rs. 200
- Custom discount input field
- Calculate discount BEFORE GST calculation
- Update final bill display and receipt accurately

**Database Changes:**
No new tables needed - discounts calculated on-the-fly during order creation

**Backend API Extensions:**
Modify `backend/controllers/orderController.js`:
- Extend `create` method to accept discount object
- Validate discount calculations server-side
- Store discount breakdown in orders table

**Schema additions needed:**
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_after_tax BOOLEAN NOT NULL DEFAULT false;
```

**Frontend Components:**
- `frontend/src/components/CurrentOrder.jsx` - Add discount toggle & UI
- `frontend/src/utils/orderMath.js` - Add discount calculation logic
- Receipt printing updated to show discount breakdown

---

## 3. Customer & Rewards Integration

**Current State:**
- `loyalty_members` table exists with phone UNIQUE constraint
- `loyalty_entries` table tracks point transactions
- Controller has full CRUD + entry management
- No automatic points on order completion yet

**Required Enhancements:**

### A. Phone Validation & Deduplication
- Frontend validates phone format before submission
- Backend checks for duplicate phone numbers at order creation
- If customer exists → link to existing member
- If new → create loyalty member automatically (with 0 points initially)

### B. Automatic Point Awarding
- After order marked "Completed" AND "Paid"
- Add 10 points per completed eligible order
- Prevent duplicate award for same order_id
- Link to order_id for audit trail

**Backend Implementation:**
`orderController.js` - Modify `complete` endpoint:
```javascript
// After order completed successfully:
const newEntry = await db.query(
  `INSERT INTO loyalty_entries (member_id, points, reason, order_id, performed_by)
   VALUES ($1, 10, 'Earn', $2, $3)
   ON CONFLICT (order_id) DO NOTHING
   RETURNING id`,
  [memberId, orderId, userId]
);
```

### C. Rewards Management Page
Already exists: `frontend/src/pages/admin/Rewards.jsx`
Need to verify:
- Displays customer list with phone, points, last activity
- Shows transaction history per customer
- Manual adjustment form with audit log
- Order number linking displayed

---

## 4. KOT (Kitchen Order Ticket) Workflow

**Requirements:**
- Allow direct billing WITHOUT requiring KOT first
- Keep KOT as separate optional feature
- Prevent duplicate orders/bills
- Update statuses correctly

**Analysis:**
The current system doesn't enforce KOT workflow - orders go directly from cart to payment. This is actually CORRECT behavior based on requirements.

**Validation:**
- Orders can be created directly via POST /api/orders
- No prerequisite checking needed
- Status flow works independently

**Conclusion:** No changes needed - already working correctly!

---

## 5. Printing System Fixes

**Current State:**
- Printing configured via Settings page
- printer configuration stored in app_settings table
- Includes browser printing or thermal printer support

**Required Fixes:**
- Ensure Print button triggers actual print dialog
- Support 58mm/80mm thermal receipts
- Include all order details: items, customer, discount, GST, payment
- Handle errors gracefully

**Backend:** 
Settings store stores printer config JSON:
```json
{
  "type": "browser|thermal",
  "size": "58mm|80mm",
  "settings": {}
}
```

**Frontend:**
`utils/printer.js` handles formatting and printing calls
`CurrentOrder.jsx` needs to trigger print before order completion

---

## 6. Backend Data Integrity

**Security Measures:**
- All financial calculations validated server-side (already implemented)
- Transactions wrapped in BEGIN/COMMIT blocks
- Foreign keys enforce referential integrity
- Check constraints prevent invalid data

**Key Areas:**
- Discounts: Must validate ≤ subtotal, non-negative amounts
- Rewards: Cannot reduce balance below zero
- Orders: payment_status derived from amount_paid vs total
- Locking used for concurrent updates (FOR UPDATE clauses)

---

## 7. Testing Checklist

### Before Deployment:

**PIN Authentication Tests:**
- [ ] PIN 12345 redirects to /staff only
- [ ] PIN 24680 redirects to /admin only  
- [ ] Invalid PIN shows error message
- [ ] Deactivated account prevents login

**Dashboard Navigation Tests:**
- [ ] New Order creates cart and accepts items
- [ ] Order Management lists past orders
- [ ] Order Reversal requires admin, shows editable orders
- [ ] Shift Reports opens shift start/end screen
- [ ] Settings allows printer configuration
- [ ] Help displays support info
- [ ] Logout clears session token

**Discount System Tests:**
- [ ] Toggle turns discount on/off
- [ ] Fixed Rs. 50 reduces total by exactly Rs. 50
- [ ] Fixed Rs. 100 reduces total by exactly Rs. 100  
- [ ] Fixed Rs. 200 reduces total by exactly Rs. 200
- [ ] Custom amount accepted and validated
- [ ] Percentage discount calculates correctly
- [ ] Discount applied before GST in calculations
- [ ] Final receipt shows discount line item
- [ ] Database stores discount_amount and discount_type

**Customer & Rewards Tests:**
- [ ] Customer phone validated (10+ digits)
- [ ] Same phone links to existing customer
- [ ] New phone creates new loyalty member
- [ ] Completed order awards 10 points automatically
- [ ] Duplicate completion prevents double points
- [ ] Rewards admin page shows member list
- [ ] Member detail shows transaction history
- [ ] Manual point adjustment logs action

**Direct Billing Tests:**
- [ ] Cart items add successfully
- [ ] Checkout proceeds without KOT step
- [ ] Order saved with status "Pending" → "Completed"
- [ ] Payment status updates correctly
- [ ] Items reserved from inventory
- [ ] Receipt printed immediately

**KOT Optional Tests:**
- [ ] Kitchen view exists but not required
- [ ] Can skip KOT generation entirely
- [ ] Orders appear regardless of kitchen ticket

**Printing Tests:**
- [ ] Print button opens dialog
- [ ] Browser print works for standard printers
- [ ] Thermal template formats for 58mm/80mm
- [ ] Receipt includes all mandatory fields
- [ ] Network printer fallback tested
- [ ] Error handling displays helpful messages

**Edge Case Tests:**
- [ ] Duplicate order submissions prevented
- [ ] Cancelled order returns stock to inventory
- [ ] Unpaid order remains visible in dashboard
- [ ] Partial payment recorded correctly
- [ ] Rounding errors don't accumulate

---

## 8. Priority Order

### Phase 1: Critical Fixes
1. PIN routing (12345→Staff, 24680→Admin)
2. Discount calculations
3. Customer phone validation

### Phase 2: Core Features
4. Automatic rewards point awarding
5. Printing system fixes
6. Duplicate prevention

### Phase 3: Polish
7. Rewards management page enhancement
8. UI improvements
9. Documentation

---

## Files to Modify Summary

### Frontend (React):
- `src/pages/Login.jsx` - Role-based routing
- `src/components/CurrentOrder.jsx` - Discount toggle & input
- `src/utils/orderMath.js` - Discount calculation functions
- `src/api/client.js` - API endpoints (if needed)
- `src/utils/printer.js` - Print dialog triggers

### Backend (Node.js):
- `config/schema.sql` - Add discount columns to orders table
- `controllers/orderController.js` - Accept/store discount data
- `controllers/loyaltyController.js` - Auto-add points on completion
- `routes/orderRoutes.js` - Add endpoint if needed

### Database:
```sql
-- Execute migration script
ALTER TABLE orders ADD COLUMN discount_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_type VARCHAR(10) DEFAULT 'none';
ALTER TABLE orders ADD COLUMN discount_after_tax BOOLEAN DEFAULT false;
```

---

## Deployment Steps

1. Backup current database
2. Run schema migration on production
3. Deploy backend changes
4. Deploy frontend changes
5. Clear build cache
6. Test each feature sequentially
7. Monitor error logs
8. Rollback if critical issue discovered

---

*Plan generated: November 9, 2026*  
*Version: 1.0.0*  
*Status: Ready for implementation*
