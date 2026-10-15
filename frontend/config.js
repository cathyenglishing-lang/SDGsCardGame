// Local development API base. `?api=http://127.0.0.1:8001` overrides it for testing against another backend port.
window.CARDLEARN_API_BASE_URL = new URLSearchParams(location.search).get("api") || window.CARDLEARN_API_BASE_URL || "http://127.0.0.1:8000";
