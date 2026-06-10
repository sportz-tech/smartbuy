// SmartBuy: Content Script for E-Commerce Parsing & UI Injection

// Extract metadata from Schema.org JSON-LD tags
function extractFromLDJson() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const objects = Array.isArray(data) ? data : [data];
      for (const obj of objects) {
        if (obj["@type"] === "Product" || (typeof obj["@type"] === "string" && obj["@type"].includes("Product"))) {
          let title = obj.name || "";
          let price = "";
          let imageUrl = "";
          
          if (obj.image) {
            imageUrl = Array.isArray(obj.image) ? obj.image[0] : (typeof obj.image === "object" ? obj.image.url : obj.image);
          }
          
          if (obj.offers) {
            const offers = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
            if (offers.price) {
              const currency = offers.priceCurrency || "USD";
              const symbol = currency === "INR" ? "₹" : (currency === "USD" ? "$" : (currency === "GBP" ? "£" : (currency === "EUR" ? "€" : "")));
              price = symbol + offers.price;
            }
          }
          
          if (title || price) {
            return { title, price, imageUrl };
          }
        }
      }
    } catch (e) {
      // ignore JSON parse errors
    }
  }
  return null;
}

// Scrape product details from page DOM
function scrapeProductDetails() {
  const url = window.location.href;
  const domain = window.location.hostname;
  let title = "";
  let price = "";
  let imageUrl = "";
  let productId = "";
  let siteName = "";
  
  // Pre-fetch JSON-LD fallback data
  const ldJsonProduct = extractFromLDJson();

  if (domain.includes("amazon.com")) {
    siteName = "Amazon";
    
    // Scrape Title
    const titleEl = document.querySelector("#productTitle");
    title = titleEl ? titleEl.textContent.trim() : "";

    // Scrape Price
    // Amazon uses multiple price formats
    const priceSelectors = [
      "#corePrice_feature_div .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      ".a-price .a-offscreen",
      "#price_inside_buybox"
    ];
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        price = el.textContent.trim();
        break;
      }
    }

    // Scrape Image
    const imgEl = document.querySelector("#landingImage") || document.querySelector("#imgBlkFront");
    imageUrl = imgEl ? imgEl.src : "";

    // Scrape ASIN (Product ID)
    const asinEl = document.querySelector("#ASIN") || document.querySelector('input[name="ASIN"]');
    if (asinEl) {
      productId = asinEl.value;
    } else {
      const match = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      productId = match ? match[1] : "";
    }
  } 
  
  else if (domain.includes("walmart.com")) {
    siteName = "Walmart";
    
    // Scrape Title
    const titleEl = document.querySelector("h1");
    title = titleEl ? titleEl.textContent.trim() : "";

    // Scrape Price
    const priceEl = document.querySelector('[data-testid="price-and-shipping-info"] [itemprop="price"]') || 
                    document.querySelector('[data-testid="price-and-shipping-info"]') ||
                    document.querySelector('.inline-flex .lh-title') ||
                    document.querySelector('.w_iUH7');
    price = priceEl ? priceEl.textContent.replace("current price", "").trim() : "";

    // Scrape Image
    const imgEl = document.querySelector('img[data-testid="product-main-image"]') || 
                  document.querySelector('.db img');
    imageUrl = imgEl ? imgEl.src : "";

    // Scrape Walmart Item ID
    const match = url.match(/\/ip\/.*\/([0-9]+)/i);
    productId = match ? match[1] : "";
  } 
  
  else if (domain.includes("ebay.com")) {
    siteName = "eBay";
    
    // Scrape Title
    const titleEl = document.querySelector(".x-item-title__mainTitle") || document.querySelector("#itemTitle");
    if (titleEl) {
      // eBay sometimes prefixes with "Details about "
      title = titleEl.textContent.replace("Details about", "").trim();
    }

    // Scrape Price
    const priceEl = document.querySelector('[itemprop="price"]') || 
                    document.querySelector(".x-price-primary") ||
                    document.querySelector("#prcIsum");
    price = priceEl ? priceEl.textContent.trim() : "";

    // Scrape Image
    const imgEl = document.querySelector("#icImg") || 
                  document.querySelector(".ux-image-carousel-item img") ||
                  document.querySelector(".image-container img");
    imageUrl = imgEl ? imgEl.src : "";

    // Scrape eBay Item ID
    const match = url.match(/\/itm\/([0-9]+)/i);
    productId = match ? match[1] : "";
  } 
  
  else if (domain.includes("flipkart.com")) {
    siteName = "Flipkart";
    
    // Scrape Title (handles details pages and search/listing pages)
    const titleSelectors = [
      ".B_NuCI", 
      ".VU-ZEz",
      "span.B_NuCI",
      "h1",
      "._4rR01T", // Search product list main title
      ".IRpwTa", // Search product grid title
      ".s1Q9rs", // Search product grid title 2
      ".wjcEeb", // New Search list item title
      "a.wjcEeb",
      "a._2rpwqg",
      "a.s1Q9rs"
    ];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    // Scrape Price
    const priceSelectors = [
      "span._30jeq3._16Jk6d",
      ".Nx9b1A ._30jeq3",
      "._30jeq3",
      ".Nx9b1A",
      ".C13K9X",
      ".Uard7b",
      "span.VU-ZEz" // fallback
    ];
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        price = el.textContent.trim();
        break;
      }
    }

    // Heuristic price finder if selectors fail
    if (!price) {
      const elements = document.querySelectorAll("div, span, p");
      for (const el of elements) {
        const text = el.textContent.trim();
        // Match ₹ followed by numbers, e.g. ₹441 or ₹1,999
        if (text.startsWith("₹") && /^₹[0-9,]+$/.test(text) && text.length < 12) {
          price = text;
          break;
        }
      }
    }

    // Scrape Image (handles details pages and search/listing pages)
    const imgSelectors = [
      "img.cx1Flb", 
      "img._396cs4", 
      "img._1egr7U",
      "img.DByo1J",
      "._396cs4._3exPp9",
      ".q6DClP img",
      "._2rM9yx img",
      ".CGtC98 img",
      "._2rpwqg img",
      "a[href*='/p/'] img", // any image inside a product link
      "a img"
    ];
    for (const selector of imgSelectors) {
      const el = document.querySelector(selector);
      if (el && el.src && !el.src.includes("data:image") && el.src.startsWith("http")) {
        imageUrl = el.src;
        break;
      }
    }

    // Scrape Flipkart Product ID (pid) from URL parameters
    try {
      const urlObj = new URL(url);
      const pid = urlObj.searchParams.get("pid");
      productId = pid || "FLIPKART_ITEM";
    } catch (e) {
      productId = "FLIPKART_ITEM";
    }

    // If pid was not in URL, try to extract it from the first product link on search results page
    if (productId === "FLIPKART_ITEM") {
      const productLinkEl = document.querySelector("a[href*='pid=']");
      if (productLinkEl) {
        const href = productLinkEl.getAttribute("href");
        const match = href.match(/[?&]pid=([^&]+)/);
        if (match) {
          productId = match[1];
        }
      }
    }

    // If title or price is still missing, fallback to JSON-LD
    if ((!title || !price || price === "N/A") && ldJsonProduct) {
      if (!title) title = ldJsonProduct.title;
      if (!price || price === "N/A") price = ldJsonProduct.price;
      if (!imageUrl) imageUrl = ldJsonProduct.imageUrl;
    }
  }
  
  else {
    // Generic Scraper (Open Graph / Schema Metadata fallback)
    siteName = domain.replace("www.", "").split(".")[0];
    
    // Title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    title = ogTitle ? ogTitle.content : document.title;
    
    // Price
    const ogPrice = document.querySelector('meta[property="product:price:amount"]') || 
                    document.querySelector('meta[property="og:price:amount"]');
    if (ogPrice) {
      const currency = document.querySelector('meta[property="product:price:currency"]');
      price = (currency ? currency.content : "$") + ogPrice.content;
    } else {
      // Heuristic: search document body for price-like patterns (e.g. $99.99)
      const priceRegex = /\$[0-9]+(?:\.[0-9]{2})?/;
      const match = document.body.innerText.match(priceRegex);
      price = match ? match[0] : "";
    }
    
    // Image
    const ogImg = document.querySelector('meta[property="og:image"]');
    imageUrl = ogImg ? ogImg.content : "";
    
    productId = "GENERIC";
  }

  // Clean up title if too long
  if (title && title.length > 150) {
    title = title.substring(0, 147) + "...";
  }

  // Detect currency symbol
  let currencySymbol = "$";
  if (price.includes("₹") || price.toLowerCase().includes("rs") || domain.includes("flipkart.com")) {
    currencySymbol = "₹";
  } else if (price.includes("£")) {
    currencySymbol = "£";
  } else if (price.includes("€")) {
    currencySymbol = "€";
  }

  return {
    title: title || "Unknown Product",
    price: price || "N/A",
    imageUrl: imageUrl,
    productId: productId,
    domain: domain,
    siteName: siteName,
    url: url,
    currencySymbol: currencySymbol
  };
}

// Inject floating action pill into page wrapped in Shadow DOM
function injectSmartBuyPill(productInfo) {
  // Check if already injected
  if (document.getElementById("smartbuy-shadow-host")) return;

  const host = document.createElement("div");
  host.id = "smartbuy-shadow-host";
  
  // Floating styling for host element
  host.style.position = "fixed";
  host.style.bottom = "24px";
  host.style.right = "24px";
  host.style.zIndex = "2147483647"; // Max index to stay on top
  host.style.width = "auto";
  host.style.height = "auto";
  host.style.display = "block";
  
  document.body.appendChild(host);

  // Attach Shadow Root
  const shadowRoot = host.attachShadow({ mode: "open" });

  // Styles inside shadow root - totally isolated from host page CSS styles
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');
    
    .smartbuy-pill {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(17, 12, 28, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      padding: 8px 16px 8px 8px;
      color: #ffffff;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 
                  0 0 0 1px rgba(124, 58, 237, 0.2),
                  inset 0 1px 1px rgba(255, 255, 255, 0.1);
      cursor: pointer;
      user-select: none;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      animation: sbSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transform: translateY(20px);
      opacity: 0;
    }
    
    @keyframes sbSlideUp {
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    .smartbuy-pill:hover {
      transform: translateY(-4px) scale(1.02);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 
                  0 0 15px rgba(52, 211, 153, 0.3),
                  inset 0 1px 1px rgba(255, 255, 255, 0.2);
      border-color: rgba(52, 211, 153, 0.4);
    }
    
    .logo-container {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7c3aed 0%, #14b8a6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 0 10px rgba(124, 58, 237, 0.4);
    }

    .logo-container::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        to bottom right,
        rgba(255, 255, 255, 0) 0%,
        rgba(255, 255, 255, 0) 40%,
        rgba(255, 255, 255, 0.4) 50%,
        rgba(255, 255, 255, 0) 60%,
        rgba(255, 255, 255, 0) 100%
      );
      transform: rotate(30deg);
      animation: sbShine 3s infinite linear;
    }

    @keyframes sbShine {
      0% { transform: translate(-30%, -30%) rotate(30deg); }
      100% { transform: translate(30%, 30%) rotate(30deg); }
    }
    
    .logo-icon {
      font-size: 18px;
      line-height: 1;
    }
    
    .content-wrapper {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    
    .pill-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: linear-gradient(to right, #a78bfa, #2dd4bf);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .pill-status {
      font-size: 13px;
      font-weight: 700;
      color: #f3f4f6;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .savings-badge {
      font-size: 11px;
      font-weight: 700;
      background: #10b981;
      color: #ffffff;
      padding: 1px 6px;
      border-radius: 4px;
      animation: sbPulse 2s infinite ease-in-out;
    }
    
    @keyframes sbPulse {
      0%, 100% { opacity: 0.9; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.05); }
    }

    .close-btn {
      color: rgba(255, 255, 255, 0.4);
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      margin-left: 4px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
    }
  `;

  // Pill HTML Structure
  const pill = document.createElement("div");
  pill.className = "smartbuy-pill";
  
  // Calculate a simulated discount value to display on the floating badge
  let numericPrice = parseFloat(productInfo.price.replace(/[^0-9.]/g, ""));
  let badgeText = "Best Price Analyzed";
  let showSavings = false;
  let savingsVal = "";
  const currencySymbol = productInfo.currencySymbol || "$";

  if (!isNaN(numericPrice) && numericPrice > 10) {
    showSavings = true;
    // Mock an arbitrage savings of 4% - 12%
    const savingsPercent = 0.04 + (Math.random() * 0.08);
    const rawSavings = numericPrice * savingsPercent;
    // Format high values like Rupee without decimals
    savingsVal = currencySymbol + (rawSavings > 1000 ? Math.round(rawSavings) : rawSavings.toFixed(2));
    badgeText = `Save ${Math.round(savingsPercent * 100)}% here!`;
  }

  pill.innerHTML = `
    <div class="logo-container">
      <span class="logo-icon">💸</span>
    </div>
    <div class="content-wrapper">
      <div class="pill-title">SmartBuy Scanner</div>
      <div class="pill-status">
        ${badgeText}
        ${showSavings ? `<span class="savings-badge">${savingsVal}</span>` : ""}
      </div>
    </div>
    <button class="close-btn" title="Dismiss">×</button>
  `;

  // Append styling and pill elements
  shadowRoot.appendChild(style);
  shadowRoot.appendChild(pill);

  // Click behavior: Open side panel via background channel
  pill.addEventListener("click", (e) => {
    // If clicked the close button, dismiss the pill
    if (e.target.classList.contains("close-btn")) {
      e.stopPropagation();
      host.remove();
      return;
    }
    
    // Send message to background indicating user requested to open sidepanel
    chrome.runtime.sendMessage({
      type: "OPEN_SIDEPANEL",
      product: productInfo
    });
  });
}

// Run scanner and notify background worker
function scanAndNotify() {
  const productInfo = scrapeProductDetails();
  
  // Only register and inject if we found a valid title/price (sign of a product page)
  if (productInfo.title && productInfo.price && productInfo.price !== "N/A") {
    console.log("SmartBuy Scraped product:", productInfo);
    
    // Notify background script of the scanned product
    chrome.runtime.sendMessage({
      type: "PRODUCT_DETECTED",
      data: productInfo
    }, (response) => {
      // Once registered, inject the UI helper
      injectSmartBuyPill(productInfo);
    });
  }
}

// Start processing when page is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scanAndNotify);
} else {
  scanAndNotify();
}

// Listen for dynamic updates (e.g. single page applications, URL changes, or sidepanel messages)
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Clear old pill if exists
    const oldHost = document.getElementById("smartbuy-shadow-host");
    if (oldHost) oldHost.remove();
    
    // Re-run scan with a slight delay for content to render
    setTimeout(scanAndNotify, 1000);
  }
});
observer.observe(document, { subtree: true, childList: true });
