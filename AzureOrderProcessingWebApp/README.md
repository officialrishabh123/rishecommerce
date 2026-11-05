# AzureOrderProcessingWebApp

Python Azure Functions queue processor. `process_order` listens on the `order-queue` queue using the `AzureWebJobsStorage` app setting.

## Required Function App settings

- `AzureWebJobsStorage`: connection string or supported identity-based storage configuration for the queue trigger.
- `LOGIC_APP_URL`: the Logic App HTTP trigger URL. Keep its signature in the Function App setting, not in source control.

## Container image

The `Dockerfile` uses the Azure Functions v4 Python 3.11 base image. Build it from this directory so `host.json`, `function_app.py`, and `requirements.txt` are at the image root.

The current `WebAppOrderFunction` is on Linux Y1 Consumption, so the Azure Pipelines default deploys a ZIP package with an Azure CLI remote build. To deploy this Docker image to Azure Functions, first move the Function App to a Linux Premium or Dedicated plan, then set `functionDeploymentMode` to `container` in `azure-pipelines.yml`.
