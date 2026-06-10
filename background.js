// SmartBuy: Background Service Worker (Manifest V3)

// Configure the side panel to open when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

// Store active product details in memory and chrome.storage
let activeProducts = {}; // Keyed by tabId

// Listen for messages from content.js and sidepanel.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (message.type === "OPEN_SIDEPANEL") {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function" && tabId !== null) {
      chrome.sidePanel.open({ tabId: tabId })
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error("Error opening side panel:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep channel open
    } else {
      sendResponse({ success: false, error: "Side panel open not supported." });
    }
  }

  else if (message.type === "PRODUCT_DETECTED") {
    // Save product data for this tab
    const productData = {
      ...message.data,
      tabId: tabId,
      timestamp: Date.now()
    };
    activeProducts[tabId] = productData;

    // Save in storage so side panel can read it
    chrome.storage.local.set({ currentProduct: productData }, () => {
      console.log("Product saved in storage:", productData);
    });

    // Notify any open side panel of the new product
    chrome.runtime.sendMessage({
      type: "PRODUCT_UPDATED",
      data: productData
    }).catch(() => {
      // Ignore errors when sidepanel is not open
    });

    sendResponse({ success: true });
  } 
  
  else if (message.type === "GET_PRODUCT_DETAILS") {
    // Fetch product details for requested tab or current active one
    chrome.storage.local.get(["currentProduct"], (result) => {
      sendResponse({ product: result.currentProduct || null });
    });
    return true; // Keep message channel open for async response
  } 
  
  else if (message.type === "FETCH_ANALYTICS") {
    const product = message.product;
    if (!product) {
      sendResponse({ error: "No product provided" });
      return;
    }

    const queryParams = new URLSearchParams({
      domain: product.domain || "",
      productId: product.productId || "",
      price: product.price || "",
      title: product.title || "",
      imageUrl: product.imageUrl || "",
      siteName: product.siteName || ""
    });

    // Fetch from local backend server (real-time connection)
    fetch(`http://localhost:3000/api/insights?${queryParams.toString()}`)
      .then(res => res.json())
      .then(data => {
        console.log("Real-time API response received:", data);
        sendResponse(data);
      })
      .catch(err => {
        console.warn("Backend server offline. Falling back to local mock data.", err.message);
        // Fallback to local simulations
        const priceHistory = generateMockPriceHistory(product.price);
        const arbitrageDeals = generateMockArbitrage(product);
        const coupons = generateMockCoupons(product);

        sendResponse({
          priceHistory,
          arbitrageDeals,
          coupons
        });
      });

    return true; // Keep channel open for async response
  } 
  
  else if (message.type === "ACTIVATE_AFFILIATE") {
    const { url, domain } = message;
    
    // Simulate VigLink/Skimlinks redirect tracking link generation
    const subTrackingId = "sb_" + Math.random().toString(36).substring(2, 11);
    const affiliateUrl = `https://redirect.sovrn.com/click?key=8cbd87d6cfcf85b7e&out=${encodeURIComponent(url)}&subid=${subTrackingId}`;
    const commissionRate = (2.5 + Math.random() * 6.5).toFixed(1); // 2.5% to 9.0%

    // Simulate network delay
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: "AFFILIATE_ACTIVATED",
        data: {
          success: true,
          affiliateUrl,
          subTrackingId,
          commissionRate,
          timestamp: Date.now()
        }
      }).catch(() => {});
    }, 1500);

    sendResponse({ success: true, message: "Activation initiated" });
  }
});

// Help clean up when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeProducts[tabId]) {
    delete activeProducts[tabId];
  }
});

// --- HELPER MOCK GENERATORS ---

function generateMockPriceHistory(currentPrice) {
  // Parse numeric price
  let basePrice = parseFloat(String(currentPrice).replace(/[^0-9.]/g, ""));
  if (isNaN(basePrice) || basePrice <= 0) {
    basePrice = 120.00; // Fallback
  }

  const history = [];
  const now = new Date();
  
  // Create 30 days of price data
  // We want to simulate a price dip recently so smart arbitrage looks compelling!
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    
    let priceMultiplier = 1.0;
    
    // Let's create an interesting trend:
    // Days 25-20: high price
    // Days 15-10: dip
    // Days 5-2: slightly higher
    // Day 0: current price
    if (i >= 20 && i <= 25) {
      priceMultiplier = 1.15; // 15% higher
    } else if (i >= 10 && i <= 15) {
      priceMultiplier = 0.90; // 10% lower (price dip!)
    } else if (i >= 2 && i <= 5) {
      priceMultiplier = 1.05; // 5% higher
    } else if (i === 0) {
      priceMultiplier = 1.0; // exact current
    } else {
      // Add random small fluctuations
      priceMultiplier = 1.0 + (Math.sin(i / 2) * 0.04) + (Math.cos(i / 5) * 0.02);
    }
    
    const calculatedPrice = (basePrice * priceMultiplier).toFixed(2);
    history.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: parseFloat(calculatedPrice)
    });
  }
  
  return history;
}

function generateMockArbitrage(product) {
  const currentDomain = product.domain || "";
  let basePrice = parseFloat(String(product.price).replace(/[^0-9.]/g, ""));
  if (isNaN(basePrice) || basePrice <= 0) {
    basePrice = 120.00;
  }

  const stores = [
    { name: "Amazon", domain: "amazon.com", logo: "📦" },
    { name: "Walmart", domain: "walmart.com", logo: "🛒" },
    { name: "eBay", domain: "ebay.com", logo: "🏷️" },
    { name: "Flipkart", domain: "flipkart.com", logo: "🛍️" }
  ];

  const deals = [];
  
  stores.forEach((store) => {
    // Don't show the store we are currently browsing as a deal (or show it as "Current")
    const isCurrent = currentDomain.includes(store.domain);
    
    let storePrice;
    let shipping = "Free Shipping";
    let stock = "In Stock";
    
    if (isCurrent) {
      storePrice = basePrice;
    } else {
      // Adjust price to create arbitrage opportunities
      // e.g. let one store be 8% cheaper, another 4% more expensive
      if (store.name === "Amazon") {
        storePrice = basePrice * 0.96; // 4% cheaper
      } else if (store.name === "Walmart") {
        storePrice = basePrice * 0.92; // 8% cheaper
      } else if (store.name === "Flipkart") {
        storePrice = basePrice * 0.88; // 12% cheaper
      } else {
        storePrice = basePrice * 1.03; // 3% more expensive
      }
      
      // Add minor random noise
      storePrice += (Math.random() - 0.5) * 2;
    }
    
    deals.push({
      store: store.name,
      domain: store.domain,
      logo: store.logo,
      price: parseFloat(storePrice.toFixed(2)),
      shipping: shipping,
      stock: stock,
      isCurrent: isCurrent,
      affiliateUrl: `https://smartbuy-arbitrage-redirect.com/deal?store=${store.name.toLowerCase()}&item=${encodeURIComponent(product.title)}`
    });
  });

  // Sort deals: cheapest first
  return deals.sort((a, b) => a.price - b.price);
}

function generateMockCoupons(product) {
  let basePrice = parseFloat(String(product.price).replace(/[^0-9.]/g, ""));
  if (isNaN(basePrice) || basePrice <= 0) {
    basePrice = 100;
  }

  // Create standard coupon sets that can be auto-tested
  return [
    { code: "SMARTBUY15", discount: "15% OFF", type: "percent", value: 0.15, description: "15% off storewide coupon", status: "Verified" },
    { code: "WELCOME10", discount: "10% OFF", type: "percent", value: 0.10, description: "10% off new customer discount", status: "Verified" },
    { code: "SHIPFREE", discount: "FREE SHIPPING", type: "free_shipping", value: 7.99, description: "Free standard shipping on all orders", status: "Active" },
    { code: "SUPERDEAL30", discount: "$30.00 OFF", type: "fixed", value: 30.00, description: "$30 off orders above $150", minSpend: 150, status: "Rare" }
  ];
}
