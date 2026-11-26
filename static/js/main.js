let products = [];
let cart = loadCart();
let activeCategory = "All items";
let toastTimer;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year").textContent = new Date().getFullYear();
    document.getElementById("product-search").addEventListener("input", renderProducts);
    document.getElementById("sort-products").addEventListener("change", renderProducts);
    document.getElementById("checkout-form").addEventListener("submit", submitOrder);
    document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            document.getElementById("product-search").focus();
        }
        if (event.key === "Escape") toggleCart(false);
    });
    updateCartUI();
    loadProducts();
});

function loadCart() {
    try {
        const saved = JSON.parse(localStorage.getItem("cloudstore-cart") || "[]");
        return Array.isArray(saved) ? saved.filter(item => item && Number.isFinite(item.id) && Number.isFinite(item.price) && item.quantity > 0) : [];
    } catch (_) { return []; }
}

async function loadProducts() {
    const grid = document.getElementById("product-grid");
    try {
        const response = await fetch("/api/products");
        if (!response.ok) throw new Error("Catalog request failed");
        products = await response.json();
        renderCategoryFilters();
        renderProducts();
    } catch (error) {
        console.error("Error loading products:", error);
        grid.innerHTML = '<div class="empty-state"><span>◌</span><h3>We couldn’t load the collection.</h3><p>Please try again in a moment.</p><button class="text-button" onclick="loadProducts()">Try again →</button></div>';
    }
}

function renderCategoryFilters() {
    const categories = ["All items", ...new Set(products.map(categoryForProduct))];
    const filters = document.getElementById("category-filters");
    if (!categories.includes(activeCategory)) activeCategory = "All items";
    filters.innerHTML = categories.map(category => `<button type="button" class="filter-chip ${category === activeCategory ? "active" : ""}" aria-pressed="${category === activeCategory}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("");
    filters.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => selectCategory(button.dataset.category)));
}

function categoryForProduct(product) {
    const searchable = `${product.name} ${product.description || ""}`.toLowerCase();
    if (/speaker|headphone|audio/.test(searchable)) return "Audio";
    if (/keyboard|mouse|webcam|hub|charger|charging|power bank/.test(searchable)) return "Accessories";
    return "Everyday tech";
}

function selectCategory(category) {
    activeCategory = category;
    renderCategoryFilters();
    renderProducts();
}

function renderProducts() {
    const grid = document.getElementById("product-grid");
    const query = document.getElementById("product-search").value.trim().toLowerCase();
    const sort = document.getElementById("sort-products").value;
    let visible = products.filter(product => {
        const matchesCategory = activeCategory === "All items" || categoryForProduct(product) === activeCategory;
        const matchesSearch = `${product.name} ${product.description || ""} ${product.category || ""}`.toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
    });
    if (sort === "price-low") visible.sort((a, b) => a.price - b.price);
    if (sort === "price-high") visible.sort((a, b) => b.price - a.price);
    if (sort === "name") visible.sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById("result-count").textContent = `${visible.length} ${visible.length === 1 ? "piece" : "pieces"} in the collection`;
    if (!visible.length) {
        grid.innerHTML = '<div class="empty-state"><span>⌕</span><h3>No matches this time.</h3><p>Try another search or browse all items.</p><button class="text-button" onclick="resetFilters()">Clear filters →</button></div>';
        return;
    }
    grid.innerHTML = visible.map((product, index) => {
        const outOfStock = Number(product.stock) <= 0;
        const image = product.image_url ? `<img src="${escapeHTML(product.image_url)}" alt="${escapeHTML(product.name)}" loading="lazy" onerror="this.remove()">` : "";
        return `<article class="product-card" style="--card-index:${index}">
            <div class="product-image image-tone-${index % 4}">${image}<span class="image-initials">${escapeHTML(product.name.slice(0, 1).toUpperCase())}</span><span class="product-category">${escapeHTML(categoryForProduct(product))}</span><button class="quick-add ${outOfStock ? "unavailable" : ""}" type="button" ${outOfStock ? "disabled" : ""} aria-label="${outOfStock ? "Out of stock" : `Add ${escapeHTML(product.name)} to bag`}" onclick="addToCart(${Number(product.id)})">${outOfStock ? "—" : "+"}</button></div>
            <div class="product-details"><div class="product-title-row"><h3 class="product-title">${escapeHTML(product.name)}</h3><span class="price">₹${Number(product.price).toFixed(2)}</span></div>
            <p class="product-desc">${escapeHTML(product.description || "Made to make your everyday a little better.")}</p><button class="add-link" type="button" ${outOfStock ? "disabled" : ""} onclick="addToCart(${Number(product.id)})">${outOfStock ? "Currently unavailable" : "Add to bag"} ${outOfStock ? "" : "<span>↗</span>"}</button></div>
        </article>`;
    }).join("");
}

function resetFilters() {
    document.getElementById("product-search").value = "";
    activeCategory = "All items";
    renderCategoryFilters();
    renderProducts();
}

function toggleCart(open) {
    const drawer = document.getElementById("cart-drawer");
    const shouldOpen = typeof open === "boolean" ? open : !drawer.classList.contains("open");
    drawer.classList.toggle("open", shouldOpen);
    document.getElementById("cart-overlay").classList.toggle("open", shouldOpen);
    drawer.setAttribute("aria-hidden", String(!shouldOpen));
    document.body.classList.toggle("cart-open", shouldOpen);
}

function addToCart(productId) {
    const product = products.find(item => item.id === productId);
    if (!product || product.stock <= 0) return;
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        if (existing.quantity >= product.stock) return showToast("That’s all we have in stock.");
        existing.quantity += 1;
    } else cart.push({ id: product.id, name: product.name, price: Number(product.price), stock: Number(product.stock), quantity: 1 });
    updateCartUI();
    showToast(`${product.name} added to your bag`);
}

function changeQuantity(productId, adjustment) {
    const item = cart.find(entry => entry.id === productId);
    if (!item) return;
    const product = products.find(entry => entry.id === productId);
    item.quantity = Math.min(product ? Number(product.stock) : item.stock, item.quantity + adjustment);
    if (item.quantity <= 0) cart = cart.filter(entry => entry.id !== productId);
    updateCartUI();
}

function updateCartUI() {
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    document.getElementById("cart-count").textContent = totalCount;
    document.getElementById("drawer-count").textContent = `(${totalCount})`;
    document.getElementById("cart-total").textContent = total.toFixed(2);
    document.getElementById("checkout-total").textContent = total.toFixed(2);
    document.getElementById("checkout-btn").disabled = !cart.length;
    const items = document.getElementById("cart-items");
    if (!cart.length) {
        items.innerHTML = '<div class="cart-empty"><span>⌁</span><h3>Your bag is taking a breather.</h3><p>Come across something you love?</p><button class="text-button" onclick="toggleCart(false);document.getElementById(\'catalog\').scrollIntoView({behavior:\'smooth\'})">Explore the collection →</button></div>';
    } else {
        items.innerHTML = cart.map(item => `<div class="cart-item"><div class="cart-item-main"><span class="mini-product-mark">${escapeHTML(item.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHTML(item.name)}</strong><small>₹${item.price.toFixed(2)} each</small><div class="quantity-control"><button type="button" aria-label="Decrease quantity" onclick="changeQuantity(${Number(item.id)}, -1)">−</button><span>${item.quantity}</span><button type="button" aria-label="Increase quantity" onclick="changeQuantity(${Number(item.id)}, 1)">+</button></div></div></div><button class="remove-item" type="button" aria-label="Remove ${escapeHTML(item.name)}" onclick="removeFromCart(${Number(item.id)})">×</button></div>`).join("");
    }
    localStorage.setItem("cloudstore-cart", JSON.stringify(cart));
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartUI();
}

function openCheckout() {
    if (!cart.length) return;
    document.getElementById("checkout-message").textContent = "";
    toggleCart(false);
    document.getElementById("checkout-dialog").showModal();
}

function closeCheckout() { document.getElementById("checkout-dialog").close(); }

async function submitOrder(event) {
    event.preventDefault();
    if (!cart.length) return;
    const form = event.currentTarget;
    const button = document.getElementById("place-order-btn");
    const message = document.getElementById("checkout-message");
    const orderData = {
        customer_name: form.elements.customer_name.value.trim(),
        customer_email: form.elements.customer_email.value.trim(),
        total_amount: Number(cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)),
        items: cart.map(({ id, quantity }) => ({ product_id: id, quantity }))
    };
    button.disabled = true;
    button.innerHTML = 'Placing your order <span>…</span>';
    message.textContent = "";
    try {
        const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderData) });
        const result = await response.json();
        if (!response.ok && response.status !== 202) throw new Error(result.error || result.message || "We couldn’t place your order.");
        const orderNumber = result.order_id ? `ORD-${result.order_id}` : "confirmed";
        cart = [];
        updateCartUI();
        closeCheckout();
        form.reset();
        showToast(`Thanks! Your order ${orderNumber} is in.`);
    } catch (error) {
        message.textContent = error.message || "We couldn’t reach the store. Please try again.";
        message.classList.add("error");
    } finally {
        button.disabled = false;
        button.innerHTML = 'Place order <span>→</span>';
    }
}

function showToast(text) {
    const toast = document.getElementById("toast");
    toast.textContent = text;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
