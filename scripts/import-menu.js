/**
 * Menu Import Script for Amoons POS
 * 
 * This script parses a WooCommerce product export CSV and creates/updates
 * menu categories and products in the LexOS database.
 * 
 * Usage: node scripts/import-menu.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CSV_FILE_PATH = 'C:/Users/HP PRO/Downloads/wc-product-export-5-11-2026-1793820725544.csv';
const API_BASE_URL = 'http://localhost:3001'; // Adjust as needed

/**
 * Parse CSV content into array of objects
 */
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const obj = {};
    
    headers.forEach((header, index) => {
      if (values[index] !== undefined && values[index] !== '') {
        // Clean up key names
        const cleanKey = header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_/, '').replace(/_$/, '');
        obj[cleanKey] = values[index];
      }
    });
    
    results.push(obj);
  }

  return results;
}

/**
 * Parse a single CSV line handling quoted strings
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Extract unique categories from products
 */
function extractCategories(products) {
  const categoryMap = new Map();
  
  products.forEach(product => {
    if (product.categories) {
      // Split multiple categories
      const categories = product.categories.split(',').map(c => c.trim()).filter(Boolean);
      
      categories.forEach(cat => {
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, {
            name: cat,
            sortOrder: categoryMap.size + 1
          });
        }
      });
    }
  });
  
  return Array.from(categoryMap.values());
}

/**
 * Filter products to import
 */
function filterProducts(products) {
  return products.filter(p => {
    // Skip variations (they have no price or parent relationship)
    if (p.type === 'variation' || p.type === 'various') return false;
    
    // Must have a name and regular price
    if (!p.name || !p.regular_price) return false;
    
    // Skip products without categories
    if (!p.categories) return false;
    
    return true;
  });
}

/**
 * Create category via API
 */
async function createCategory(category, apiKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wp-nonce': apiKey
      },
      body: JSON.stringify({
        name: category.name
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.warn(`Failed to create category "${category.name}":`, error.message);
      return null;
    }
    
    const result = await response.json();
    console.log(`✓ Created category: ${category.name} (ID: ${result.id})`);
    return result.id;
  } catch (error) {
    console.error(`Error creating category ${category.name}:`, error.message);
    return null;
  }
}

/**
 * Find category ID by name
 */
async function findCategoryId(categoryName, apiKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/categories`, {
      headers: {
        'x-wp-nonce': apiKey
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch categories:', response.statusText);
      return null;
    }
    
    const categories = await response.json();
    const found = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    
    return found ? found.id : null;
  } catch (error) {
    console.error(`Error finding category ${categoryName}:`, error.message);
    return null;
  }
}

/**
 * Create product via API
 */
async function createProduct(product, categoryId, apiKey) {
  try {
    const payload = {
      name: product.name,
      category_ids: [categoryId],
      regular_price: product.regular_price.toString(),
      description: product.description || product.short_description || '',
      status: 'publish',
      visibility: 'visible'
    };
    
    // Add image URL if available
    if (product.images && product.images.length > 0) {
      payload.image_url = product.images[0].src;
    }
    
    const response = await fetch(`${API_BASE_URL}/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wp-nonce': apiKey
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.warn(`Failed to create product "${product.name}":`, error.message);
      return null;
    }
    
    const result = await response.json();
    console.log(`✓ Created product: ${product.name} (Rs. ${product.regular_price}, Category: ${categoryId})`);
    return result.id;
  } catch (error) {
    console.error(`Error creating product ${product.name}:`, error.message);
    return null;
  }
}

/**
 * Get admin nonce for API authentication
 */
async function getAdminNonce(apiKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/categories`, {
      headers: {
        'x-wp-nonce': apiKey
      }
    });
    
    // If we can't access, the key might not be correct
    return response.ok ? apiKey : null;
  } catch (error) {
    console.error('Error getting authentication:', error.message);
    return null;
  }
}

/**
 * Main import process
 */
async function importMenu() {
  console.log('🚀 Starting Menu Import Process...\n');
  
  // Step 1: Read and parse CSV
  console.log('📄 Reading CSV file...');
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`❌ CSV file not found at: ${CSV_FILE_PATH}`);
    console.error('Please update the CSV_FILE_PATH constant in this script.');
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
  const rawProducts = parseCSV(csvContent);
  console.log(`✓ Parsed ${rawProducts.length} raw products\n`);
  
  // Step 2: Filter relevant products
  const filteredProducts = filterProducts(rawProducts);
  console.log(`✓ Filtered to ${filteredProducts.length} simple products (excluded variations)\n`);
  
  // Step 3: Extract unique categories
  const categories = extractCategories(filteredProducts);
  console.log(`📁 Found ${categories.length} unique categories:`);
  categories.forEach(cat => console.log(`  • ${cat.name}`));
  console.log('');
  
  // Step 4: Process categories first
  console.log('🏷️ Creating categories...\n');
  const createdCategories = new Map();
  
  for (const category of categories) {
    const id = await findCategoryId(category.name, 'your_api_key_here');
    
    if (!id) {
      const newId = await createCategory(category, 'your_api_key_here');
      if (newId) {
        createdCategories.set(category.name, newId);
      }
    } else {
      createdCategories.set(category.name, id);
      console.log(`✓ Using existing category: ${category.name} (ID: ${id})`);
    }
  }
  
  console.log('\n');
  
  // Step 5: Create products
  console.log('🍽️ Creating products...\n');
  
  for (const product of filteredProducts) {
    // Find matching category
    const productCategories = product.categories.split(',').map(c => c.trim());
    let categoryId = null;
    
    for (const catName of productCategories) {
      const catId = createdCategories.get(catName);
      if (catId) {
        categoryId = catId;
        break;
      }
    }
    
    if (!categoryId) {
      console.warn(`⚠️ No matching category for: ${product.name}`);
      continue;
    }
    
    await createProduct(product, categoryId, 'your_api_key_here');
    
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n✅ Import complete!');
  console.log('\n📊 Summary:');
  console.log(`  • Categories processed: ${categories.length}`);
  console.log(`  • Products imported: ${filteredProducts.length}`);
}

// Run import if this is the main module
if (require.main === module) {
  importMenu().catch(error => {
    console.error('💥 Import failed:', error);
    process.exit(1);
  });
}

module.exports = {
  parseCSV,
  filterProducts,
  extractCategories,
  importMenu
};
