# Amoons POS - Menu Import Guide

## Overview

This guide explains how to import your complete menu from WooCommerce product export CSV files into the LexOS restaurant POS system.

## Quick Start

### Method 1: In-Browser CSV Import (Recommended)

1. **Navigate to Admin Panel**
   - Login as admin user with PIN authentication
   - Go to **Settings** → **Menu Management**

2. **Import CSV**
   - Click the **"Import CSV"** button in the top toolbar
   - Select your WooCommerce product export CSV file
   - Watch the progress bar as items are imported
   - System will automatically:
     - Create missing categories
     - Add all products with correct prices and descriptions
     - Set image URLs from WooCommerce
     - Mark products as available/unavailable based on status

3. **Verify Import**
   - All imported products will appear in the product grid
   - Check that categories are correctly created
   - Verify prices and descriptions are accurate

### Method 2: Node.js Script (Advanced)

For bulk imports or automation:

```bash
# Install dependencies if needed
cd backend
npm install

# Run the batch import script
node ../scripts/batch-import-menu.js
```

Or configure environment variables:
```bash
export BACKEND_URL=http://localhost:3001
export ADMIN_NONCE=your_nonce_here
node scripts/batch-import-menu.js
```

## Supported CSV Format

The importer accepts WooCommerce product export format with these fields:

### Required Fields
- `Name` - Product name
- `Regular price` - Price in cents (e.g., 580 = Rs. 5.80)
- `Categories` - Comma-separated category names

### Optional Fields
- `Description` - Full product description
- `Short description` - Short summary
- `Images` - Image URL(s)
- `Status` - publish/pending/draft/scheduled
- `Visibility in catalog` - visible/hidden

### Example CSV Entry

```csv
Type,Name,Regular price,Categories,Description,Status,Images
simple,"Passion Ice Tea",580,"Iced Teas","Bright, tropical, and impossible to ignore.",publish,"https://example.com/image.png"
```

## Category Handling

The system handles categories intelligently:

1. **Existing Categories**: If a category exists, it uses that category ID
2. **New Categories**: Automatically creates new categories when found
3. **Multiple Categories**: Products can belong to multiple categories (uses first one)

## Product Features Supported

✅ Name  
✅ Price (numeric)  
✅ Description text  
✅ Image URLs  
✅ Availability status  
✅ Category assignment  
✅ Short descriptions  

## Data Persistence

All imported data is saved permanently in the PostgreSQL database:
- Categories stored in `categories` table
- Products stored in `products` table  
- Images referenced by `image_url` field
- Descriptions in `description` column

The live URL will immediately reflect all changes after successful import.

## Troubleshooting

### Common Issues

**Issue**: "Could not create category 'X'"
- Solution: Check if you have admin permissions, or category already exists

**Issue**: "A product with that name already exists"
- Solution: Update existing products instead of creating duplicates, or rename the product

**Issue**: Images not displaying
- Solution: Ensure image URLs are full HTTPS URLs, not relative paths

**Issue**: Prices showing incorrectly
- Solution: WooCommerce exports prices in decimal format; ensure numeric format (e.g., "5.80" not "Rs. 5.80")

### Tips for Best Results

1. **Clean your CSV first**: Remove variations (type="variation") before importing
2. **Check category names**: Ensure consistent capitalization across entries
3. **Test with small dataset**: Try with 5-10 items first, then do full import
4. **Backup current menu**: Use database backup or export before bulk operations
5. **Image URLs**: Prefer hosted images over local paths

## API Reference

### Backend Endpoints Used

```javascript
// Fetch categories
GET /admin/categories

// Create category
POST /admin/categories
{ "name": "Category Name" }

// List all products
GET /admin/products

// Create product
POST /admin/products
{
  "name": "Product Name",
  "categoryId": 1,
  "price": 580,
  "description": "Product description",
  "imageUrl": "https://example.com/image.jpg",
  "isAvailable": true
}

// Update product
PUT /admin/products/:id
```

## Database Schema

### Categories Table
```sql
CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Products Table
```sql
CREATE TABLE products (
  id           SERIAL PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  name         VARCHAR(160) NOT NULL,
  description  TEXT,
  price        NUMERIC(14,2) NOT NULL DEFAULT 0,
  image_url    TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  track_stock  BOOLEAN NOT NULL DEFAULT false,
  unit         VARCHAR(40) NOT NULL DEFAULT 'pcs',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Live Deployment Notes

After successful import, the menu is automatically:
- ✅ Saved to the live database
- ✅ Displayed on the home page (POS terminal)
- ✅ Available for staff to take orders
- ✅ Indexed in search functionality
- ✅ Reflected in real-time across all terminals

No additional deployment steps required!

## Contact Support

If you encounter issues during import, please contact technical support with:
- Sample of your CSV file (first 50 rows)
- Error messages from browser console
- Screenshots of the issue

---

**Document Version**: 1.0  
**Last Updated**: November 2026  
**Applicable To**: LexOS v1.0+ with WooCommerce integration
