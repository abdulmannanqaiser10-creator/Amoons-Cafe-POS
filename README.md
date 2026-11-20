# Amoons POS - LexOS Restaurant Management System

## Overview

The Amoons POS is a complete restaurant point-of-sale system built on the LexOS platform, designed for managing orders, menu items, staff, and business operations.

---

## 🎯 Features

### Core Functionality
- **PIN-based Authentication** - Secure 5-digit PIN login for staff
- **Menu Management** - Add, edit, delete menu items with categories
- **Order Processing** - Real-time order creation and cart management
- **CSV Bulk Import** - Upload entire menus from WooCommerce exports
- **Inventory Tracking** - Stock level monitoring per product
- **Multi-user Support** - Staff and admin role management
- **Real-time Sync** - All terminals update automatically

### Design Highlights
- Burgundy & white brand colors (#791037 palette)
- Curved wave background animations
- Responsive grid layouts
- Smooth micro-interactions
- Touch-friendly UI

---

## 📂 Project Structure

```
D:\NFC WORK\Amoons/
├── frontend/                    # React POS Application
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── MenuItems.jsx    # Product card grid
│   │   │   ├── CurrentOrder.jsx # Cart/order panel
│   │   │   ├── Icons.jsx        # SVG icon library
│   │   │   └── admin/           # Admin panel components
│   │   ├── pages/               # Page routes
│   │   │   ├── Login.jsx        # PIN authentication (Pixel-perfect ✓)
│   │   │   ├── Home.jsx         # Main POS dashboard (Pixel-perfect ✓)
│   │   │   └── admin/           # Administration pages
│   │   │       └── MenuManagement.jsx  # CSV import feature ✨
│   │   ├── api/                 # API client configuration
│   │   └── utils/               # Helper functions
│   └── package.json
│
├── backend/                     # Node.js API Server
│   ├── controllers/             # Business logic
│   │   ├── authController.js    # PIN validation
│   │   ├── catalogController.js # Menu/product APIs
│   │   └── menuController.js    # Catalog serving
│   ├── config/                  # Database setup
│   ├── routes/                  # API endpoints
│   └── server.js
│
├── scripts/                     # Utility scripts
│   ├── batch-import-menu.js     # Command-line CSV importer
│   └── import-menu.js           # Alternative parser
│
├── MENU_IMPORT_GUIDE.md         # Detailed import instructions
├── DEPLOYMENT_SUMMARY.md        # Implementation summary
└── README.md                    # This file
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- PostgreSQL database
- npm or yarn package manager

### Installation

#### Backend Setup
```bash
cd backend
npm install
npm run start
# Runs on http://localhost:3001
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

### First Login
Use any 5-digit PIN you've configured in the admin panel:
- Default admin PIN: `12345`
- Staff PINs: Assigned individually

---

## 🍽️ Import Your Menu

### Option 1: Browser Interface (Recommended)

1. Navigate to **Settings → Menu Management**
2. Click **"Import CSV"** button
3. Select your WooCommerce export file
4. Watch progress bar
5. Products appear instantly!

### Option 2: Command Line

```bash
node scripts/batch-import-menu.js
```

**See**: [MENU_IMPORT_GUIDE.md](MENU_IMPORT_GUIDE.md) for full details

---

## 📋 Documentation

| Document | Description |
|----------|-------------|
| [`DEPLOYMENT_SUMMARY.md`](DEPLOYMENT_SUMMARY.md) | Complete implementation report |
| [`MENU_IMPORT_GUIDE.md`](MENU_IMPORT_GUIDE.md) | CSV import step-by-step guide |
| [`README.md`](README.md) | This file |

---

## 🌐 Live Deployment

### Production URL
**https://amoonssoft.vercel.app/**

### Vercel Configuration
Automatic deployment via GitHub integration. Push to main branch triggers deploy.

### Environment Variables
```env
DATABASE_URL=postgresql://user:pass@host:port/dbname
JWT_SECRET=your-secret-key-here
BACKEND_URL=http://localhost:3001
PORT=3001
```

---

## 🔧 Technical Stack

### Frontend
- **React 18** with hooks
- **React Router** for navigation
- **Axios** for API calls
- **CSS Modules** for styling
- **SVG icons** inline

### Backend
- **Node.js** + Express
- **PostgreSQL** database
- **Passport JWT** authentication
- **bcrypt** for PIN hashing

### Infrastructure
- **Vercel** for frontend hosting
- **Heroku/DigitalOcean** for backend
- **Supabase/Neon** for PostgreSQL

---

## 🎨 Design System

### Colors
```css
--lex-burgundy: #791037;
--lex-burgundy-dark: #4A001D;
--lex-white: #FFFFFF;
--lex-gray-light: #F5F5F5;
--ad-success: #2e7d32;
--ad-warning: #ef6c00;
--ad-danger: #c62828;
```

### Typography
- Primary: System sans-serif stack
- Weight scale: 400, 500, 600, 700, 800
- Sizes: clamp() responsive units

### Spacing
- Base: 4px increment
- Gaps: 8px, 16px, 24px, 32px
- Margins: Variable based on context

---

## ⚙️ API Endpoints

### Authentication
```javascript
POST /auth/login              // Authenticate with PIN
GET  /auth/me                 // Get current user
DELETE /auth/logout           // Sign out
```

### Categories
```javascript
GET    /admin/categories      // List all categories
POST   /admin/categories      // Create new category
PUT    /admin/categories/:id  // Update category
DELETE /admin/categories/:id  // Delete category
```

### Products
```javascript
GET    /admin/products        // List all products
POST   /admin/products        // Create product
PUT    /admin/products/:id    // Update product
DELETE /admin/products/:id    // Retire product
```

### Menu/Catalog
```javascript
GET /menu                     // Fetch full catalog for till
```

---

## 📱 Device Compatibility

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Responsive Breakpoints
```css
/* Mobile */
@media (max-width: 768px) { }

/* Tablet */
@media (min-width: 769px) and (max-width: 1024px) { }

/* Desktop */
@media (min-width: 1025px) { }
```

### Touch Targets
- Minimum: 44×44px buttons
- Keypad keys: Larger touch areas
- Cards: Full clickable surface

---

## 🔒 Security Features

### PIN Security
- Hashed with bcrypt (10 salt rounds)
- Stored only as hash in database
- No raw PIN transmission
- Session timeout after 8 hours

### Data Protection
- JWT tokens for API access
- CORS restrictions enabled
- Input validation on all endpoints
- SQL injection prevention via parameterized queries

### Access Control
- Role-based routing (admin vs staff)
- Protected route wrappers
- Session token validation

---

## 🐛 Debugging Tips

### Frontend
```javascript
// Enable debug logging
window.DEBUG_MODE = true;

// Check API responses
Network tab → XHR filters → Look for requests starting with `/api/`

// Console errors
F12 → Console → Filter by error/warning
```

### Backend
```javascript
// Enable verbose logging
DEBUG=* node server.js

// Check database connections
psql -h localhost -U postgres -d amoons_pos
```

---

## 📞 Support

### Contact Channels
- Email: support@amoons.com
- Issue Tracker: GitHub Issues
- Community Forum: Available for Pro users

### Response Times
- Critical bugs: < 4 hours
- Feature requests: < 24 hours
- General questions: < 48 hours

---

## 📄 License

Proprietary software - See LICENSE file for details

---

## 🙏 Credits

Developed for Amoons Restaurant  
LexOS Platform v1.0  
Built with ❤️ using modern web technologies

---

*Last Updated: November 9, 2026*  
*Version: 1.0.0*  
*Status: Production Ready ✅*
