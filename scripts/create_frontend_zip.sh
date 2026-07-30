#!/bin/bash
# Create a clean zip of the Coffee Export ERP frontend
# Excludes node_modules, .next, dev logs, scripts, and other non-essential files

set -e

SRC="/home/z/my-project"
DEST="/home/z/my-project/download/coffee-export-erp-frontend.zip"
STAGING="/tmp/coffee-export-erp-frontend"

echo "=== Preparing clean staging copy ==="
rm -rf "$STAGING"
mkdir -p "$STAGING"

# Copy only the essential frontend files
echo "Copying essential frontend files..."
cp "$SRC/package.json" "$STAGING/"
cp "$SRC/next.config.ts" "$STAGING/"
cp "$SRC/tsconfig.json" "$STAGING/"
cp "$SRC/tailwind.config.ts" "$STAGING/"
cp "$SRC/postcss.config.mjs" "$STAGING/"
cp "$SRC/eslint.config.mjs" "$STAGING/"
cp "$SRC/components.json" "$STAGING/"
cp "$SRC/next-env.d.ts" "$STAGING/" 2>/dev/null || echo "next-env.d.ts not found (will be auto-generated)"
cp "$SRC/bun.lock" "$STAGING/" 2>/dev/null || echo "bun.lock not found, skipping"

# Copy src/ directory (the actual app code)
echo "Copying src/ directory..."
cp -r "$SRC/src" "$STAGING/"

# Copy public/ directory
echo "Copying public/ directory..."
cp -r "$SRC/public" "$STAGING/"

# Copy prisma if exists
if [ -d "$SRC/prisma" ]; then
  echo "Copying prisma/ directory..."
  cp -r "$SRC/prisma" "$STAGING/"
fi

# Create a README for the zip
cat > "$STAGING/SETUP.md" << 'EOF'
# Coffee Export ERP — Frontend

AI-powered ERP platform for Ethiopian coffee exporters. Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Demo Credentials

**Admin (Portfolio Manager):**
- Email: `admin@faithel.com`
- Password: `admin123`

**Seller (Operator):**
- Email: `abi@faithel.com`
- Password: `seller123`

## What's Included

- **Login page** — email-based role detection (no toggle)
- **Seller role** (12 pages): Dashboard, Inbox, Leads, Deals, Inventory, Samples, Quotes, Contracts, Shipments, Compliance, Finance, AI Coach
- **Admin role** (5 tabs): Portfolio, Sellers, Commission, Risk, System

## Tech Stack

- Next.js 16.1.3 (App Router, Turbopack)
- React 19
- TypeScript
- Tailwind CSS 4
- lucide-react (icons)
- shadcn/ui (48 components)

## File Structure

```
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # All 14 pages (~6,500 lines)
│   │   ├── globals.css         # Coffee-brown design system
│   │   └── api/                # API routes
│   ├── components/ui/          # 48 shadcn/ui components
│   ├── hooks/                  # use-mobile, use-toast
│   └── lib/                    # utils.ts, db.ts
├── public/                     # logo.svg, robots.txt
├── package.json
└── ...
```

## Build for Production

```bash
npm run build
npm start
```

## Connecting to Backend

The frontend currently uses mock data. To connect to the Python/SQLAlchemy backend:
1. Replace mock data arrays in `src/app/page.tsx` with API calls
2. Configure backend URL in environment variables
3. Wire authentication to backend `/auth/login` endpoint
4. Replace dual-blind email system mocks with real email service

See backend documentation in the parent project for API endpoints.
EOF

echo ""
echo "=== Staging directory contents ==="
ls -la "$STAGING/"
echo ""
echo "=== Total staging size ==="
du -sh "$STAGING/"

echo ""
echo "=== Creating zip ==="
cd /tmp && zip -r "$DEST" coffee-export-erp-frontend -x "*/node_modules/*" "*/.next/*" "*/.git/*" > /tmp/zip.log 2>&1

echo ""
echo "=== Zip created ==="
ls -lh "$DEST"
echo ""
echo "=== Zip contents (top-level) ==="
unzip -l "$DEST" | head -30
echo "..."
echo ""
echo "=== Total file count in zip ==="
unzip -l "$DEST" | tail -1