# Real Estate Investment Analysis Tool

A Next.js application that analyzes real estate investment opportunities by scraping property data from Zillow, Redfin, and Homes.com.

## Features

- **Property Data Extraction**: Automatically extracts price, address, beds, baths, sqft, and property type
- **Investment Analysis**: Calculates key metrics including cash flow, cap rate, and cash-on-cash return
- **Adjustable Parameters**: Interactive sliders for down payment, interest rate, rent estimates, and more
- **Real-time Calculations**: Updates analysis instantly when parameters change
- **Multi-platform Support**: Works with Zillow, Redfin, and Homes.com URLs

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the development server:**

   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## Usage

1. **Paste a property URL** from Zillow, Redfin, or Homes.com
2. **Click "Analyze Property"** to extract property data
3. **Adjust parameters** using the sliders to customize your analysis
4. **View results** including monthly cash flow, cap rate, and investment metrics

## Anti-Scraping Measures

### Zillow

Zillow has strong anti-scraping protection. If scraping fails:

- **Try Redfin or Homes.com** URLs instead (they're more reliable)
- **Wait a few minutes** and try again
- **Use a different Zillow property** URL
- **Try during off-peak hours** (early morning/late evening)

### Redfin & Homes.com

These platforms are generally more scraping-friendly, but may still have occasional blocks.

### Best Practices

- **Don't scrape too frequently** - add delays between requests
- **Use realistic browser headers** - the app mimics real browsers
- **Try different property URLs** if one fails
- **Consider using Redfin/Homes.com** as primary sources

## Technical Details

### Scraping Strategy

The tool uses a **multi-layered approach** to bypass anti-scraping measures:

1. **Primary Method**: Axios + Cheerio with enhanced headers

   - Realistic browser headers and user agents
   - Random delays to prevent rate limiting
   - Multiple CSS selectors for robust data extraction

2. **Alternative Method**: Different headers and selectors

   - Backup approach with modified request patterns
   - Alternative CSS selectors for different page layouts

3. **Last Resort**: Puppeteer (headless browser)

   - Handles JavaScript-heavy sites
   - Executes in real browser environment
   - Bypasses most client-side anti-scraping measures
   - More resource-intensive but highly effective

4. **Error Handling**: Graceful failure with helpful messages

### Investment Calculations

- **Monthly Mortgage Payment**: P&I calculation
- **Total Monthly Expenses**: PITI + HOA + maintenance
- **Cash Flow Analysis**: Monthly and annual projections
- **Cap Rate**: Net operating income / purchase price
- **Cash-on-Cash Return**: Annual cash flow / total cash invested

## Troubleshooting

### Common Issues

1. **"Unable to extract property data"**

   - Try a different property URL
   - Use Redfin or Homes.com instead of Zillow
   - Wait a few minutes and retry

2. **"Network error"**

   - Check your internet connection
   - Verify the URL is valid
   - Try again in a few minutes

3. **Missing property data**
   - Some properties may have incomplete listings
   - Try a different property from the same platform
   - Manual data entry may be needed for some fields

## Development

### Project Structure

```
app/
├── api/scrape/route.ts     # Scraping API endpoint
├── components/             # React components
├── types/property.ts       # TypeScript interfaces
├── utils/calculations.ts    # Investment calculations
└── page.tsx               # Main application
```

### Dependencies

- **Next.js 15**: React framework
- **Tailwind CSS**: Styling
- **Axios**: HTTP requests
- **Cheerio**: HTML parsing
- **TypeScript**: Type safety

## License

This project is for educational purposes. Please respect website terms of service and use responsibly.
