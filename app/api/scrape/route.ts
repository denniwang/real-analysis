import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { PropertyData, ScrapeResponse } from '../../types/property';

// ---- Robust HTTP utils: rotating headers, retries, block detection, JSON-LD parsing ----
const HEADER_VARIANTS: Array<Record<string, string>> = [
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.google.com/',
  },
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.bing.com/',
  },
];

function randomDelay(minMs: number, maxMs: number) {
  const delta = maxMs - minMs;
  return new Promise(resolve => setTimeout(resolve, minMs + Math.random() * delta));
}

function isBlocked(html: string, status?: number): boolean {
  if (!html) return true;
  const lower = html.toLowerCase();
  if (status && (status === 403 || status === 429)) return true;
  return (
    lower.includes('captcha') ||
    lower.includes('robot check') ||
    lower.includes('verify you are a human') ||
    lower.includes('access denied') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('request blocked') ||
    lower.includes('cf-chl') // cloudflare challenge
  );
}

async function fetchWithRetries(url: string, baseHeaders?: Record<string, string>, attempts = 3): Promise<{ data: string; status: number }> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const headers = { ...(HEADER_VARIANTS[i % HEADER_VARIANTS.length]), ...(baseHeaders || {}) };
    try {
      // jitter before each attempt
      await randomDelay(400, 1200);
      const response = await axios.get(url, {
        headers,
        timeout: 20000,
        maxRedirects: 10,
        validateStatus: (s) => s < 600,
      });
      const html = response.data as string;
      if (!isBlocked(html, response.status) && html && html.length > 500) {
        return { data: html, status: response.status };
      }
      // exponential backoff if blocked
      await randomDelay(800 * (i + 1), 1600 * (i + 1));
    } catch (err) {
      lastError = err;
      await randomDelay(800 * (i + 1), 1600 * (i + 1));
    }
  }
  throw new Error(`Failed to fetch after ${attempts} attempts`);
}

function parseJsonLd($: cheerio.CheerioAPI): Partial<PropertyData> {
  const results: Array<Partial<PropertyData>> = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const json = JSON.parse(raw);
      const candidates = Array.isArray(json) ? json : [json];
      for (const item of candidates) {
        const type = item['@type'];
        if (!type) continue;
        const known = Array.isArray(type) ? type.join(',').toLowerCase() : String(type).toLowerCase();
        if (
          known.includes('house') ||
          known.includes('singlefamilyresidence') ||
          known.includes('apartment') ||
          known.includes('product') ||
          known.includes('place') ||
          known.includes('realestatelisting')
        ) {
          const offers = item.offers || item.aggregateOffer || {};
          const addressObj = item.address || (item.itemOffered && item.itemOffered.address) || {};
          const descriptionObj = item.itemOffered || item;
          const priceVal = offers.price || offers.lowPrice || item.price;
          const bedrooms = descriptionObj.numberOfRooms || descriptionObj.bedrooms || 0;
          const bathrooms = descriptionObj.numberOfBathroomsTotal || descriptionObj.bathrooms || 0;
          const floorSize = (descriptionObj.floorSize && (descriptionObj.floorSize.value || descriptionObj.floorSize)) || descriptionObj.sqft || 0;
          const propertyType = descriptionObj['@type'] || item.category || 'Property';
          const address = [addressObj.streetAddress, addressObj.addressLocality, addressObj.addressRegion, addressObj.postalCode]
            .filter(Boolean)
            .join(', ');
          const parsed: Partial<PropertyData> = {
            price: typeof priceVal === 'string' ? parsePrice(String(priceVal)) : Number(priceVal) || 0,
            address: address || '',
            beds: Number(bedrooms) || 0,
            baths: Number(bathrooms) || 0,
            sqft: typeof floorSize === 'string' ? parseInt(String(floorSize).replace(/[^0-9]/g, '')) || 0 : Number(floorSize) || 0,
            propertyType: String(propertyType),
          } as Partial<PropertyData>;
          results.push(parsed);
        }
      }
    } catch {
      // ignore json parse errors
    }
  });
  // Prefer the first reasonable result
  const best = results.find(r => (r.price && r.price > 0) || (r.address && r.address.length > 0));
  return best || {};
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ 
        success: false, 
        error: 'URL is required' 
      } as ScrapeResponse);
    }

    // Detect platform and scrape accordingly
    let propertyData: PropertyData;
    let lastError: string = '';
    
    if (url.includes('zillow.com')) {
      try {
        propertyData = await scrapeZillow(url);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Zillow scraping failed';
        console.error('Zillow scraping error:', error);
        
        // Try alternative approach for Zillow
        try {
          propertyData = await scrapeZillowAlternative(url);
        } catch (altError) {
          // Try Puppeteer as last resort
          try {
            propertyData = await scrapeWithPuppeteer(url);
          } catch (puppeteerError) {
            return NextResponse.json({ 
              success: false, 
              error: `Zillow anti-scraping detected. ${lastError}. Try using Redfin or Homes.com instead, or try again later.` 
            } as ScrapeResponse);
          }
        }
      }
    } else if (url.includes('redfin.com')) {
      try {
        propertyData = await scrapeRedfin(url);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Redfin scraping failed';
        return NextResponse.json({ 
          success: false, 
          error: `Redfin scraping failed: ${lastError}` 
        } as ScrapeResponse);
      }
    } else if (url.includes('homes.com')) {
      try {
        propertyData = await scrapeHomes(url);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Homes.com scraping failed';
        return NextResponse.json({ 
          success: false, 
          error: `Homes.com scraping failed: ${lastError}` 
        } as ScrapeResponse);
      }
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Unsupported URL. Please use Zillow, Redfin, or Homes.com' 
      } as ScrapeResponse);
    }

    return NextResponse.json({ 
      success: true, 
      data: propertyData 
    } as ScrapeResponse);

  } catch (error) {
    console.error('General scraping error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to scrape property data. Please check the URL and try again.' 
    } as ScrapeResponse);
  }
}

async function scrapeZillow(url: string): Promise<PropertyData> {
  // Enhanced headers to mimic a real browser
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
    'Referer': 'https://www.google.com/',
  };

  // Add random delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

  const fetched = await fetchWithRetries(url, headers, 4);
  const $ = cheerio.load(fetched.data);
  
  // Try JSON-LD first
  const fromJsonLd = parseJsonLd($);
  
  // More comprehensive selectors for Zillow
  const priceText = $('[data-testid="price"]').text() || 
                   $('.ds-price').text() || 
                   $('[data-test="property-price"]').text() ||
                   $('.price').text() ||
                   $('[class*="price"]').text() ||
                   $('span:contains("$")').first().text();
  const price = fromJsonLd.price && fromJsonLd.price > 0 ? fromJsonLd.price : parsePrice(priceText);
  
  // Extract address with multiple fallbacks
  const address = fromJsonLd.address || $('[data-testid="address"]').text() || 
                 $('.ds-address-container').text() || 
                 $('.address').text() ||
                 $('h1').first().text() || 
                 $('[class*="address"]').text() ||
                 'Address not found';
  
  // Extract beds/baths/sqft with more selectors
  const bedsText = $('[data-testid="bed-bath-beyond"]').text() || 
                  $('.ds-bed-bath-living-area').text() ||
                  $('.bed-bath-beyond').text() ||
                  $('[class*="bed"]').text() ||
                  $('[class*="bath"]').text();
  const { beds, baths, sqft } = {
    beds: fromJsonLd.beds ?? parsePropertyDetails(bedsText).beds,
    baths: fromJsonLd.baths ?? parsePropertyDetails(bedsText).baths,
    sqft: fromJsonLd.sqft ?? parsePropertyDetails(bedsText).sqft,
  };
  
  // Extract property type
  const propertyType = fromJsonLd.propertyType || $('[data-testid="property-type"]').text() || 
                      $('.ds-property-type').text() || 
                      $('.property-type').text() ||
                      $('[class*="property-type"]').text() ||
                      'Property type not found';

  // If we couldn't extract basic info, try alternative approach
  if (price === 0 || address === 'Address not found') {
    throw new Error('Unable to extract property data. Zillow may be blocking requests.');
  }

  return {
    price,
    address: address.trim(),
    beds,
    baths,
    sqft,
    propertyType: propertyType.trim(),
    url
  };
}

// Alternative Zillow scraping approach with different headers and selectors
async function scrapeZillowAlternative(url: string): Promise<PropertyData> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };

  // Longer delay for alternative approach
  await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 2000));

  const fetched = await fetchWithRetries(url, headers, 4);
  const $ = cheerio.load(fetched.data);
  
  const fromJsonLd = parseJsonLd($);
  
  // Try different selectors for Zillow
  const priceText = $('span[data-testid="price"]').text() || 
                   $('.ds-price').text() || 
                   $('h3[data-testid="price"]').text() ||
                   $('.price').text() ||
                   $('span:contains("$")').first().text() ||
                   $('[class*="price"]').first().text();
  const price = fromJsonLd.price && fromJsonLd.price > 0 ? fromJsonLd.price : parsePrice(priceText);
  
  const address = fromJsonLd.address || $('h1[data-testid="address"]').text() || 
                 $('.ds-address-container').text() || 
                 $('h1').first().text() || 
                 $('.address').text() ||
                 'Address not found';
  
  const bedsText = $('[data-testid="bed-bath-beyond"]').text() || 
                  $('.ds-bed-bath-living-area').text() ||
                  $('.bed-bath-beyond').text() ||
                  $('[class*="bed"]').text();
  const { beds, baths, sqft } = {
    beds: fromJsonLd.beds ?? parsePropertyDetails(bedsText).beds,
    baths: fromJsonLd.baths ?? parsePropertyDetails(bedsText).baths,
    sqft: fromJsonLd.sqft ?? parsePropertyDetails(bedsText).sqft,
  };
  
  const propertyType = fromJsonLd.propertyType || $('[data-testid="property-type"]').text() || 
                      $('.ds-property-type').text() || 
                      $('.property-type').text() ||
                      'Property type not found';

  if (price === 0 || address === 'Address not found') {
    throw new Error('Alternative Zillow scraping also failed - anti-scraping measures detected');
  }

  return {
    price,
    address: address.trim(),
    beds,
    baths,
    sqft,
    propertyType: propertyType.trim(),
    url
  };
}

// Puppeteer-based scraping as last resort (handles JavaScript-heavy sites)
async function scrapeWithPuppeteer(url: string): Promise<PropertyData> {
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic viewport and user agent
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Referer': 'https://www.google.com/',
    });
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait a bit for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract data using page.evaluate
    const propertyData = await page.evaluate(() => {
      // Helper function to extract text content
      const getText = (selector: string): string => {
        const element = document.querySelector(selector);
        return element ? element.textContent?.trim() || '' : '';
      };
      
      // Helper function to parse price
      const parsePrice = (text: string): number => {
        const cleaned = text.replace(/[^0-9]/g, '');
        return parseInt(cleaned) || 0;
      };
      
      // Helper function to parse property details
      const parsePropertyDetails = (text: string) => {
        const bedsMatch = text.match(/(\d+)\s*(?:bed|br|bedroom)/i);
        const bathsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba|bathroom)/i);
        const sqftMatch = text.match(/(\d+(?:,\d+)*)\s*(?:sqft|sq\.?\s*ft|square\s*feet)/i);
        
        return {
          beds: bedsMatch ? parseInt(bedsMatch[1]) : 0,
          baths: bathsMatch ? parseFloat(bathsMatch[1]) : 0,
          sqft: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : 0
        };
      };
      
      // Try multiple selectors for each data point
      const priceText = getText('[data-testid="price"]') || 
                       getText('.ds-price') || 
                       getText('[data-test="property-price"]') ||
                       getText('.price') ||
                       getText('[class*="price"]') ||
                       Array.from(document.querySelectorAll('span')).find(span => span.textContent?.includes('$'))?.textContent || '';
      
      const price = parsePrice(priceText);
      
      const address = getText('[data-testid="address"]') || 
                     getText('.ds-address-container') || 
                     getText('.address') ||
                     getText('h1') || 
                     getText('[class*="address"]') ||
                     'Address not found';
      
      const bedsText = getText('[data-testid="bed-bath-beyond"]') || 
                      getText('.ds-bed-bath-living-area') ||
                      getText('.bed-bath-beyond') ||
                      getText('[class*="bed"]') ||
                      getText('[class*="bath"]');
      
      const { beds, baths, sqft } = parsePropertyDetails(bedsText);
      
      const propertyType = getText('[data-testid="property-type"]') || 
                          getText('.ds-property-type') || 
                          getText('.property-type') ||
                          getText('[class*="property-type"]') ||
                          'Property type not found';
      
      return {
        price,
        address: address.trim(),
        beds,
        baths,
        sqft,
        propertyType: propertyType.trim(),
        url: window.location.href
      };
    });
    
    if (propertyData.price === 0 || propertyData.address === 'Address not found') {
      throw new Error('Puppeteer scraping failed - unable to extract property data');
    }
    
    return propertyData;
    
  } catch (error) {
    throw new Error(`Puppeteer scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function scrapeRedfin(url: string): Promise<PropertyData> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/',
  };

  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

  const fetched = await fetchWithRetries(url, headers, 3);
  const $ = cheerio.load(fetched.data);
  const pageText = $('body').text().replace(/[\u00a0\s]+/g, ' ').trim();
  
  const fromJsonLd = parseJsonLd($);
  
  // Extract price with multiple selectors
  let priceText = $('.home-main-stats .statsValue').first().text() || 
                   $('.price').text() ||
                   $('[class*="price"]').text() ||
                   $('span:contains("$")').first().text();
  if ((!priceText || parsePrice(priceText) === 0) && pageText) {
    const estimateMatch = pageText.match(/Redfin Estimate\s*\$([\d,]+)/i);
    if (estimateMatch) priceText = `$${estimateMatch[1]}`;
  }
  const redfinEstimateMatch = pageText.match(/Redfin Estimate\s*\$([\d,]+)/i);
  const redfinEstimate = redfinEstimateMatch ? parseInt(redfinEstimateMatch[1].replace(/,/g, '')) : (fromJsonLd.price || 0);
  // Example following line on Redfin: "$1.2M since sold in May 2021"
  let redfinEstimateChangeText: string | undefined;
  const changeIdx = pageText.indexOf('Redfin Estimate');
  if (changeIdx >= 0) {
    const tail = pageText.slice(changeIdx, changeIdx + 300);
    const changeMatch = tail.match(/\$[\d,.]+\s*(?:[MK])?\s*since\s+sold\s+in\s+[A-Za-z]+\s+\d{4}/i);
    if (changeMatch) redfinEstimateChangeText = changeMatch[0].trim();
  }
  const price = fromJsonLd.price && fromJsonLd.price > 0 ? fromJsonLd.price : parsePrice(priceText);
  
  // Extract address
  let address = fromJsonLd.address || $('.street-address').text() || 
                 $('.home-main-stats .statsValue').eq(1).text() || 
                 $('.address').text() ||
                 $('h1').first().text() ||
                 'Address not found';
  if (address === 'Address not found' && pageText) {
    const addrMatch = pageText.match(/\d+\s+[^,]+,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}/);
    if (addrMatch) address = addrMatch[0];
  }
  
  // Extract beds/baths/sqft
  let bedsText = $('.home-main-stats').text() ||
                  $('.bed-bath-beyond').text() ||
                  $('[class*="bed"]').text();
  let parsed = parsePropertyDetails(bedsText);
  let beds = fromJsonLd.beds ?? parsed.beds;
  let baths = fromJsonLd.baths ?? parsed.baths;
  let sqft = fromJsonLd.sqft ?? parsed.sqft;
  if ((beds === 0 && baths === 0 && sqft === 0) && pageText) {
    const bedsMatch = pageText.match(/(\d+)\s*Beds?/i);
    const bathsMatch = pageText.match(/(\d+(?:\.\d+)?)\s*Baths?/i);
    const sqftMatch = pageText.match(/([\d,]+)\s*Sq\s*Ft/i);
    if (bedsMatch) beds = parseInt(bedsMatch[1]);
    if (bathsMatch) baths = parseFloat(bathsMatch[1]);
    if (sqftMatch) sqft = parseInt(sqftMatch[1].replace(/,/g, ''));
  }
  
  // Extract property type
  const propertyType = fromJsonLd.propertyType || $('.PropertyType').text() || 
                      $('.property-type').text() ||
                      'Property type not found';

  // Detect status and last sold data
  const isOffMarket = /OFF\s*MARKET/i.test(pageText);
  const soldMatch = pageText.match(/SOLD\s+([A-Z]{3}\s\d{4})\s+FOR\s+\$([\d,]+)/i);
  const lastSoldDate = soldMatch ? soldMatch[1] : undefined;
  const lastSoldPrice = soldMatch ? parseInt(soldMatch[2].replace(/,/g, '')) : undefined;

  // Gather basic comps from the nearby cards (very simple heuristic)
  const comps: Array<{ address?: string; price: number; beds?: number; baths?: number; sqft?: number; url?: string; }> = [];
  $('[href*="/home/"]').each((_, el) => {
    const compUrl = $(el).attr('href') || '';
    const text = $(el).text();
    const priceMatch = text.match(/\$[\d,]+/);
    if (priceMatch) {
      const comp: any = { price: parseInt(priceMatch[0].replace(/[^0-9]/g, '')) };
      const bedsMatch = text.match(/(\d+)\s*beds?/i);
      const bathsMatch = text.match(/(\d+(?:\.\d+)?)\s*baths?/i);
      const sqftMatch = text.match(/([\d,]+)\s*sq\s*ft/i);
      if (bedsMatch) comp.beds = parseInt(bedsMatch[1]);
      if (bathsMatch) comp.baths = parseFloat(bathsMatch[1]);
      if (sqftMatch) comp.sqft = parseInt(sqftMatch[1].replace(/,/g, ''));
      comp.url = compUrl.startsWith('http') ? compUrl : `https://www.redfin.com${compUrl}`;
      comps.push(comp);
    }
  });

  if (price === 0 || address === 'Address not found') {
    throw new Error('Unable to extract property data from Redfin.');
  }

  return {
    price,
    address: address.trim(),
    beds,
    baths,
    sqft,
    propertyType: propertyType.trim(),
    url,
    status: isOffMarket ? 'off-market' : 'active',
    redfinEstimate: redfinEstimate || undefined,
    redfinEstimateChangeText,
    lastSoldPrice,
    lastSoldDate,
    comps: comps.slice(0, 6),
  };
}

async function scrapeHomes(url: string): Promise<PropertyData> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/',
  };

  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

  const fetched = await fetchWithRetries(url, headers, 3);
  const $ = cheerio.load(fetched.data);
  
  const fromJsonLd = parseJsonLd($);
  
  // Extract price
  const priceText = $('.price').text() || 
                   $('[data-testid="price"]').text() ||
                   $('[class*="price"]').text() ||
                   $('span:contains("$")').first().text();
  const price = fromJsonLd.price && fromJsonLd.price > 0 ? fromJsonLd.price : parsePrice(priceText);
  
  // Extract address
  const address = fromJsonLd.address || $('.address').text() || 
                 $('[data-testid="address"]').text() || 
                 $('h1').first().text() ||
                 'Address not found';
  
  // Extract beds/baths/sqft
  const bedsText = $('.property-details').text() || 
                  $('.beds-baths-sqft').text() ||
                  $('[class*="bed"]').text();
  const { beds, baths, sqft } = {
    beds: fromJsonLd.beds ?? parsePropertyDetails(bedsText).beds,
    baths: fromJsonLd.baths ?? parsePropertyDetails(bedsText).baths,
    sqft: fromJsonLd.sqft ?? parsePropertyDetails(bedsText).sqft,
  };
  
  // Extract property type
  const propertyType = fromJsonLd.propertyType || $('.property-type').text() || 
                      $('[class*="property-type"]').text() ||
                      'Property type not found';

  if (price === 0 || address === 'Address not found') {
    throw new Error('Unable to extract property data from Homes.com.');
  }

  return {
    price,
    address: address.trim(),
    beds,
    baths,
    sqft,
    propertyType: propertyType.trim(),
    url
  };
}

function parsePrice(priceText: string): number {
  const cleaned = priceText.replace(/[^0-9]/g, '');
  return parseInt(cleaned) || 0;
}

function parsePropertyDetails(detailsText: string): { beds: number; baths: number; sqft: number } {
  const bedsMatch = detailsText.match(/(\d+)\s*(?:bed|br|bedroom)/i);
  const bathsMatch = detailsText.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba|bathroom)/i);
  const sqftMatch = detailsText.match(/(\d+(?:,\d+)*)\s*(?:sqft|sq\.?\s*ft|square\s*feet)/i);
  
  return {
    beds: bedsMatch ? parseInt(bedsMatch[1]) : 0,
    baths: bathsMatch ? parseFloat(bathsMatch[1]) : 0,
    sqft: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : 0
  };
}
