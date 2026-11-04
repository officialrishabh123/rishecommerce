import io
import os
import pyodbc
from flask import Flask, jsonify, render_template, request, send_file, abort
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient

load_dotenv()

app = Flask(__name__)

# Azure SQL Configuration
SQL_SERVER = os.getenv("AZURE_SQL_SERVER")
SQL_DATABASE = os.getenv("AZURE_SQL_DATABASE")
SQL_USERNAME = os.getenv("AZURE_SQL_USERNAME")
SQL_PASSWORD = os.getenv("AZURE_SQL_PASSWORD")

# Azure Storage Configuration
STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT")
STORAGE_ACCOUNT_KEY = os.getenv("AZURE_STORAGE_KEY")
CONTAINER_NAME = "webapp-container"

# Initialize Blob Service Client with Storage Key
blob_service_client = None
if STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY:
    conn_str = (
        f"DefaultEndpointsProtocol=https;"
        f"AccountName={STORAGE_ACCOUNT_NAME};"
        f"AccountKey={STORAGE_ACCOUNT_KEY};"
        f"EndpointSuffix=core.windows.net"
    )
    blob_service_client = BlobServiceClient.from_connection_string(conn_str)

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

@app.route("/")
def index():
    return render_template("index.html")

# Endpoint to stream private images securely without making Blob Storage public
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
            # Clean filename in case database stored a full URL or path
            image_filename = os.path.basename(r.ImageUrl.split("?")[0]) if r.ImageUrl else "placeholder.jpg"
            
            # Point browser to your Flask streaming route instead of direct Azure Blob URL
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

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO webapp_details.Orders (CustomerName, CustomerEmail, TotalAmount, Status)
            VALUES (?, ?, ?, 'Confirmed')
            """,
            data.get("customer_name"),
            data.get("customer_email", ""),
            data.get("total_amount")
        )
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"message": "Order placed successfully!"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)