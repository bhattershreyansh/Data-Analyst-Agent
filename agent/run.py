import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    # We run app.main:app pointing to our new app package structure
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
