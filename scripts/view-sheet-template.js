/**
 * Playwright script to view the GROWTH Google Sheets template
 * and extract visual styling information
 */
const { chromium } = require('playwright');

async function viewGrowthTemplate() {
  const templateId = '1-ScgF6hJPAUUONUFRM70IGcqH6kZ6GK_0a6jj2PHZzo';
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${templateId}/edit`;
  
  console.log('🌱 Opening GROWTH Character Sheet Template...');
  console.log(`📋 URL: ${sheetUrl}`);
  
  const browser = await chromium.launch({ 
    headless: false, // Show the browser so we can see the sheet
    slowMo: 1000     // Slow down for better viewing
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to the Google Sheet
    await page.goto(sheetUrl);
    
    // Wait for the sheet to load
    await page.waitForSelector('[role="grid"]', { timeout: 10000 });
    
    console.log('✅ Sheet loaded successfully!');
    
    // Extract visual information
    console.log('\n🎨 Analyzing visual styling...');
    
    // Get background colors
    const colors = await page.evaluate(() => {
      const cells = document.querySelectorAll('[role="gridcell"]');
      const colorSet = new Set();
      
      cells.forEach(cell => {
        const bgColor = window.getComputedStyle(cell).backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          colorSet.add(bgColor);
        }
      });
      
      return Array.from(colorSet).slice(0, 10); // Top 10 colors
    });
    
    console.log('🌈 Detected colors:', colors);
    
    // Get font information
    const fonts = await page.evaluate(() => {
      const cells = document.querySelectorAll('[role="gridcell"]');
      const fontSet = new Set();
      
      cells.forEach(cell => {
        const fontFamily = window.getComputedStyle(cell).fontFamily;
        const fontSize = window.getComputedStyle(cell).fontSize;
        const fontWeight = window.getComputedStyle(cell).fontWeight;
        
        fontSet.add(`${fontFamily} | ${fontSize} | ${fontWeight}`);
      });
      
      return Array.from(fontSet).slice(0, 5); // Top 5 font combinations
    });
    
    console.log('📝 Detected fonts:', fonts);
    
    // Look for header styling
    const headers = await page.evaluate(() => {
      const results = [];
      const cells = document.querySelectorAll('[role="gridcell"]');
      
      cells.forEach((cell, index) => {
        if (index < 20) { // Check first 20 cells for headers
          const bgColor = window.getComputedStyle(cell).backgroundColor;
          const color = window.getComputedStyle(cell).color;
          const fontWeight = window.getComputedStyle(cell).fontWeight;
          const text = cell.textContent?.trim();
          
          if (text && (fontWeight === 'bold' || fontWeight === '700' || bgColor !== 'rgba(0, 0, 0, 0)')) {
            results.push({
              text,
              bgColor,
              color,
              fontWeight
            });
          }
        }
      });
      
      return results;
    });
    
    console.log('📊 Header styling found:', headers);
    
    // Take a screenshot for reference
    await page.screenshot({ 
      path: 'growth-template-screenshot.png',
      fullPage: false 
    });
    
    console.log('📸 Screenshot saved as growth-template-screenshot.png');
    
    console.log('\n⏳ Keeping browser open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Error viewing sheet:', error);
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

// Run the script
if (require.main === module) {
  viewGrowthTemplate().catch(console.error);
}

module.exports = { viewGrowthTemplate };