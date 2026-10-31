// Old address /app/ → the app now lives at the home page. Keeps login links (#access_token=…) working.
location.replace("/" + location.search + location.hash);
