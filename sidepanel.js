// SmartBuy: Side Panel Logic

document.addEventListener("DOMContentLoaded", () => {
  // UI Element Selectors
  const emptyState = document.getElementById("empty-state");
  const activeState = document.getElementById("active-state");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  // Product Elements
  const productImg = document.getElementById("product-img");
  const productStore = document.getElementById("product-store");
  const productTitle = document.getElementById("product-title");
  const productPrice = document.getElementById("product-price");

  // Cashback Elements
  const btnActivateCashback = document.getElementById("btn-activate-cashback");
  const cashbackRate = document.getElementById("cashback-rate");
  const affiliateStatusBox = document.getElementById("affiliate-status-box");
  const subAffiliateId = document.getElementById("sub-affiliate-id");
  const affiliateProgress = document.getElementById("affiliate-progress");

  // Analytics Elements
  const priceLowest = document.getElementById("price-lowest");
  const priceHighest = document.getElementById("price-highest");
  const priceAverage = document.getElementById("price-average");
  const priceChart = document.getElementById("price-chart");
  const chartTooltip = document.getElementById("chart-tooltip");

  // Arbitrage / Coupon Elements
  const dealsList = document.getElementById("deals-list");
  const couponCount = document.getElementById("coupon-count");
  const btnApplyCoupons = document.getElementById("btn-apply-coupons");
  const couponConsole = document.getElementById("coupon-console");
  const consoleStatus = document.getElementById("console-status");
  const consoleLogs = document.getElementById("console-logs");

  let activeProduct = null;
  let activeAnalytics = null;

  // Initialize: Fetch details of current product
  chrome.runtime.sendMessage({ type: "GET_PRODUCT_DETAILS" }, (response) => {
    if (response && response.product) {
      handleProductUpdate(response.product);
    } else {
      showEmptyState();
    }
  });

  // Listen for updates from background service worker (e.g. tab changed or product scanned)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "PRODUCT_UPDATED") {
      handleProductUpdate(message.data);
    } else if (message.type === "AFFILIATE_ACTIVATED") {
      handleAffiliateActivated(message.data);
    }
  });

  function showEmptyState() {
    emptyState.classList.remove("hidden");
    activeState.classList.add("hidden");
    statusDot.className = "pulse-dot grey";
    statusText.textContent = "Scanning for products...";
  }

  function handleProductUpdate(product) {
    if (!product || !product.title || product.price === "N/A") {
      showEmptyState();
      return;
    }

    activeProduct = product;
    emptyState.classList.add("hidden");
    activeState.classList.remove("hidden");

    // Update Connection Header
    statusDot.className = "pulse-dot green";
    statusText.textContent = `Connected to ${product.siteName || product.domain}`;

    // Render Product Summary Card
    productImg.src = product.imageUrl || "icons/icon48.png";
    productStore.textContent = product.siteName || "Store";
    productTitle.textContent = product.title;
    productPrice.textContent = product.price;

    // Reset buttons and consoles for new product
    resetCashbackUI();
    resetCouponUI();

    // Fetch Price History and Deals Analytics
    chrome.runtime.sendMessage({ type: "FETCH_ANALYTICS", product }, (analytics) => {
      if (analytics) {
        activeAnalytics = analytics;
        renderAnalytics(analytics);
        renderDeals(analytics.arbitrageDeals);
        renderCoupons(analytics.coupons);
      }
    });
  }

  // --- MOCK AFFILIATE / CASHBACK ENGINE ---

  function resetCashbackUI() {
    btnActivateCashback.disabled = false;
    btnActivateCashback.querySelector(".btn-text").classList.remove("hidden");
    btnActivateCashback.querySelector(".btn-loading").classList.add("hidden");
    affiliateStatusBox.classList.add("hidden");
    affiliateProgress.style.width = "0%";
    
    // Generate a random cashback percentage rate (e.g. 3.0% to 7.5%)
    const randomRate = (3.0 + Math.random() * 4.5).toFixed(1);
    cashbackRate.textContent = `${randomRate}% rate`;
    btnActivateCashback.querySelector(".btn-text").textContent = `Activate ${randomRate}% Cashback`;
  }

  btnActivateCashback.addEventListener("click", () => {
    if (!activeProduct) return;

    // Transition button to loading state
    btnActivateCashback.disabled = true;
    btnActivateCashback.querySelector(".btn-text").classList.add("hidden");
    btnActivateCashback.querySelector(".btn-loading").classList.remove("hidden");

    // Notify background script to simulate sub-affiliate URL rewriting
    chrome.runtime.sendMessage({
      type: "ACTIVATE_AFFILIATE",
      url: activeProduct.url,
      domain: activeProduct.domain
    });
  });

  function handleAffiliateActivated(data) {
    if (!data.success) return;

    btnActivateCashback.querySelector(".btn-loading").classList.add("hidden");
    
    const activeText = document.createElement("span");
    activeText.className = "btn-text";
    activeText.innerHTML = "✓ Cashback Activated";
    btnActivateCashback.appendChild(activeText);

    // Reveal progress & sub-tracking ID details
    affiliateStatusBox.classList.remove("hidden");
    subAffiliateId.textContent = data.subTrackingId;
    
    // Fill the progress bar
    setTimeout(() => {
      affiliateProgress.style.width = "100%";
    }, 100);
  }

  // --- PRICE HISTORY GRAPH (SVG SCALING ENGINE) ---

  function renderAnalytics(analytics) {
    const history = analytics.priceHistory;
    if (!history || history.length === 0) return;

    // Calculate low, high, average prices
    const prices = history.map(h => h.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Print values
    const currencySymbol = activeProduct.currencySymbol || "$";
    priceLowest.textContent = `${currencySymbol}${minPrice.toFixed(2)}`;
    priceHighest.textContent = `${currencySymbol}${maxPrice.toFixed(2)}`;
    priceAverage.textContent = `${currencySymbol}${avgPrice.toFixed(2)}`;

    // Draw SVG Chart
    drawPriceChart(history, minPrice, maxPrice);
  }

  function drawPriceChart(history, minPrice, maxPrice) {
    // Canvas dimensions
    const width = 320;
    const height = 160;
    
    // Margins to fit labels
    const paddingLeft = 40;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 20;

    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;

    // Clear existing children from SVG (keep defs)
    const defs = priceChart.querySelector("defs");
    priceChart.innerHTML = "";
    if (defs) priceChart.appendChild(defs);

    // Calculate Y Axis Bounds with a little padding (10% headroom/floor)
    const priceDiff = maxPrice - minPrice;
    const yMin = Math.max(0, minPrice - (priceDiff * 0.1 || minPrice * 0.1));
    const yMax = maxPrice + (priceDiff * 0.1 || maxPrice * 0.1);
    const yRange = yMax - yMin;

    const pointsCount = history.length;

    // Map historical price coordinates to screen layout coordinates
    const coords = history.map((item, idx) => {
      const x = paddingLeft + (idx / (pointsCount - 1)) * graphWidth;
      // Invert Y coordinate since screen (0,0) is top-left
      const y = paddingTop + graphHeight - ((item.price - yMin) / yRange) * graphHeight;
      return { x, y, price: item.price, date: item.date };
    });

    // 1. Draw horizontal grid lines and prices
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const yVal = yMin + (i / gridCount) * yRange;
      const yPos = paddingTop + graphHeight - (i / gridCount) * graphHeight;

      // Dotted horizontal grid line
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", paddingLeft);
      line.setAttribute("y1", yPos);
      line.setAttribute("x2", width - paddingRight);
      line.setAttribute("y2", yPos);
      line.setAttribute("class", "chart-grid");
      priceChart.appendChild(line);

      // Grid Y labels
      const currencySymbol = activeProduct.currencySymbol || "$";
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", paddingLeft - 6);
      text.setAttribute("y", yPos + 3);
      text.setAttribute("text-anchor", "end");
      text.setAttribute("class", "chart-axis-text");
      text.textContent = `${currencySymbol}${yVal.toFixed(0)}`;
      priceChart.appendChild(text);
    }

    // 2. Draw dates on X Axis (4 intervals)
    const xIntervals = 3;
    for (let i = 0; i <= xIntervals; i++) {
      const idx = Math.min(pointsCount - 1, Math.round((i / xIntervals) * (pointsCount - 1)));
      const coord = coords[idx];

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", coord.x);
      text.setAttribute("y", height - 6);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "chart-axis-text");
      text.textContent = coord.date;
      priceChart.appendChild(text);
    }

    // 3. Generate Chart Line and Glow Gradient Area
    let pathD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      pathD += ` L ${coords[i].x} ${coords[i].y}`;
    }

    // Gradient Area Path
    const areaD = `${pathD} L ${coords[coords.length - 1].x} ${paddingTop + graphHeight} L ${coords[0].x} ${paddingTop + graphHeight} Z`;

    // Append Area SVG
    const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    areaPath.setAttribute("d", areaD);
    areaPath.setAttribute("class", "chart-area");
    priceChart.appendChild(areaPath);

    // Append Trendline SVG
    const linePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    linePath.setAttribute("d", pathD);
    linePath.setAttribute("class", "chart-line");
    priceChart.appendChild(linePath);

    // 4. Append Interactive Hover Nodes
    // Draw circles for 7 key points (spread out evenly) to keep UI clean
    const step = Math.ceil(pointsCount / 8);
    coords.forEach((coord, idx) => {
      if (idx % step === 0 || idx === pointsCount - 1) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", coord.x);
        circle.setAttribute("cy", coord.y);
        circle.setAttribute("r", 3.5);
        circle.setAttribute("class", "chart-point");
        
        // Show tooltip on hover
        circle.addEventListener("mouseenter", (e) => {
          const currencySymbol = activeProduct.currencySymbol || "$";
          chartTooltip.innerHTML = `<strong>${currencySymbol}${coord.price.toFixed(2)}</strong><br>${coord.date}`;
          chartTooltip.classList.remove("hidden");
          
          // Position tooltip
          const rect = priceChart.getBoundingClientRect();
          const xOffset = coord.x - rect.left - 30; // center tooltip
          const yOffset = coord.y - rect.top - 40; // place above node
          
          chartTooltip.style.left = `${coord.x - 45}px`;
          chartTooltip.style.top = `${coord.y - 45}px`;
        });

        circle.addEventListener("mouseleave", () => {
          chartTooltip.classList.add("hidden");
        });

        priceChart.appendChild(circle);
      }
    });
  }

  // --- SMART ARBITRAGE RENDERER ---

  function renderDeals(deals) {
    dealsList.innerHTML = "";
    if (!deals || deals.length === 0) {
      dealsList.innerHTML = `<p class="section-desc">No alternative deals found.</p>`;
      return;
    }

    const currencySymbol = activeProduct.currencySymbol || "$";

    // Determine the cheapest store
    const lowestPrice = Math.min(...deals.map(d => d.price));

    deals.forEach((deal) => {
      const isCheapest = deal.price === lowestPrice && !deal.isCurrent;
      const dealEl = document.createElement("div");
      dealEl.className = `deal-item ${isCheapest ? "cheapest" : ""}`;

      dealEl.innerHTML = `
        <div class="deal-store-info">
          <span class="deal-logo">${deal.logo}</span>
          <div class="deal-store-name">
            <span>
              ${deal.store}
              ${deal.isCurrent ? '<span class="cheapest-badge" style="background:#4b5563;">Current</span>' : ""}
              ${isCheapest ? '<span class="cheapest-badge">Cheapest</span>' : ""}
            </span>
            <span class="deal-shipping">${deal.shipping} • ${deal.stock}</span>
          </div>
        </div>
        <div class="deal-price-area">
          <span class="deal-price">${currencySymbol}${deal.price.toFixed(2)}</span>
          <a href="${deal.affiliateUrl}" target="_blank" class="deal-link" title="Open Store Deal">➔</a>
        </div>
      `;
      dealsList.appendChild(dealEl);
    });
  }

  // --- AUTOMATED COUPONS ENGINE ---

  function renderCoupons(coupons) {
    couponCount.textContent = `${coupons ? coupons.length : 0} found`;
  }

  function resetCouponUI() {
    btnApplyCoupons.disabled = false;
    btnApplyCoupons.textContent = "Auto-Apply Coupons";
    couponConsole.classList.add("hidden");
    consoleLogs.innerHTML = "";
    consoleStatus.textContent = "Ready";
  }

  btnApplyCoupons.addEventListener("click", () => {
    if (!activeAnalytics || !activeAnalytics.coupons) return;
    
    btnApplyCoupons.disabled = true;
    btnApplyCoupons.textContent = "Testing Coupons...";
    couponConsole.classList.remove("hidden");
    consoleStatus.textContent = "RUNNING";
    consoleLogs.innerHTML = "";

    const currencySymbol = activeProduct.currencySymbol || "$";
    const logs = [
      { type: "info", text: "Initializing coupon auto-apply engine..." },
      { type: "info", text: `Found ${activeAnalytics.coupons.length} coupons in database.` },
      { type: "info", text: "Opening checkout coupon field listener..." },
      
      { type: "test", code: "SMARTBUY15", delay: 1000 },
      { type: "success", text: "✓ Coupon SMARTBUY15 applied! Saved 15%." },
      
      { type: "test", code: "WELCOME10", delay: 2200 },
      { type: "info", text: "→ Code WELCOME10 is invalid or yields inferior discount. Skipping." },
      
      { type: "test", code: "SHIPFREE", delay: 3400 },
      { type: "info", text: "→ Code SHIPFREE applied! Added free shipping." },
      
      { type: "test", code: "SUPERDEAL30", delay: 4600 },
      { type: "error", text: `✗ Code SUPERDEAL30 failed: Minimum order threshold of ${currencySymbol}150 not met.` },
      
      { type: "success", text: "✓ Optimization completed. Combined best savings: SMARTBUY15 + SHIPFREE." },
      { type: "success", text: `🎉 Total Order Discount Saved: ${currencySymbol}15.50!` }
    ];

    let logIndex = 0;

    function runLogQueue() {
      if (logIndex >= logs.length) {
        consoleStatus.textContent = "COMPLETED";
        btnApplyCoupons.textContent = "Coupons Applied!";
        return;
      }

      const log = logs[logIndex];
      const logLine = document.createElement("div");
      logLine.className = `log-line ${log.type}`;

      if (log.type === "test") {
        logLine.innerHTML = `<span style="color:#e9d5ff;">[TRYING]</span> Code <span style="color:#ffffff;font-weight:700;">${log.code}</span>...`;
        consoleLogs.appendChild(logLine);
        logIndex++;
        // Simulate delay for applying codes
        setTimeout(runLogQueue, 800);
      } else {
        logLine.textContent = log.text;
        consoleLogs.appendChild(logLine);
        
        // Auto scroll console
        couponConsole.querySelector(".console-body").scrollTop = consoleLogs.scrollHeight;
        
        logIndex++;
        setTimeout(runLogQueue, 600);
      }
    }

    runLogQueue();
  });
});
