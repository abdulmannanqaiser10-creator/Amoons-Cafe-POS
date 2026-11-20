/**
 * Batch Menu Import Script for Amoons POS
 * 
 * This script imports products from WooCommerce CSV export format into LexOS database.
 * 
 * Setup Instructions:
 * 1. Set BACKEND_URL environment variable (e.g., http://localhost:3001 or your live URL)
 * 2. Get admin nonce from local storage if testing locally (localStorage.getItem('adminNonce'))
 *    OR use API key with x-wp-nonce header
 * 3. Run: node scripts/batch-import-menu.js
 */

const fs = require('fs');
const axios = require('axios');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_NONCE = process.env.ADMIN_NONCE || '';
const CSV_FILE_PATH = 'C:/Users/HP PRO/Downloads/wc-product-export-5-11-2026-1793820725544.csv';

// State tracking
let totalCategories = 0;
let createdCategories = new Map();
let importedProducts = 0;
let skippedProducts = 0;
let errors = [];

/**
 * Parse CSV content
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Clean headers - remove special characters
  const headers = lines[0]
    .split(',')
    .map(h => h.replace(/"/g, '').trim().toLowerCase())
    .filter(Boolean);
  
  const products = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parser (handles quoted strings)
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const product = {};
    headers.forEach((header, idx) => {
      product[header] = values[idx] || '';
    });
    
    products.push(product);
  }
  
  return products;
}

/**
 * Fetch all existing categories
 */
async function fetchCategories() {
  try {
    const response = await axios.get(`${BACKEND_URL}/admin/categories`, {
      headers: ADMIN_NONCE ? { 'x-wp-nonce': ADMIN_NONCE } : {}
    });
    
    return response.data.categories || [];
  } catch (error) {
    console.error('❌ Failed to fetch categories:', error.message);
    throw error;
  }
}

/**
 * Create a new category
 */
async function createCategory(categoryName) {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/admin/categories`,
      { name: categoryName },
      {
        headers: ADMIN_NONCE ? { 'x-wp-nonce': ADMIN_NONCE, 'Content-Type': 'application/json' } : {}
      }
    );
    
    return response.data.category.id;
  } catch (error) {
    console.error(`Failed to create category "${categoryName}":`, error.response?.data?.message || error.message);
    return null;
  }
}

/**
 * Find category ID by name (case-insensitive)
 */
function findCategoryId(categories, categoryName) {
  return categories.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase())?.id;
}

/**
 * Create a product
 */
async function createProduct(productData) {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/admin/products`,
      productData,
      {
        headers: ADMIN_NONCE ? { 'x-wp-nonce': ADMIN_NONCE, 'Content-Type': 'application/json' } : {}
      }
    );
    
    console.log(`✓ Created: ${response.data.product.name} (Rs. ${response.data.product.price})`);
    return true;
  } catch (error) {
    console.error(`Failed to create product "${productData.name}":`, error.response?.data?.message || error.message);
    errors.push({
      product: productData.name,
      error: error.response?.data?.message || error.message
    });
    return false;
  }
}

/**
 * Process CSV file
 */
async function processCSV(filePath) {
  console.log('📄 Reading CSV file...');
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ CSV file not found at: ${filePath}`);
    console.error('\nPlease set the correct CSV_FILE_PATH in the script configuration.');
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const rawProducts = parseCSV(csvContent);
  
  console.log(`✓ Parsed ${rawProducts.length} total entries\n`);
  return rawProducts;
}

/**
 * Filter relevant products (exclude variations, need price and category)
 */
function filterProducts(products) {
  return products.filter(p => {
    // Skip variations
    if (p.type === 'variation' || p.variation_type) return false;
    
    // Must have a name
    if (!p.name || !p.name.trim()) return false;
    
    // Must have price
    if (!p.regular_price || p.regular_price.toString().trim() === '') return false;
    
    // Must have at least one category
    if (!p.categories || p.categories.toString().trim() === '') return false;
    
    return true;
  });
}

/**
 * Main import process
 */
async function main() {
  console.log('🚀 Starting Menu Import for Amoons POS\n');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`CSV File: ${CSV_FILE_PATH}\n`);
  
  // Step 1: Load CSV
  const rawProducts = await processCSV(CSV_FILE_PATH);
  
  // Step 2: Fetch existing categories
  console.log('🏷️ Fetching existing categories...\n');
  const existingCategories = await fetchCategories();
  console.log(`✓ Found ${existingCategories.length} existing categories\n`);
  
  // Store existing categories
  existingCategories.forEach(cat => {
    createdCategories.set(cat.name.toLowerCase(), cat.id);
  });
  
  // Step 3: Filter valid products
  const filteredProducts = filterProducts(rawProducts);
  console.log(`✅ Filtered to ${filteredProducts.length} valid simple products\n`);
  
  // Step 4: Process each product
  console.log('🍽️ Processing products...\n');
  
  for (const product of filteredProducts) {
    // Find or create category
    const categoryNames = product.categories.split(',').map(c => c.trim()).filter(Boolean);
    let categoryId = null;
    
    for (const catName of categoryNames) {
      categoryId = findCategoryId(existingCategories, catName);
      
      if (!categoryId) {
        categoryId = await createCategory(catName);
        if (categoryId) {
          createdCategories.set(catName.toLowerCase(), categoryId);
          existingCategories.push({ id: categoryId, name: catName });
          totalCategories++;
          console.log(`✓ Created category: ${catName} (ID: ${categoryId})`);
        }
      }
      
      if (categoryId) break;
    }
    
    if (!categoryId) {
      console.warn(`⚠️ Skipping "${product.name}" - no matching category found`);
      skippedProducts++;
      continue;
    }
    
    // Prepare product data
    const productData = {
      name: product.name.trim(),
      categoryId: categoryId,
      regular_price: String(product.regular_price).trim(),
      is_available: product.status === 'publish',
      description: (product.description || product.short_description || '').trim(),
      image_url: (product.images && product.images[0]?.src) || ''
    };
    
    // Create product
    const success = await createProduct(productData);
    if (success) {
      importedProducts++;
    } else {
      skippedProducts++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Step 5: Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 IMPORT SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✓ Products Imported:     ${importedProducts}`);
  console.log(`⚠️ Skipped/Errors:       ${skippedProducts}`);
  console.log(`🆕 New Categories:       ${totalCategories}`);
  console.log(`❌ Error Count:          ${errors.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (errors.length > 0) {
    console.log('ERRORS DETAIL:');
    errors.forEach(err => {
      console.log(`  • "${err.product}": ${err.error}`);
    });
  }
  
  console.log('✨ Import completed!');
}

// Run the script
main().catch(error => {
  console.error('\n💥 Import failed:', error);
  process.exit(1);
});

module.exports = {
  parseCSV,
  filterProducts
};
