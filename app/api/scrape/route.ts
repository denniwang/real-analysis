import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { PropertyData, ScrapeResponse } from '../../types/property';

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

  const response = await axios.get(url, {
    headers,
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: (status) => status < 500, // Accept redirects and client errors
  });
  
  const $ = cheerio.load(response.data);
  
  // More comprehensive selectors for Zillow
  const priceText = $('[data-testid="price"]').text() || 
                   $('.ds-price').text() || 
                   $('[data-test="property-price"]').text() ||
                   $('.price').text() ||
                   $('[class*="price"]').text() ||
                   $('span:contains("$")').first().text();
  const price = parsePrice(priceText);
  
  // Extract address with multiple fallbacks
  const address = $('[data-testid="address"]').text() || 
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
  const { beds, baths, sqft } = parsePropertyDetails(bedsText);
  
  // Extract property type
  const propertyType = $('[data-testid="property-type"]').text() || 
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

  const response = await axios.get(url, {
    headers,
    timeout: 20000,
    maxRedirects: 10,
    validateStatus: (status) => status < 500,
  });
  
  const $ = cheerio.load(response.data);
  
  // Try different selectors for Zillow
  const priceText = $('span[data-testid="price"]').text() || 
                   $('.ds-price').text() || 
                   $('h3[data-testid="price"]').text() ||
                   $('.price').text() ||
                   $('span:contains("$")').first().text() ||
                   $('[class*="price"]').first().text();
  const price = parsePrice(priceText);
  
  const address = $('h1[data-testid="address"]').text() || 
                 $('.ds-address-container').text() || 
                 $('h1').first().text() || 
                 $('.address').text() ||
                 'Address not found';
  
  const bedsText = $('[data-testid="bed-bath-beyond"]').text() || 
                  $('.ds-bed-bath-living-area').text() ||
                  $('.bed-bath-beyond').text() ||
                  $('[class*="bed"]').text();
  const { beds, baths, sqft } = parsePropertyDetails(bedsText);
  
  const propertyType = $('[data-testid="property-type"]').text() || 
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

  const response = await axios.get(url, {
    headers,
    timeout: 15000,
    maxRedirects: 5,
  });
  
  const $ = cheerio.load(response.data);
  
  // Extract price with multiple selectors
  const priceText = $('.home-main-stats .statsValue').first().text() || 
                   $('.price').text() ||
                   $('[class*="price"]').text() ||
                   $('span:contains("$")').first().text();
  const price = parsePrice(priceText);
  
  // Extract address
  const address = $('.street-address').text() || 
                 $('.home-main-stats .statsValue').eq(1).text() || 
                 $('.address').text() ||
                 $('h1').first().text() ||
                 'Address not found';
  
  // Extract beds/baths/sqft
  const bedsText = $('.home-main-stats').text() ||
                  $('.bed-bath-beyond').text() ||
                  $('[class*="bed"]').text();
  const { beds, baths, sqft } = parsePropertyDetails(bedsText);
  
  // Extract property type
  const propertyType = $('.PropertyType').text() || 
                      $('.property-type').text() ||
                      'Property type not found';

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
    url
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

  const response = await axios.get(url, {
    headers,
    timeout: 15000,
    maxRedirects: 5,
  });
  
  const $ = cheerio.load(response.data);
  
  // Extract price
  const priceText = $('.price').text() || 
                   $('[data-testid="price"]').text() ||
                   $('[class*="price"]').text() ||
                   $('span:contains("$")').first().text();
  const price = parsePrice(priceText);
  
  // Extract address
  const address = $('.address').text() || 
                 $('[data-testid="address"]').text() || 
                 $('h1').first().text() ||
                 'Address not found';
  
  // Extract beds/baths/sqft
  const bedsText = $('.property-details').text() || 
                  $('.beds-baths-sqft').text() ||
                  $('[class*="bed"]').text();
  const { beds, baths, sqft } = parsePropertyDetails(bedsText);
  
  // Extract property type
  const propertyType = $('.property-type').text() || 
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
