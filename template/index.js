<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure CloudStore</title>
    <link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
    <header class="navbar">
        <div class="container nav-content">
            <h1 class="logo">CloudStore</h1>
            <button class="cart-btn" onclick="toggleCart()">
                Cart (<span id="cart-count">0</span>)
            </button>
        </div>
    </header>

    <main class="container">
        <h2>Featured Products</h2>
        <div id="product-grid" class="product-grid">
            <p>Loading products...</p>
        </div>
    </main>

    <!-- Side Cart Drawer -->
    <aside id="cart-drawer" class="cart-drawer">
        <div class="cart-header">
            <h3>Your Cart</h3>
            <button class="close-btn" onclick="toggleCart()">&times;</button>
        </div>
        <div id="cart-items" class="cart-items">
            <!-- Dynamic Cart Items -->
        </div>
        <div class="cart-footer">
            <p><strong>Total: ₹<span id="cart-total">0.00</span></strong></p>
            <button id="checkout-btn" class="btn-checkout" onclick="checkout()">Checkout</button>
        </div>
    </aside>

    <!-- Cart Overlay Backdrop -->
    <div id="cart-overlay" class="cart-overlay" onclick="toggleCart()"></div>

    <script src="/static/js/main.js"></script>
</body>
</html>