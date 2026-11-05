import io
import os
import json
import logging
import pyodbc
from flask import Flask, jsonify, render_template, request, send_file, abort
from azure.storage.blob import BlobServiceClient
from azure.storage.queue import QueueClient, BinaryBase64EncodePolicy

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# --- Azure SQL Configuration ---
SQL_SERVER = os.getenv("AZURE_SQL_SERVER")
SQL_DATABASE = os.getenv("AZURE_SQL_DATABASE")
SQL_USERNAME = os.getenv("AZURE_SQL_USERNAME")
SQL_PASSWORD = os.getenv("AZURE_SQL_PASSWORD")

# --- Azure Blob Storage Configuration ---
STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT")
STORAGE_ACCOUNT_KEY = os.getenv("AZURE_STORAGE_KEY")
CONTAINER_NAME = "webapp-container"

# --- Azure Queue Configuration ---
ASC_STRING_ORDER_QUEUE = os.getenv("ASC_STRING_ORDER_QUEUE")
ORDER_QUEUE_NAME = os.getenv("ORDER_QUEUE_NAME", "order-queue")

# Initialize Blob Service Client
blob_service_client = None
if STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY:
    conn_str = (
        f"DefaultEndpointsProtocol=https;"
        f"AccountName={STORAGE_ACCOUNT_NAME};"
        f"AccountKey={STORAGE_ACCOUNT_KEY};"
        f"EndpointSuffix=core.windows.net"
    )
    blob_service_client = BlobServiceClient.from_connection_string(conn_str)

# Initialize Queue Client with Base64 encoding enabled
queue_client = None
if ASC_STRING_ORDER_QUEUE:
    try:
        queue_client = QueueClient.from_connection_string(
            conn_str=ASC_STRING_ORDER_QUEUE,
            queue_name=ORDER_QUEUE_NAME,
            message_encode_policy=BinaryBase64EncodePolicy()
        )
    except Exception as e:
        logger.error(f"Failed to initialize QueueClient: {e}")


def get_db_connection():
    conn_str = (
        f"Driver={{ODBC Driver 18 for SQL Server}};"
        f"Server=tcp:{SQL_SERVER},1433;"
        f"Database={SQL_DATABASE};"
        f"Uid={SQL_USERNAME};"
        f"Pwd={SQL_PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=no;"
        f"Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)


def enqueue_order(order_payload: dict) -> None:
    """Serializes the order payload to JSON bytes and enqueues to Azure Storage Queue."""

    logger.info(f"Queue Client: {queue_client}")
    if not queue_client:
        raise RuntimeError("Azure Queue Client is not initialized. Check AZURE_STORAGE_CONNECTION_STRING.")
    
    # BinaryBase64EncodePolicy expects bytes
    message_bytes = json.dumps(order_payload).encode("utf-8")
    queue_client.send_message(message_bytes)
    logger.info(f"Successfully enqueued order {order_payload.get('order_id')} to {ORDER_QUEUE_NAME}")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/images/<path:filename>", methods=["GET"])
def get_image(filename):
    if not blob_service_client:
        abort(500, description="Storage client not configured")
    try:
        blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=filename)
        stream = blob_client.download_blob().readall()
        return send_file(io.BytesIO(stream), mimetype="image/jpeg")
    except Exception as e:
        app.logger.exception(f"Failed to fetch image: {filename}")
        abort(404)


@app.route("/api/products", methods=["GET"])
def get_products():
    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT ProductID, Name, Description, Price,
                   StockQuantity, ImageUrl
            FROM webapp_details.Products
        """)

        rows = cursor.fetchall()
        products = []

        for r in rows:
            image_filename = os.path.basename(r.ImageUrl.split("?")[0]) if r.ImageUrl else "placeholder.jpg"
            secure_image_url = f"/api/images/{image_filename}"
        
            products.append({
                "id": r.ProductID,
                "name": r.Name,
                "description": r.Description,
                "price": float(r.Price),
                "stock": r.StockQuantity,
                "image_url": secure_image_url
            })
        return jsonify(products), 200

    except Exception as e:
        app.logger.exception("Error fetching products")
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/api/orders", methods=["POST"])
def place_order():
    data = request.get_json()
    if not data or not data.get("customer_name") or not data.get("total_amount"):
        return jsonify({"error": "Invalid order payload"}), 400

    customer_name = data.get("customer_name")
    customer_email = data.get("customer_email", "")
    total_amount = float(data.get("total_amount"))

    conn = None
    cursor = None
    order_id = None

    # 1. Insert into Azure SQL and fetch the auto-generated OrderID
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO webapp_details.Orders (CustomerName, CustomerEmail, TotalAmount, Status)
            OUTPUT INSERTED.OrderID
            VALUES (?, ?, ?, 'Confirmed')
            """,
            customer_name,
            customer_email,
            total_amount
        )
        row = cursor.fetchone()
        order_id = row[0] if row else None
        conn.commit()
        logger.info(f"Order committed to DB. OrderID: {order_id}")

    except Exception as db_err:
        if conn:
            conn.rollback()
        logger.error(f"Database insertion error: {db_err}")
        return jsonify({"error": "Failed to save order to database"}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    # 2. Build the alert payload and push to Storage Queue
    queue_payload = {
        "order_id": f"ORD-{order_id}",
        "customer_name": customer_name,
        "email": customer_email,
        "amount": total_amount
    }

    try:
        enqueue_order(queue_payload)
    except Exception as queue_err:
        logger.error(f"Order {order_id} recorded in DB, but failed to enqueue: {queue_err}")
        return jsonify({
            "status": "partial_success",
            "message": "Order recorded, but notification processing could not be scheduled.",
            "order_id": order_id
        }), 202

    return jsonify({
        "status": "success",
        "message": "Order placed successfully!",
        "order_id": order_id
    }), 201   

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
