self.addEventListener("push", (event) => {
  let payload = {
    title: "PetTapBR",
    body: "Voce recebeu uma nova notificacao.",
    url: "/dashboard",
    tag: "pettapbr-alert",
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = {
        ...payload,
        ...data,
      };
    } catch {
      const text = event.data.text();
      if (text) {
        payload.body = text;
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: payload.tag,
      data: {
        url: payload.url || "/dashboard",
      },
      renotify: true,
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
