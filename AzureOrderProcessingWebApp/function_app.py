import logging
import json
import base64
import os
import requests
import azure.functions as func

app = func.FunctionApp()

@app.queue_trigger(arg_name="msg", queue_name="order-queue", connection="AzureWebJobsStorage")
def process_order(msg: func.QueueMessage) -> None:
    logging.info("--- [STEP 1/5] Queue Trigger Activated ---")
    
    # 1. Safely extract raw body
    try:
        raw_bytes = msg.get_body()
        try:
            raw_body = raw_bytes.decode('utf-8')
        except Exception:
            raw_body = base64.b64decode(raw_bytes).decode('utf-8')
            
        logging.info(f"--- [STEP 2/5] Raw Message Body: {raw_body} ---")
    except Exception as read_err:
        logging.error(f"[ERROR] Failed reading message bytes: {read_err}")
        raise read_err

    # 2. Parse JSON (handling nested stringified payloads)
    try:
        try:
            order_data = json.loads(raw_body)
        except json.JSONDecodeError:
            b64_decoded = base64.b64decode(raw_body).decode('utf-8')
            order_data = json.loads(b64_decoded)
            
        logging.info(f"--- [STEP 3/5] JSON Parsed: {order_data} ---")
    except Exception as parse_err:
        logging.error(f"[ERROR] Failed to parse JSON: {parse_err}")
        raise parse_err

    # 3. Post to Logic App
    logic_app_url = os.getenv("LOGIC_APP_URL")
    if not logic_app_url:
        raise RuntimeError("LOGIC_APP_URL app setting is not configured")
    headers = {"Content-Type": "application/json"}
    
    logging.info("--- [STEP 4/5] Sending HTTP POST to Logic App ---")
    try:
        response = requests.post(logic_app_url, json=order_data, headers=headers, timeout=15)
        logging.info(f"--- [STEP 5/5] Logic App Response Code: {response.status_code} ---")
        logging.info(f"--- Logic App Response Text: {response.text} ---")
    except requests.exceptions.RequestException as req_err:
        logging.error(f"[ERROR] Network/HTTP call failed: {req_err}")
        raise req_err
