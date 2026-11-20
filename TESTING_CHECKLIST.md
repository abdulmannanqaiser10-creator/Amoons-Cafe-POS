# Amoons POS - Testing Checklist

## Pre-Deployment Verification

### ✅ Must Pass Before Going Live

#### Login Page Tests
- [ ] PIN screen displays with burgundy gradient background
- [ ] LexOS logo visible on left side
- [ ] "Hey Amoons 👋 Welcome to LexOS" heading correct
- [ ] 5 PIN input boxes centered on page
- [ ] Numeric keypad (1-9, 0, backspace) functional
- [ ] Pressing number keys enters digit
- [ ] Backspace removes last digit
- [ ] Enter key submits when 5 digits entered
- [ ] Auto-submit works (pins automatically submit when complete)
- [ ] Show/Hide PIN toggle shows digits instead of dots
- [ ] Error message displays for invalid PIN
- [ ] Wave background curves render correctly
- [ ] Responsive on mobile devices (<768px)
- [ ] Touch-friendly buttons

#### Home Dashboard Tests
- [ ] Header shows LexOS + Amoons branding
- [ ] "Online" status indicator green
- [ ] Current date/time displayed and updates every 30s
- [ ] Operator name/avatar visible in top-right
- [ ] Search bar appears with placeholder "Search menu items..."
- [ ] Ctrl+K shortcut focuses search
- [ ] Category chips display horizontally
- [ ] Clicking category filters products instantly
- [ ] All products grid loads successfully
- [ ] Product cards show image (or fallback icon)
- [ ] Price displays as "Rs. X.XX" format
- [ ] Add button "+" appears on product cards
- [ ] Cart panel on right side visible
- [ ] "Current Order" header shows cart item count
- [ ] Empty cart shows cloche icon + "No items added yet"
- [ ] Adding items updates cart immediately
- [ ] Removing items from cart works
- [ ] Quantity +/- buttons update correctly
- [ ] Total amount updates with tax calculation
- [ ] Bottom nav bar shows all icons: New, Orders, Reversals, Reports, Settings, Help, Logout
- [ ] Clicking navigation items changes pages appropriately
- [ ] Responsive layout adjusts for smaller screens
- [ ] Toast notifications appear after actions

---

## CSV Import Feature Tests

### Button & Interface
- [ ] "Import CSV" button visible in Menu Management toolbar
- [ ] Upload icon renders correctly
- [ ] File input accepts .csv files only
- [ ] Drag-and-drop works (optional enhancement)

### Parsing Tests
- [ ] Select sample WooCommerce CSV file
- [ ] Parser handles quoted strings properly
- [ ] Parses multi-line descriptions correctly
- [ ] Handles empty fields gracefully
- [ ] Skips variation rows automatically
- [ ] Filters out draft/inactive products

### Category Handling
- [ ] Existing categories detected first
- [ ] New categories created automatically
- [ ] Duplicate category names avoided
- [ ] Category sort order assigned sequentially
- [ ] Multiple categories per product uses first match

### Product Import
- [ ] Products created one-by-one
- [ ] Name field populated correctly
- [ ] Price converted from string to number
- [ ] Descriptions preserved (including special characters)
- [ ] Image URLs validated (must be HTTPS)
- [ ] Availability set based on publish status
- [ ] Progress bar animates smoothly
- [ ] Real-time count updates (X/Y imported)

### Success Cases
- [ ] Small import (10 items): < 5 seconds
- [ ] Medium import (100 items): ~20-30 seconds  
- [ ] Large import (500 items): Completes without timeout
- [ ] All products appear in product grid
- [ ] Categories shown in filter dropdown
- [ ] Products searchable by name/description
- [ ] Data persists after page refresh

### Error Handling
- [ ] Invalid CSV shows error toast
- [ ] Malformed data skipped silently
- [ ] Network errors caught and reported
- [ ] Duplicate product names handled
- [ ] Missing required fields flagged
- [ ] Import cancelled if user navigates away

---

## Visual Design Accuracy

### Pixel-Perfect Checks
Compare against reference images at full zoom (100%)

#### Login Page
- [ ] Background gradient matches exactly (#791037 → #4A001D)
- [ ] Wave SVG paths align with design
- [ ] Brand lockup positioned correctly
- [ ] Text alignment center-aligned
- [ ] Spacing between elements consistent
- [ ] Colors use exact hex codes
- [ ] Font weights match reference (regular, medium, bold, extra-bold)
- [ ] Border radius values accurate
- [ ] Shadows match design specifications

#### Home Page
- [ ] Header wave background same style
- [ ] Top search bar width and height correct
- [ ] Category chip border radius uniform
- [ ] Product card dimensions consistent
- [ ] Card spacing equal on all sides
- [ ] Cart panel width fixed (~320px)
- [ ] Bottom nav bar height appropriate
- [ ] Active states on chips clear
- [ ] Hover effects smooth transitions
- [ ] Focus indicators visible for accessibility

---

## Integration Tests

### Database Connectivity
- [ ] Connection string configured correctly
- [ ] Tables exist and have proper schema
- [ ] Foreign keys maintain referential integrity
- [ ] Triggers fire on cascade operations
- [ ] Indexes optimize query performance

### API Communication
- [ ] CORS headers allow cross-origin requests
- [ ] JWT tokens valid for 8 hours
- [ ] Session management works across tabs
- [ ] Role-based access enforced
- [ ] Input validation server-side present

### Frontend-Backend Sync
- [ ] Menu polling interval correct (45 seconds)
- [ ] Real-time updates appear on terminal
- [ ] Cart state clears after order placed
- [ ] Loading states appropriate
- [ ] Optimistic UI updates rollback on error

---

## Performance Benchmarks

### Load Times
- [ ] Initial page load: < 2 seconds
- [ ] Menu catalog fetch: < 1 second
- [ ] Search response: < 300ms
- [ ] Filter operation: Instant
- [ ] Cart operations: Instant

### Resource Usage
- [ ] Memory footprint: < 100MB
- [ ] CPU usage: < 15% idle, < 40% active
- [ ] Bundle size optimized (code splitting enabled)
- [ ] Images lazy-loaded
- [ ] CSS critical path optimized

### Database Queries
- [ ] Category lookup: Indexed
- [ ] Product list: Efficient with LIMIT/OFFSET
- [ ] Search queries use LIKE %value%
- [ ] JOIN operations optimal
- [ ] Connection pooling configured

---

## Accessibility Audit

### WCAG 2.1 Compliance
- [ ] Color contrast ratios ≥ 4.5:1 (text)
- [ ] Alt text on all meaningful images
- [ ] ARIA labels on interactive elements
- [ ] Keyboard navigation fully functional
- [ ] Screen reader announces pin entry state
- [ ] Form fields have associated labels
- [ ] Error messages announced to screen readers
- [ ] Focus order logical and predictable
- [ ] No content cuts off at zoom level 200%
- [ ] Time-based animations have pause option

---

## Security Review

### Common Vulnerabilities
- [ ] SQL injection prevented via parameterized queries
- [ ] XSS attacks mitigated via React sanitization
- [ ] CSRF protection in place (nonces/tokens)
- [ ] Authentication required for admin routes
- [ ] Sensitive data not logged
- [ ] PIN never stored in plain text
- [ ] Secure HTTPS connections enforced
- [ ] Environment variables protected

---

## Browser Compatibility Matrix

Test on latest versions:

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 110+ | ☐ |
| Firefox | 105+ | ☐ |
| Safari | 15+ | ☐ |
| Edge | 110+ | ☐ |
| Opera | 95+ | ☐ |
| Samsung Internet | 15+ | ☐ |

---

## Mobile Responsiveness

Test various viewport sizes:

| Resolution | Device | Status |
|------------|--------|--------|
| 375×667 | iPhone SE | ☐ |
| 390×844 | iPhone 14 Pro | ☐ |
| 428×926 | iPhone 14 Pro Max | ☐ |
| 768×1024 | iPad | ☐ |
| 820×1180 | Tablet Landscape | ☐ |
| 1920×1080 | Desktop Full HD | ☐ |

---

## Deployment Readiness

### Final Checks
- [ ] Production build compiles without errors
- [ ] No console warnings or errors
- [ ] All tests pass
- [ ] Documentation complete
- [ ] Backup strategy in place
- [ ] Monitoring tools configured
- [ ] Rollback plan documented
- [ ] Team trained on new features

### Sign-off Required
- [ ] Developer approval
- [ ] QA testing completed
- [ ] Client/Stakeholder review
- [ ] Security audit passed
- [ ] Performance benchmarks met

---

**Tester:** _________________  
**Date:** ___________________  
**Overall Status:** ☐ Ready ☐ Needs Work
