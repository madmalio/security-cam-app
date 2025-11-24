self.addEventListener("push", function (event) {
  if (!event.data) return;

  // 1. Try to parse JSON, fallback to text if it fails
  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: "CamView Alert", body: event.data.text() };
  }

  const title = payload.title || "CamView Alert";
  const camId = payload.camId || "";

  // 2. Construct the Deep Link URL
  // This opens the dashboard in "Single View" for the specific camera
  const openUrl = camId ? `/?dashboardView=single&camId=${camId}` : "/";

  const options = {
    body: payload.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: {
      url: openUrl, // Save the URL to data
      dateOfArrival: Date.now(),
    },
    actions: [{ action: "view", title: "Live View" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  // 3. Get the URL we saved in the data object
  const targetUrl = event.notification.data.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // If a tab is already open, focus it and navigate
        for (let i = 0; i < clientList.length; i++) {
          let client = clientList[i];
          if (client.url && "focus" in client) {
            client.focus();
            // Force navigation to the specific camera view
            return client.navigate(targetUrl);
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
