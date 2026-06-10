// SmartBuy Local Development Server (Real-Time API Mock)

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Logger middleware to print requests in real-time
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Endpoint to fetch insights
app.get('/api/insights', (req, res) => {
  const { domain, productId, price, title, imageUrl, siteName } = req.query;

  console.log(`\n>>> REAL-TIME EVENT RECEIVED <<<`);
  console.log(`Store:      ${siteName || domain}`);
  console.log(`Product ID: ${productId}`);
  console.log(`Title:      ${title}`);
  console.log(`Price:      ${price}`);
  console.log(`---------------------------------`);

  // Parse numeric price
  let basePrice = parseFloat(String(price).replace(/[^0-9.]/g, ""));
  if (isNaN(basePrice) || basePrice <= 0) {
    basePrice = 100;
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

  // 1. Generate 30 days of price history
  const priceHistory = [];
  const now = new Date();
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    // Introduce some random mock trends
    let multiplier = 1.0;
    if (i >= 10 && i <= 15) multiplier = 0.88; // 12% price dip
    else if (i >= 20 && i <= 25) multiplier = 1.10; // 10% markup
    else multiplier += (Math.sin(i / 2) * 0.03);

    priceHistory.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: parseFloat((basePrice * multiplier).toFixed(2))
    });
  }

  // 2. Generate Arbitrage Offers comparing stores
  const stores = [
    { name: "Amazon", domain: "amazon.com", logo: "📦", multiplier: 0.95 },
    { name: "Walmart", domain: "walmart.com", logo: "🛒", multiplier: 0.92 },
    { name: "eBay", domain: "ebay.com", logo: "🏷️", multiplier: 1.02 },
    { name: "Flipkart", domain: "flipkart.com", logo: "🛍️", multiplier: 0.89 }
  ];

  const arbitrageDeals = stores.map(store => {
    const isCurrent = domain.includes(store.domain);
    const storePrice = isCurrent ? basePrice : basePrice * store.multiplier;
    return {
      store: store.name,
      domain: store.domain,
      logo: store.logo,
      price: parseFloat(storePrice.toFixed(2)),
      shipping: "Free Shipping",
      stock: "In Stock",
      isCurrent: isCurrent,
      affiliateUrl: `http://localhost:3000/api/affiliate-redirect?store=${store.name.toLowerCase()}&item=${encodeURIComponent(title)}`
    };
  }).sort((a, b) => a.price - b.price);

  // 3. Generate Coupons
  const coupons = [
    { code: "SMARTBUY20", discount: "20% OFF", type: "percent", value: 0.20, description: "20% off local server discount", status: "Verified" },
    { code: "FREESHIP", discount: "FREE SHIPPING", type: "free_shipping", value: 10.00, description: "Free shipping promo code", status: "Active" }
  ];

  res.json({
    priceHistory,
    arbitrageDeals,
    coupons,
    serverConnected: true
  });
});

// Affiliate redirect mockup endpoint
app.get('/api/affiliate-redirect', (req, res) => {
  const { store, item } = req.query;
  console.log(`[AFFILIATE] Redirecting click for ${item} to ${store}...`);
  res.send(`
    <html>
      <head>
        <title>SmartBuy Affiliate Redirect</title>
        <style>
          body { background: #0a0612; color: #fff; font-family: sans-serif; text-align: center; padding-top: 100px; }
          .loader { border: 4px solid #1f1a2e; border-top: 4px solid #14b8a6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <h2>Redirecting you to ${store.toUpperCase()} via Affiliate Link...</h2>
        <p>Item: ${decodeURIComponent(item)}</p>
        <div class="loader"></div>
        <script>
          setTimeout(() => {
            window.location.href = "https://google.com/search?q=" + encodeURIComponent("${store} ${item}");
          }, 2000);
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`SmartBuy Real-Time API Server listening on port ${PORT}`);
  console.log(`Point your extension to http://localhost:${PORT}/api/insights`);
  console.log(`===================================================`);
});
