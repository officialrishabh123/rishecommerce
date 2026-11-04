let products = [];
let cart = [];

document.addEventListener("DOMContentLoaded", () => {
    loadProducts();
});

// Fetch product catalog from backend API
async function loadProducts() {
    const grid = document.getElementById("product-grid");
    try {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error("Failed to load products");

        products = await res.json();
        renderProducts(products);
    } catch (err) {
        console.error("Error loading products:", err);
        grid.innerHTML = `<p style="color:red;">Error loading catalog. Please refresh later.</p>`;
    }
}

// Render product cards
function renderProducts(items) {
    const grid = document.getElementById("product-grid");
    if (items.length === 0) {
        grid.innerHTML = "<p>No products available.</p>";
        return;
    }

    grid.innerHTML = items.map(item => `
        <div class="product-card">
            <img src="${item.image_url}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/300x180?text=Product'">
            <div class="product-details">
                <h3 class="product-title">${item.name}</h3>
                <p class="product-desc">${item.description || ''}</p>
                <div class="product-price-row">
                    <span class="price">₹${item.price.toFixed(2)}</span>
                    <button class="btn-add" onclick="addToCart(${item.id})">Add to Cart</button>
                </div>
            </div>
        </div>
    `).join("");
}

// Cart Management
function toggleCart() {
    document.getElementById("cart-drawer").classList.toggle("open");
    document.getElementById("cart-overlay").classList.toggle("open");
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(c => c.id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    updateCartUI();
}

function updateCartUI() {
    const cartCountEl = document.getElementById("cart-count");
    const cartItemsEl = document.getElementById("cart-items");
    const cartTotalEl = document.getElementById("cart-total");

    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    cartCountEl.innerText = totalCount;
    cartTotalEl.innerText = totalPrice.toFixed(2);

    if (cart.length === 0) {
        cartItemsEl.innerHTML = "<p style='color: #64748b;'>Your cart is empty.</p>";
        return;
    }

    cartItemsEl.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div>
                <strong>${item.name}</strong><br>
                <small>Qty: ${item.quantity} × ₹${item.price.toFixed(2)}</small>
            </div>
            <span>₹${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join("");
}

// Checkout and Order Placement
async function checkout() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    const customerName = prompt("Enter your name:", "Rishabh Tiwari");
    if (!customerName) return;

    const customerEmail = prompt("Enter your email address:", "rishabh@example.com");
    if (!customerEmail) return;

    const totalAmount = parseFloat(document.getElementById("cart-total").innerText);
    const checkoutBtn = document.getElementById("checkout-btn");

    const orderData = {
        customer_name: customerName,
        customer_email: customerEmail,
        total_amount: totalAmount
    };

    try {
        checkoutBtn.disabled = true;
        checkoutBtn.innerText = "Processing...";

        const response = await fetch("/api/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (response.status === 201 || response.status === 202) {
            alert(`Order Placed Successfully!\nOrder Reference: ORD-${result.order_id}\nA confirmation email has been scheduled.`);
            cart = [];
            updateCartUI();
            toggleCart();
        } else {
            alert(`Order processing error: ${result.error || result.message}`);
        }
    } catch (err) {
        console.error("Checkout failure:", err);
        alert("Failed to submit order. Check server connection.");
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.innerText = "Checkout";
    }
}