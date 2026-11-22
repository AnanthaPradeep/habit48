# Activity Studio

Activity Studio records foreground GPS through browser geolocation. The recorder pauses when the page becomes hidden and resumes into a fresh route segment when requested. Refresh recovery stops the timer at the last durable checkpoint. GPS accuracy warnings, elapsed time and moving time describe separate measurements. Distance and splits exclude breaks between segments.

Leaflet renders recorded coordinates locally. The optional Show street map control requests visible OpenStreetMap tiles and displays attribution. This shares the viewed area with OpenStreetMap. Tiles use the standard browser HTTP cache and are excluded from the PWA offline precache. Recorded routes remain available offline.

Activities and pending mutations are stored in IndexedDB per authenticated account. The additive Supabase table uses owner-only RLS, revision-checked updates and deletes, and idempotent inserts. The browser uploads completed routes in one record and polls lightweight metadata on a timer, on focus and on reconnect. It fetches route payloads only when they are new or changed. Unsynced activity drafts stay on the recording device.

GPS and manual journal records remain separate. Activity calories describe expenditure, while journal calories describe intake. Walking personal goals use the greater of manually logged and recorded walking minutes per day, preventing the same walk from being counted twice. Activity Studio's own goals are stored on the current device.

## Native expansion

A native implementation would replace the browser geolocation adapter while retaining the route filtering, timestamp model, exports and analytics. With separate approval, evaluate Capacitor plugins and native services for Android foreground location notifications, iOS background location sessions and screen-lock recording. Apply platform permission scopes, recording indicators and cancellation controls before enabling background location. Evaluate Health Connect, HealthKit and wearables separately, with per-source consent and de-duplication. Browser-only tests cannot verify these capabilities.
